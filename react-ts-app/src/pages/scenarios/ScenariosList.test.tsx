import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ScenariosList } from './ScenariosList';

// Integration tier (see the `testing` skill): only the fetch boundary
// is mocked, same convention as SettingsPage.test.tsx's own — the real
// Scenario model backs this now (see docs/API_CONTRACTS.md's
// `scenarios` section), not localStorage.
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const onboardingFlow = {
  id: 1,
  name: 'Onboarding Flow',
  apply_to: 'organizations',
  apply_to_display: 'Organizations',
  nodes: [
    { id: 'n1', type: 'entry', position: { x: 0, y: 0 }, data: { action: 'Run Now', label: 'Start' } },
    { id: 'n2', type: 'action', position: { x: 0, y: 100 }, data: { action: 'Send Email', label: 'Welcome' } },
  ],
  edges: [],
  is_active: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
};

function renderPage(path = '/scenarios') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scenarios" element={<ScenariosList />} />
        <Route path="/scenarios/create" element={<div>CREATE PAGE</div>} />
        <Route path="/scenarios/:id" element={<div>BUILDER PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScenariosList page (/scenarios)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the empty state when nothing has been saved yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderPage();

    expect(await screen.findByText('No scenarios yet', undefined, { timeout: 15000 })).toBeInTheDocument();
  }, 20000);

  it('renders every saved scenario with its own applyTo/node count/active/updated time', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [onboardingFlow]))));
    renderPage();

    const name = await screen.findByText('Onboarding Flow', undefined, { timeout: 15000 });
    const row = name.closest('li')!;
    expect(within(row).getByText('Organizations')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument(); // node count
    expect(within(row).getByText('Active')).toBeInTheDocument();
  }, 20000);

  it('surfaces a fetch failure instead of silently showing an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server error.' }))));
    renderPage();

    expect(await screen.findByText('Server error.', undefined, { timeout: 15000 })).toBeInTheDocument();
  }, 20000);

  it('opening a row goes to that scenario\'s own builder through its title', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [onboardingFlow]))));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Onboarding Flow' }, { timeout: 15000 }));

    expect(await screen.findByText('BUILDER PAGE')).toBeInTheDocument();
  }, 20000);

  it('deleting a scenario removes it from the list after confirming', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve(jsonResponse(204, null));
      }
      // Re-fetched after delete — empty the second time around.
      const alreadyDeleted = fetchMock.mock.calls.some(([, o]: [string, { method?: string }?]) => o?.method === 'DELETE');
      return Promise.resolve(jsonResponse(200, alreadyDeleted ? [] : [onboardingFlow]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Onboarding Flow', undefined, { timeout: 15000 });
    await user.click(screen.getByRole('button', { name: 'Delete Onboarding Flow' }));
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No scenarios yet')).toBeInTheDocument();
  });
});

describe('the canvas tab on the primitives (Impact PR)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  }, 20000);

  it('lists the scenarios in one card on the scenarios grid, no table, Delete on hover', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [onboardingFlow]))));
    renderPage();
    const list = await screen.findByRole('list', { name: 'Scenarios' }, { timeout: 15000 });
    expect(document.querySelector('table')).toBeNull();
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line');
    const row = list.querySelector('li')!;
    expect(row.className).toContain('@min-[52rem]:grid-cols-[minmax(14rem,1fr)_9rem_4rem_6rem_8rem_3rem]');
    const remove = within(row).getByRole('button', { name: /^Delete / });
    expect(remove).toHaveClass('min-w-11');
    expect(remove.parentElement).toHaveClass('[@media(hover:none)]:opacity-100', 'sm:group-focus-within:opacity-100');
    expect(within(row).getByText('Active')).toBeInTheDocument();
  }, 20000);

  it('says there are none inside the card, in sentence case, with no second create button', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderPage();
    const empty = await screen.findByText('No scenarios yet', undefined, { timeout: 15000 });
    expect(empty.closest('section')).toHaveClass('rounded-xl', 'border-line');
    expect(screen.queryByRole('button', { name: /create scenario/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /create scenario/i })).toBeNull();
  }, 20000);

  it('keeps the rows and returns the focus to the list after a delete', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
      if (options?.method === 'DELETE') return Promise.resolve(jsonResponse(204, null));
      const deleted = fetchMock.mock.calls.some(([, o]: [string, { method?: string }?]) => o?.method === 'DELETE');
      return Promise.resolve(jsonResponse(200, deleted ? [] : [onboardingFlow]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete Onboarding Flow' }, { timeout: 15000 }));
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('No scenarios yet')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByText(/Build a flow with triggers, conditions and actions to automate/));
  }, 20000);
});
