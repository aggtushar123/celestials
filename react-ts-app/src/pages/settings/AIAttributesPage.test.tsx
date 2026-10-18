import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AIAttributesPage } from './AIAttributesPage';
import { attribute, jsonResponse, makeStore } from '../../test/attributesFixtures';

// Integration tier: real store for the admin gate, the fetch boundary
// mocked with contract-shaped responses.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function renderPage(role: 'admin' | 'csm' = 'admin') {
  render(
    <Provider store={makeStore(role)}>
      <MemoryRouter>
        <AIAttributesPage />
      </MemoryRouter>
    </Provider>
  );
}

describe('AIAttributesPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('tells a CSM to ask an admin', () => {
    renderPage('csm');
    expect(screen.getByText(/ask an admin/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists what is defined and adds a new attribute', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute()]))
      .mockResolvedValueOnce(jsonResponse(201, attribute({ id: 5, name: 'Seats in use', value_type: 'number', picklist_options: [], refresh: 'manual' })));
    renderPage();
    expect(await screen.findByText('Product tier')).toBeInTheDocument();
    expect(screen.getByText('Nightly')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New attribute' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Seats in use');
    await userEvent.type(screen.getByLabelText('Question'), 'How many seats does this company actively use?');
    await userEvent.selectOptions(screen.getByLabelText('Answer type'), 'number');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Seats in use')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      name: 'Seats in use', prompt: 'How many seats does this company actively use?', value_type: 'number', applies_to_customer: true,
    });
  });

  it('fills every company from the row and reports the count', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute()]))
      .mockResolvedValueOnce(jsonResponse(200, { filled: 25, remaining: 4, values: [] }));
    renderPage();
    await screen.findByText('Product tier');
    await userEvent.click(screen.getByRole('button', { name: 'Fill all for Product tier' }));
    expect(await screen.findByText(/25 filled, 4 left for tonight/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/attributes\/definitions\/3\/fill\/$/);
  });
});

describe('AIAttributesPage actions', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('deletes after confirmation, and keeps the list when a delete fails', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute(), attribute({ id: 4, name: 'Seats in use' })]))
      .mockResolvedValueOnce(jsonResponse(500, { detail: 'Database busy' }))
      .mockResolvedValueOnce(jsonResponse(204, null));
    renderPage();
    await screen.findByText('Product tier');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Product tier' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database busy');
    expect(screen.getByText('Product tier')).toBeInTheDocument();
    expect(screen.getByText('Seats in use')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Seats in use' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Product tier')).toBeInTheDocument();
    expect(screen.queryByText('Seats in use')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/attributes\/definitions\/4\/$/);
  });

  it('reports a fill failure as an error', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute()]))
      .mockResolvedValueOnce(jsonResponse(429, { detail: 'This organisation has spent its monthly model budget.' }));
    renderPage();
    await screen.findByText('Product tier');
    await userEvent.click(screen.getByRole('button', { name: 'Fill all for Product tier' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/monthly model budget/);
  });
});

describe('AI attributes on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('heads the page with the nav label and lists attributes as rows, the actions on hover', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [attribute()]));
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'AI' })).toHaveClass('text-[22px]');
    const list = await screen.findByRole('list', { name: 'AI attributes' });
    expect(screen.queryByRole('table')).toBeNull();
    const row = within(list).getByText('Product tier').closest('li')!;
    expect(within(row).getByRole('button', { name: 'Fill all for Product tier' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    expect(within(row).getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'New attribute' })).not.toHaveClass('bg-accent');
  });

  it('builds a new attribute in a section of rows, Applies to as a named group', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New attribute' }));
    const form = screen.getByRole('region', { name: 'New attribute' });
    expect(within(form).getByRole('group', { name: 'Applies to' })).toContainElement(within(form).getByRole('checkbox', { name: 'Applies to Organizations' }));
    expect(within(form).getByLabelText('Question')).toHaveClass('min-h-20');
    expect(within(form).getByRole('button', { name: 'Create' })).toHaveClass('bg-accent');
  });

  it('keeps each Fill all result in its own row status region, the same node before and after', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute()]))
      .mockResolvedValueOnce(jsonResponse(200, { filled: 2, remaining: 0, values: [] }));
    renderPage();
    const row = (await screen.findByText('Product tier')).closest('li')!;
    const region = within(row).getByRole('status');
    await userEvent.click(within(row).getByRole('button', { name: 'Fill all for Product tier' }));
    expect(await within(row).findByText('2 filled')).toBe(region);
  });
});

