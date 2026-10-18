import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCanvases } from '../../features/canvas/testCanvases';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

const names = () => within(screen.getByRole('list', { name: 'Maps' })).getAllByRole('link').map((link) => link.textContent);

describe('the /canvas gallery (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists maps on records the reader may open, newest edit first, with record, people and last edit', async () => {
    stubCanvases();
    renderCanvas('/canvas');
    await screen.findByRole('list', { name: 'Maps' });
    expect(names()).toEqual(['EMEA buying group', 'Pizza Hut leadership', "Dana's renewal map"]);
    const first = screen.getAllByRole('listitem')[0];
    expect(first).toHaveTextContent('Pizza EMEA');
    expect(first).toHaveTextContent('4 people');
    expect(first).toHaveTextContent('Edited by Dana CSM · 2 days ago');
  });

  it('searches map and record names through the URL', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas');
    await screen.findByRole('list', { name: 'Maps' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search maps by name or record' }), 'hut');
    await waitFor(() => expect(names()).toEqual(['Pizza Hut leadership']));
    expect(screen.getByTestId('where')).toHaveTextContent('/canvas?q=hut');
    expect(spy.mock.calls.some(([url]) => String(url).endsWith('/canvases/?q=hut'))).toBe(true);
  });

  it('shows more on the cursor', async () => {
    stubCanvases({ pageSize: 2 });
    renderCanvas('/canvas');
    await screen.findByRole('list', { name: 'Maps' });
    expect(names()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('has empty, loading and error states', async () => {
    stubCanvases({ maps: [], failList: 1 });
    renderCanvas('/canvas');
    expect(screen.getByText('Loading maps').closest('[role="status"]')).not.toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No maps yet')).toBeInTheDocument();
    expect(screen.getByText("Start one from an organisation's or account's Maps tab.")).toBeInTheDocument();
  });

  it('searches from one toolbar, with an icon and a short placeholder, and lists the maps in one card', async () => {
    stubCanvases();
    renderCanvas('/canvas');
    const search = await screen.findByRole('searchbox', { name: 'Search maps by name or record' });
    expect(search).toHaveAttribute('placeholder', 'Search maps');
    expect(search.closest('[data-part="toolbar-search"]')).not.toBeNull();
    const list = await screen.findByRole('list', { name: 'Maps' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line');
  });
});
