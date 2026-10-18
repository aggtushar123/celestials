import { act } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateScenario } from './CreateScenario';
import type { Scenario } from './types';

// Integration tier (see the `testing` skill): real router context (the
// route param decides whether this loads an existing scenario), only
// the fetch boundary mocked — same convention as SettingsPage.test.tsx's
// own, now that a real Scenario model backs this (see
// docs/API_CONTRACTS.md's `scenarios` section) instead of localStorage.
// ReactFlow needs a ResizeObserver polyfill in jsdom — see
// src/test/setup.ts's own stub.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

interface FetchOptions {
  method?: string;
  body?: string;
}

function scenarioFixture(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 3,
    name: 'Renewal Flow',
    apply_to: 'organizations',
    apply_to_display: 'Organizations',
    nodes: [],
    edges: [],
    is_active: false,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function renderNew(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={['/scenarios/create']}>
      <Routes>
        <Route path="/scenarios/create" element={<CreateScenario />} />
        <Route path="/scenarios/:id" element={<CreateScenario />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderExisting(id: string, fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={[`/scenarios/${id}`]}>
      <Routes>
        <Route path="/scenarios/:id" element={<CreateScenario />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CreateScenario builder', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts blank with a default name/applyTo for a new scenario', async () => {
    renderNew(vi.fn());

    expect(await screen.findByDisplayValue('Untitled Scenario')).toBeInTheDocument();
    expect(screen.getByLabelText('Organizations')).toBeChecked();
  }, 20000);

  it('Save POSTs a new scenario and swaps the URL to its own id', async () => {
    const created = scenarioFixture({ id: 7, name: 'My New Flow', apply_to: 'accounts' });
    const fetchMock = vi.fn((_url: string, options?: FetchOptions) => {
      if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, created));
      return Promise.resolve(jsonResponse(200, created));
    });
    const user = userEvent.setup();
    renderNew(fetchMock);

    const nameInput = await screen.findByLabelText('Scenario name', undefined, { timeout: 15000 });
    await user.clear(nameInput);
    await user.type(nameInput, 'My New Flow');
    await user.click(screen.getByLabelText('Accounts'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const postCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall![1]!.body!);
    expect(body.name).toBe('My New Flow');
    expect(body.apply_to).toBe('accounts');
    // Run Now stays disabled once apply_to isn't organizations.
    expect(await screen.findByRole('button', { name: /Run now/ })).toBeDisabled();
  }, 20000);

  it('loading an existing scenario populates its own saved name/applyTo/active state', async () => {
    const existing = scenarioFixture({ apply_to: 'contacts', is_active: true });
    renderExisting('3', vi.fn(() => Promise.resolve(jsonResponse(200, existing))));

    expect(await screen.findByDisplayValue('Renewal Flow')).toBeInTheDocument();
    expect(screen.getByLabelText('Contacts')).toBeChecked();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    // UI broken-things fix 12: below lg the header wraps into rows rather
    // than running off a phone's edge.
    const header = screen.getByRole('switch').closest('header')!;
    expect(header).toHaveClass('flex-wrap', 'lg:flex-nowrap', 'min-h-16');
    expect(header).not.toHaveClass('h-16');
    for (const group of header.children) expect(group).toHaveClass('flex-wrap');
  }, 20000);

  it('saving an existing scenario PATCHes its own id, not a new one', async () => {
    const existing = scenarioFixture();
    const fetchMock = vi.fn((_url: string, options?: FetchOptions) => {
      if (options?.method === 'PATCH') return Promise.resolve(jsonResponse(200, existing));
      return Promise.resolve(jsonResponse(200, existing));
    });
    const user = userEvent.setup();
    renderExisting('3', fetchMock);
    await screen.findByDisplayValue('Renewal Flow');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const patchCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(patchCall![0]).toContain('/scenarios/3/');
  }, 20000);

  it('shows a node\'s action in sentence case, and names its controls the same way (stored key unchanged)', async () => {
    const data = { action: 'Send Email', label: 'Send Email' };
    const existing = scenarioFixture({ nodes: [{ id: 'node_1', type: 'action', position: { x: 0, y: 0 }, data }] });
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, existing)));
    renderExisting('3', fetchMock);
    await screen.findByRole('button', { name: 'Save' }, { timeout: 15000 });
    // React Flow keeps an unmeasured node visibility:hidden in jsdom (no name
    // is computed for it), so its controls are read off the node directly.
    const node = await waitFor(() => {
      const found = document.querySelector('[data-id="node_1"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    const [edit, remove] = [...node.querySelectorAll('button')];
    expect(edit).toHaveAttribute('aria-label', 'Edit Send email');
    expect(remove).toHaveAttribute('aria-label', 'Delete Send email');
    expect(node).toHaveTextContent('Send email:');
    expect(node).not.toHaveTextContent('Send Email');
    expect(data.action).toBe('Send Email');
  }, 20000);

  it("editing a node's label round-trips through Save & Close, then persists on the next scenario Save", async () => {
    const existing = scenarioFixture({
      nodes: [
        { id: 'node_1', type: 'action', position: { x: 0, y: 0 }, data: { action: 'Send Email', label: 'Old Label' } },
      ],
    });
    let patchedBody: { nodes: { data: { label: string } }[] } | null = null;
    const fetchMock = vi.fn((_url: string, options?: FetchOptions) => {
      if (options?.method === 'PATCH') {
        patchedBody = JSON.parse(options.body!);
        return Promise.resolve(jsonResponse(200, { ...existing, ...patchedBody }));
      }
      return Promise.resolve(jsonResponse(200, existing));
    });
    const user = userEvent.setup();
    renderExisting('3', fetchMock);
    await screen.findByRole('button', { name: 'Save' }, { timeout: 15000 });

    // Same custom event CustomNodes.tsx's own Edit button dispatches on
    // click — triggered directly rather than through React Flow's own
    // rendered node, whose measurement lifecycle (ResizeObserver, only
    // stubbed as a no-op in jsdom — see src/test/setup.ts) makes its
    // own DOM unreliable to depend on in a test.
    // Sent until the dialog opens: the page adds its listener in an effect,
    // which a slow CI machine may run after Save is already on screen.
    await waitFor(() => {
      if (!screen.queryByRole('dialog')) {
        act(() => {
          window.dispatchEvent(
            new CustomEvent('edit-node', {
              detail: { id: 'node_1', data: existing.nodes[0].data, type: 'action' },
            })
          );
        });
      }
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog');
    const labelInput = within(dialog).getByLabelText('Node label');
    expect(labelInput).toHaveValue('Old Label');
    await user.clear(labelInput);
    await user.type(labelInput, 'New Label');
    await user.click(within(dialog).getByRole('button', { name: 'Save and close' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(patchedBody).not.toBeNull();
    expect(patchedBody!.nodes[0].data.label).toBe('New Label');
  }, 20000);

  it('Run Now is disabled until the scenario has a real id', async () => {
    renderNew(vi.fn());
    expect(await screen.findByRole('button', { name: /Run now/ }, { timeout: 15000 })).toBeDisabled();
  }, 20000);

  it('Run Now opens the modal and runs against a selected organization once saved', async () => {
    const existing = scenarioFixture();
    const run = {
      id: 10,
      scenario: 3,
      customer: { id: 9, name: 'Globex' },
      triggered_by: 'manual',
      status: 'success',
      log: [{ node_id: 'n1', action: 'Send Email', status: 'ok', detail: 'Emailed ops@globex.io: "Hi"' }],
      started_at: '2026-09-04T00:00:00Z',
      finished_at: '2026-09-04T00:00:01Z',
    };
    const fetchMock = vi.fn((url: string, options?: FetchOptions) => {
      if (url.endsWith('/customers/')) {
        return Promise.resolve(jsonResponse(200, { count: 1, next: null, previous: null, results: [{ id: 9, name: 'Globex' }] }));
      }
      if (url.includes('/run/') && options?.method === 'POST') {
        return Promise.resolve(jsonResponse(201, run));
      }
      return Promise.resolve(jsonResponse(200, existing));
    });
    const user = userEvent.setup();
    renderExisting('3', fetchMock);
    await screen.findByDisplayValue('Renewal Flow');

    await user.click(screen.getByRole('button', { name: /Run now/ }));
    await user.selectOptions(await screen.findByLabelText('Organization', undefined, { timeout: 15000 }), '9');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Run completed.')).toBeInTheDocument();
    expect(screen.getByText(/Emailed ops@globex.io/)).toBeInTheDocument();
  }, 20000);

  it('leads back once, in sentence case, with the shared switch and Save as the one primary', async () => {
    renderNew(vi.fn());
    const back = await screen.findAllByRole('link', { name: /Scenarios|Back/ });
    expect(back).toHaveLength(1);
    expect(back[0]).toHaveAttribute('href', '/scenarios');
    expect(screen.queryByText('Back to List')).toBeNull();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Inactive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: 'More save options' })).not.toHaveClass('bg-accent');
  }, 20000);

  it('offers Save and close from the save menu', async () => {
    const created = scenarioFixture({ id: 7 });
    const fetchMock = vi.fn<(url: string, options?: FetchOptions) => Promise<ReturnType<typeof jsonResponse>>>(() => Promise.resolve(jsonResponse(201, created)));
    const user = userEvent.setup();
    renderNew(fetchMock);
    await user.click(await screen.findByRole('button', { name: 'More save options' }, { timeout: 15000 }));
    await user.click(await screen.findByRole('menuitem', { name: 'Save and close' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true));
  }, 20000);

  it('shows a larger-screen notice below md instead of a builder that cannot fit', async () => {
    renderNew(vi.fn());
    const notice = await screen.findByText('Edit scenarios on a larger screen.', undefined, { timeout: 15000 });
    expect(notice.closest('.md\\:hidden')).not.toBeNull();
    expect(document.querySelector('[data-part="builder"]')).toHaveClass('hidden', 'md:flex');
  }, 20000);

  it('names the canvas controls and shows the lock as pressed, not amber', async () => {
    const user = userEvent.setup();
    renderNew(vi.fn());
    const lock = await screen.findByRole('button', { name: 'Lock the canvas' }, { timeout: 15000 });
    expect(lock).toHaveAttribute('aria-pressed', 'false');
    for (const name of ['Zoom in', 'Zoom out', 'Fit the canvas']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    await user.click(lock);
    const unlock = screen.getByRole('button', { name: 'Unlock the canvas' });
    expect(unlock).toHaveAttribute('aria-pressed', 'true');
    expect(unlock.className).not.toContain('warning');
  }, 20000);
});
