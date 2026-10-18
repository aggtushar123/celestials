import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listRow, requests, SEGMENTS, stubSegments } from '../../features/segments/testSegments';
import { OWNER_ONLY } from '../../features/segments/summaryFigures';
import { NO_VALUE } from '../../components/ui';
import { resetViewport } from '../../test/viewport';
import { renderSegments } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const row = (id: number) => document.querySelector(`[data-segment="${id}"]`) as HTMLElement;

describe('/segments (spec §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows each segment\'s kind, owner, count, today\'s change and 30-day size, with a badge when shared', async () => {
    stubSegments();
    renderSegments('/segments');
    await waitFor(() => expect(row(7)).not.toBeNull());
    const mine = row(7);
    expect(within(mine).getByRole('link', { name: 'Renewal risk' })).toHaveAttribute('href', '/segments/7');
    expect(mine).toHaveTextContent('Organisations · You');
    expect(mine).toHaveTextContent('Organisations · You · Workspace');
    expect(mine.querySelector('.rounded-full')).toBeNull();
    const count = mine.querySelector('[data-part="count"]') as HTMLElement;
    const today = mine.querySelector('[data-part="today"]') as HTMLElement;
    expect(within(count).getByText('3')).toHaveClass('tabular-nums');
    expect(within(today).getByText('+3 / −1')).toHaveClass('tabular-nums');
    expect(within(mine).getByRole('img', { name: 'Size over 30 days: 1 to 3' })).toBeInTheDocument();
    expect(row(9)).toHaveTextContent('Contacts · You');
    expect(within(row(9)).queryByText('Shared')).not.toBeInTheDocument();
  });

  it('shows a dash, never a guess, for the owner\'s figures on a segment shared with me', async () => {
    stubSegments();
    renderSegments('/segments');
    await waitFor(() => expect(row(8)).not.toBeNull());
    const shared = row(8);
    expect(shared).toHaveTextContent('Accounts · Carl CSM');
    expect(shared).toHaveTextContent('Accounts · Carl CSM · Shared');
    for (const part of ['count', 'today', 'sparkline']) {
      const cell = shared.querySelector(`[data-part="${part}"]`) as HTMLElement;
      expect(within(cell).getByText(NO_VALUE)).toBeInTheDocument();
      expect(within(cell).getByText(OWNER_ONLY)).toHaveClass('sr-only');
    }
    expect(within(shared).queryByRole('img')).not.toBeInTheDocument();
  });

  it('opens on All, and switches between All, Mine and Shared with me in the URL, asking the server for each', async () => {
    const spy = stubSegments();
    renderSegments('/segments');
    await waitFor(() => expect(row(7)).not.toBeNull());
    expect(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Shared with me' }));
    await waitFor(() => expect(where()).toBe('/segments?scope=shared'));
    await waitFor(() => expect(row(7)).toBeNull());
    expect(row(8)).not.toBeNull();
    expect(requests(spy, 'GET', /^\/segments\/$/).map((r) => r.query.get('scope'))).toEqual([null, 'shared']);
  });

  it('searches by name once typing stops', async () => {
    const spy = stubSegments();
    renderSegments('/segments');
    await waitFor(() => expect(row(7)).not.toBeNull());
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search segments by name' }), 'champ');
    await waitFor(() => expect(where()).toBe('/segments?search=champ'));
    await waitFor(() => expect(row(7)).toBeNull());
    expect(row(9)).not.toBeNull();
    const searches = requests(spy, 'GET', /^\/segments\/$/).map((r) => r.query.get('search'));
    expect(searches.filter((search) => search === 'champ')).toHaveLength(1);
    expect(searches.at(-1)).toBe('champ');
  });

  it('explains what a segment is when there are none, with New segment and the Organizations shortcut', async () => {
    stubSegments({ segments: [] });
    renderSegments('/segments');
    expect(await screen.findByText('No segments yet')).toBeInTheDocument();
    expect(screen.getByText(/A segment is a saved group of organisations, accounts or contacts/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'New segment' });
    expect(links.every((link) => link.getAttribute('href') === '/segments/new')).toBe(true);
    expect(screen.getByRole('link', { name: 'Filter Organizations, then Save as segment' })).toHaveAttribute('href', '/organizations/list');
  });

  it('says when nothing is shared with me, without offering New segment in the body', async () => {
    stubSegments({ segments: [] });
    renderSegments('/segments?scope=shared');
    expect(await screen.findByText('Nothing is shared with you yet')).toBeInTheDocument();
    expect(screen.queryByText('No segments yet')).not.toBeInTheDocument();
    // The toolbar's New segment is the only one.
    expect(screen.getAllByRole('link', { name: 'New segment' })).toHaveLength(1);
  });

  it('shows the loading placeholder, not the last empty state, while another scope loads', async () => {
    const spy = stubSegments({ segments: [] });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('scope=shared')) await gate;
      return spy(input, init);
    });
    renderSegments('/segments');
    expect(await screen.findByText('No segments yet')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Shared with me' }));
    await waitFor(() => expect(where()).toBe('/segments?scope=shared'));
    expect(screen.getByText('Loading segments').closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByText('No segments yet')).not.toBeInTheDocument();
    release();
    expect(await screen.findByText('Nothing is shared with you yet')).toBeInTheDocument();
  });

  it('keeps the last list when a new scope fails, with Try again that asks again', async () => {
    let answers = 0;
    const spy = stubSegments({
      list: () => (answers++ === 1 ? { status: 500, body: { detail: 'Server error.' } } : { status: 200, body: SEGMENTS.map(listRow) }),
    });
    renderSegments('/segments');
    await waitFor(() => expect(row(7)).not.toBeNull());
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Mine' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server error. Showing the last result.');
    expect(row(7)).not.toBeNull();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(requests(spy, 'GET', /^\/segments\/$/).map((r) => r.query.get('scope'))).toEqual([null, 'mine', 'mine']);
  });

  it('says so when nothing matches a search, and Clear search clears it', async () => {
    stubSegments();
    renderSegments('/segments?search=zzz');
    expect(await screen.findByText('No segments match "zzz"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search for “zzz”' }));
    await waitFor(() => expect(where()).toBe('/segments'));
  });

  it('shows the failure with Try again, and the list once it works', async () => {
    let fail = true;
    stubSegments({ list: () => (fail ? { status: 500, body: { detail: 'Server error.' } } : { status: 200, body: [] }) });
    renderSegments('/segments');
    expect(await screen.findByText('Server error.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No segments yet')).toBeInTheDocument();
  });
});