describe('AI attributes keep keyboard focus where it was', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('focuses Name when the form opens, and New attribute again on Cancel', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [attribute()]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New attribute' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'New attribute' })).toHaveFocus();
  });

  it('returns focus to New attribute after Create', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, attribute({ id: 8, name: 'Seats in use' })));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New attribute' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Seats in use');
    await userEvent.type(screen.getByLabelText('Question'), 'How many seats?');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('Seats in use');
    await waitFor(() => expect(screen.getByRole('button', { name: 'New attribute' })).toHaveFocus());
  });

  it('does not submit Create while the form is incomplete', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New attribute' }));
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(create);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives focus back to the Delete button on Cancel, then to the list, then to New attribute', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute(), attribute({ id: 4, name: 'Seats in use' })]))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(jsonResponse(204, null));
    renderPage();
    await screen.findByText('Product tier');
    const del = screen.getByRole('button', { name: 'Delete Product tier' });
    await userEvent.click(del);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(del).toHaveFocus();
    await userEvent.click(del);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('list', { name: 'AI attributes' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Delete Seats in use' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New attribute' })).toHaveFocus());
  });

  it('keeps focus on Fill all while it works', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute()]))
      .mockResolvedValueOnce(jsonResponse(200, { filled: 1, remaining: 0, values: [] }));
    renderPage();
    await screen.findByText('Product tier');
    const fill = screen.getByRole('button', { name: 'Fill all for Product tier' });
    await userEvent.click(fill);
    await screen.findByText('1 filled');
    expect(fill).toHaveFocus();
  });
});

describe('AI attributes: failures and double presses', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('a failed delete shows the alert, gives focus back to Delete, and keeps the row', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [attribute()])).mockResolvedValueOnce(jsonResponse(500, { detail: 'Database busy' }));
    renderPage();
    const list = await screen.findByRole('list', { name: 'AI attributes' });
    const remove = within(list).getByRole('button', { name: 'Delete Product tier' });
    await userEvent.click(remove);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database busy');
    await waitFor(() => expect(remove).toHaveFocus());
    expect(within(list).getByText('Product tier')).toBeInTheDocument();
  });

  it('a double press on Fill all sends one fill', async () => {
    let release: () => void = () => {};
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [attribute()]))
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(jsonResponse(200, { filled: 2, remaining: 0, values: [] })))));
    renderPage();
    await screen.findByText('Product tier');
    const fill = screen.getByRole('button', { name: 'Fill all for Product tier' });
    fireEvent.click(fill);
    fireEvent.click(fill);
    await act(async () => release());
    await screen.findByText('2 filled');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/fill/'))).toHaveLength(1);
  });

  it('writes a picklist row meta line as trailing-dot parts: type, scope, options, refresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [attribute({ picklist_options: ['SMB', 'Mid-market', 'Enterprise'] })]));
    renderPage();
    const list = await screen.findByRole('list', { name: 'AI attributes' });
    const row = within(list).getByText('Product tier').closest('li')!;
    const meta = within(row).getByText('Picklist ·').parentElement!;
    expect(meta).toHaveTextContent('Picklist · Organizations & Accounts · SMB, Mid-market, Enterprise · Nightly');
    expect([...meta.children].map((part) => part.textContent)).toEqual(['Picklist ·', 'Organizations & Accounts ·', 'SMB, Mid-market, Enterprise ·', 'Nightly']);
  });
});
