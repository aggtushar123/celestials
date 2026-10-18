import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer from '../../features/customers/customersSlice';
import { EntityUploadsPage } from './EntityUploadsPage';

// Integration tier (see the `testing` skill): no new backend endpoint —
// each mapped row POSTs to the real /customers/ endpoint via the same
// createCustomer thunk OrganizationFormModal's own "Add Organization"
// uses, so only the fetch boundary needs mocking (same convention as
// List.test.tsx's own Add/Edit tests).

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function csvFile(contents: string, name = 'orgs.csv') {
  return new File([contents], name, { type: 'text/csv' });
}

/** A Results count is a meta part whose figure is its own span: match the part by its whole text. */
const said = (pattern: RegExp) => (_: string, el: Element | null) => el?.tagName === 'SPAN' && el.parentElement?.tagName !== 'SPAN' && pattern.test(el.textContent ?? '');

function renderPage() {
  const store = configureStore({ reducer: { customers: customersReducer } });
  render(
    <Provider store={store}>
      <EntityUploadsPage />
    </Provider>
  );
}

describe('EntityUploadsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a CSV, auto-maps recognizable columns, and shows a preview', async () => {
    const user = userEvent.setup();
    renderPage();

    const file = csvFile('Name,Domain\nGlobex,globex.com\nInitech,initech.com');
    await user.upload(screen.getByLabelText('Choose a CSV file'), file);

    expect(await screen.findByRole('region', { name: 'Map columns' })).toHaveTextContent('orgs.csv · 2 rows');
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('globex.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 2 organizations' })).not.toHaveAttribute('aria-disabled');
  });

  it('disables Import until a column is mapped to Name', async () => {
    const user = userEvent.setup();
    renderPage();

    // No header looks like "name" at all, so every column auto-maps to skip.
    const file = csvFile('Website,City\nglobex.com,Chicago');
    await user.upload(screen.getByLabelText('Choose a CSV file'), file);

    await screen.findByText(/1 row/);
    expect(screen.getByText('Map a column to "Name" to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import 1 organization/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('imports each row as a real POST /customers/, reporting per-row success', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(201, { id: 1, name: 'Globex' }))) as ReturnType<
      typeof vi.fn<(url: string, options?: { method?: string; body?: string }) => Promise<ReturnType<typeof jsonResponse>>>
    >;
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    const file = csvFile('Name\nGlobex\nInitech');
    await user.upload(screen.getByLabelText('Choose a CSV file'), file);
    await screen.findByRole('region', { name: 'Map columns' });

    await user.click(screen.getByRole('button', { name: 'Import 2 organizations' }));

    expect(await screen.findByText(said(/^2 created/))).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toEqual({ name: 'Globex' });
  });

  it("a row that fails doesn't block the others, and is reported with the server's own error", async () => {
    const fetchMock = vi.fn((_url: string, options?: { body?: string }) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      if (body.name === 'Bad Co') {
        return Promise.resolve(jsonResponse(400, { name: ['A customer with this name already exists.'] }));
      }
      return Promise.resolve(jsonResponse(201, { id: 1, name: body.name }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    const file = csvFile('Name\nGood Co\nBad Co');
    await user.upload(screen.getByLabelText('Choose a CSV file'), file);
    await screen.findByRole('region', { name: 'Map columns' });
    await user.click(screen.getByRole('button', { name: 'Import 2 organizations' }));

    expect(await screen.findByText(said(/^1 created/))).toBeInTheDocument();
    expect(screen.getByText(said(/^1 failed$/))).toBeInTheDocument();
    const badRow = screen.getByText('Bad Co').closest('tr')!;
    expect(within(badRow).getByText('A customer with this name already exists.')).toBeInTheDocument();
  });

  it('a blank name in a row is reported without calling the API for that row', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(201, { id: 1, name: 'Globex' })));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    const file = csvFile('Name\nGlobex\n');
    await user.upload(screen.getByLabelText('Choose a CSV file'), file);
    await screen.findByText(/1 row/);

    await user.click(screen.getByRole('button', { name: /Import 1 organization/ }));

    expect(await screen.findByText(said(/^1 created/))).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('auto-maps a Currency column and sends the coerced code, skipping unrecognized values', async () => {
    const fetchMock = vi.fn((_url: string, options?: { body?: string }) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      return Promise.resolve(jsonResponse(201, { id: 1, name: body.name }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    // Lowercase codes are accepted case-insensitively; "Monopoly Money"
    // isn't a real currency and is silently left off that row's payload
    // (same "malformed value skipped, row still imports" rule as dates).
    const file = csvFile('Name,Currency\nGlobex EU,eur\nInitech,Monopoly Money');
    await user.upload(screen.getByLabelText('Choose a CSV file'), file);
    await screen.findByRole('region', { name: 'Map columns' });

    const currencySelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    expect(currencySelect.value).toBe('currency');

    await user.click(screen.getByRole('button', { name: 'Import 2 organizations' }));

    expect(await screen.findByText(said(/^2 created/))).toBeInTheDocument();
    const [firstCall, secondCall] = fetchMock.mock.calls as [string, { body: string }][];
    expect(JSON.parse(firstCall[1].body)).toEqual({ name: 'Globex EU', currency: 'EUR' });
    expect(JSON.parse(secondCall[1].body)).toEqual({ name: 'Initech' });
  });

  it('rejects a file with no data rows', async () => {
    const user = userEvent.setup();
    renderPage();

    const file = csvFile('Name,Domain');
    await user.upload(screen.getByLabelText('Choose a CSV file'), file);

    expect(await screen.findByText(/only has a header row/)).toBeInTheDocument();
  });
});

describe('Imports on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('heads the page from the nav and chooses a file with a real button the keyboard reaches', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Imports' })).toHaveClass('text-[22px]', 'font-semibold');
    const input = screen.getByLabelText('Choose a CSV file');
    expect(input).toHaveClass('sr-only');
    expect(input).not.toHaveClass('hidden');
    expect(input.closest('label')).toHaveClass('min-h-11', 'border-line');
  });

  it('maps columns in a table flush in its card, with sentence-case headers and a select per column', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name,Domain\nAcme,acme.io\nGlobex,globex.com\n'));
    const section = await screen.findByRole('region', { name: 'Map columns' });
    expect(section).toHaveTextContent('orgs.csv · 2 rows');
    const table = within(section).getByRole('table');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
    expect(within(table).getByRole('columnheader', { name: /Name/ }).className).not.toMatch(/uppercase/);
    expect(within(table).getByRole('combobox', { name: 'Field for Domain' })).toHaveValue('domain');
    const status = within(section).getByRole('status');
    expect(status).toBeEmptyDOMElement();
    expect(within(section).getByRole('button', { name: 'Import 2 organizations' })).toHaveClass('bg-accent');
  });

  it('reports the results in a table, the failure in the danger ink and the count as status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { body?: string }) =>
        Promise.resolve(
          JSON.parse(options?.body ?? '{}').name === 'Bad Co'
            ? jsonResponse(400, { name: ['A customer with this name already exists.'] })
            : jsonResponse(201, { id: 9, name: 'Acme' }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name\nAcme\nBad Co\n'));
    await user.click(await screen.findByRole('button', { name: 'Import 2 organizations' }));
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(within(results).getByText(said(/^1 failed$/)).firstElementChild).toHaveClass('text-danger-ink');
    const bad = within(results).getByText('Bad Co').closest('tr')!;
    expect(within(bad).getByText('A customer with this name already exists.')).toHaveClass('text-danger-ink');
    expect(results.querySelector('.max-h-96')).toBeNull();
  });

  it('keeps one status region through the import and does not run an aria-disabled Import', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(201, { id: 1, name: 'x' })));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Website\nglobex.com\n'));
    const section = await screen.findByRole('region', { name: 'Map columns' });
    const region = within(section).getByRole('status');
    const button = within(section).getByRole('button', { name: 'Import 1 organization' });
    expect(button).toHaveAccessibleDescription('Map a column to "Name" to continue.');
    await user.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.selectOptions(within(section).getByRole('combobox', { name: 'Field for Website' }), 'name');
    expect(within(section).getByRole('status')).toBe(region);
    await user.click(within(section).getByRole('button', { name: 'Import 1 organization' }));
    await screen.findByRole('region', { name: 'Results' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ends a long result list in Show all instead of a fixed-height card', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(201, { id: 1, name: 'x' }))));
    const user = userEvent.setup();
    renderPage();
    const names = Array.from({ length: 25 }, (_, i) => `Org ${i + 1}`).join('\n');
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile(`Name\n${names}\n`));
    await user.click(await screen.findByRole('button', { name: 'Import 25 organizations' }));
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(within(results).getAllByRole('row')).toHaveLength(21);
    await user.click(within(results).getByRole('button', { name: 'Show all 25' }));
    expect(within(results).getAllByRole('row')).toHaveLength(26);
    expect(within(results).queryByRole('button', { name: /Show all/ })).toBeNull();
    // Focus lands on the first row that was not shown before: the 21st.
    const rows = within(results).getAllByRole('row');
    await waitFor(() => expect(rows[21]).toHaveFocus());
    expect(rows[21]).toHaveTextContent('Org 21');
  });

  it('ignores Choose a different file while an import runs, so the loop does not keep posting into a reset page', async () => {
    const releases: (() => void)[] = [];
    const fetchMock = vi.fn(
      () => new Promise((resolve) => releases.push(() => resolve(jsonResponse(201, { id: 1, name: 'x' })))),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name\nAcme\nGlobex\n'));
    await user.click(await screen.findByRole('button', { name: 'Import 2 organizations' }));
    const different = screen.getByRole('button', { name: 'Choose a different file' });
    expect(different).toHaveAttribute('aria-disabled', 'true');
    await user.click(different);
    expect(screen.getByRole('region', { name: 'Map columns' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a CSV file')).toBeNull();
    while (releases.length || fetchMock.mock.calls.length < 2) {
      await act(async () => releases.shift()?.());
    }
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(within(results).getByText('Acme')).toBeInTheDocument();
    expect(within(results).getByText('Globex')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sets the figures in tabular numerals: Import N and the result counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { body?: string }) =>
        Promise.resolve(JSON.parse(options?.body ?? '{}').name === 'Bad Co' ? jsonResponse(400, { name: ['Taken.'] }) : jsonResponse(201, { id: 9, name: 'Acme' })),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name\nAcme\nBad Co\n'));
    const importButton = await screen.findByRole('button', { name: 'Import 2 organizations' });
    expect(within(importButton).getByText('2')).toHaveClass('tabular-nums');
    await user.click(importButton);
    const results = await screen.findByRole('region', { name: 'Results' });
    const created = within(results).getByText(said(/^1 created ·$/));
    expect(within(created).getByText('1')).toHaveClass('tabular-nums');
    expect(within(within(results).getByText((_, el) => el?.tagName === 'SPAN' && el.classList.contains('text-danger-ink') && el.textContent === '1 failed')).getByText('1')).toHaveClass('tabular-nums');
  });

  describe('keyboard focus', () => {
    it('moves to the mapping once a file is read, to Results after the import, and back to the file button on reset', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(201, { id: 1, name: 'x' }))));
      const user = userEvent.setup();
      renderPage();
      await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name\nAcme\n'));
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Map columns' })).toHaveFocus());
      await user.click(screen.getByRole('button', { name: 'Choose a different file' }));
      await waitFor(() => expect(screen.getByLabelText('Choose a CSV file')).toHaveFocus());
      await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name\nAcme\n'));
      await user.click(await screen.findByRole('button', { name: 'Import 1 organization' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Results' })).toHaveFocus());
      await user.click(screen.getByRole('button', { name: 'Upload another file' }));
      await waitFor(() => expect(screen.getByLabelText('Choose a CSV file')).toHaveFocus());
    });

    it('returns to the file button from Try another file', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name,Domain'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/only has a header row/);
      await user.click(screen.getByRole('button', { name: 'Try another file' }));
      await waitFor(() => expect(screen.getByLabelText('Choose a CSV file')).toHaveFocus());
    });
  });
});