describe('Segments list on the primitives (Impact PR)', () => {
  it('is one toolbar: the scope leads, then the search with its count, New segment last', async () => {
    stubSegments();
    renderSegments('/segments');
    const scope = await screen.findByRole('group', { name: 'Show' });
    expect(within(scope).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(scope.closest('[data-part="toolbar-lead"]')).not.toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search segments by name' })).toHaveAttribute('placeholder', 'Search segments');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^\d+ segments?$/));
    expect(screen.getByRole('link', { name: 'New segment' })).toHaveClass('bg-accent');
  });

  it('draws the segments as one card with column labels, inside a container', async () => {
    stubSegments();
    renderSegments('/segments');
    const list = await screen.findByRole('list', { name: 'Segments' });
    expect(list).toHaveClass('divide-y', 'divide-line-subtle');
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'overflow-hidden');
    expect(list.closest('.\\@container')).not.toBeNull();
    expect(list.parentElement!.querySelector('[aria-hidden="true"].hidden')).toHaveTextContent('Members');
  });

  it('keeps the count region mounted while another scope loads', async () => {
    stubSegments();
    renderSegments('/segments');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^\d+ segments?$/));
    const status = screen.getByRole('status');
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Mine' }));
    expect(screen.getByRole('status')).toBe(status);
    await waitFor(() => expect(where()).toContain('scope=mine'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^\d+ segments?$/));
    expect(screen.getByRole('status')).toBe(status);
  });
});
