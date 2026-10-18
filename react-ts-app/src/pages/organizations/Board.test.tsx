import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderBoard } from './testList';
import { resetViewport } from '../../test/viewport';
import {
  buildPortfolio,
  customerFixture,
  globex,
  initech,
  patchBodies,
  pizzaHut,
  portfolioQueries,
  stubPortfolio,
} from '../../features/organizations/testPortfolio';

// Integration tier: the real page, store and router; fetch stubbed with
// §2-shaped bodies, and PATCH /customers/<id>/ writing into the stub's book
// (features/organizations/testPortfolio.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const heading = (key: string) => within(column(key)).getByRole('heading');
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: 'all', dropEffect: 'none' });
const moveButton = (id: number) => within(card(id)).queryByRole('button', { name: /^Move .+ to…$/ });
/** Ruling R1: Move to… is a button opening a menu; nothing moves until a stage is chosen. */
const chooseMove = async (id: number, name: string, stage: string) => {
  await userEvent.click(moveButton(id) as HTMLElement);
  await userEvent.click(within(screen.getByRole('menu', { name: `Move ${name} to` })).getByRole('menuitem', { name: stage }));
};
const ready = async () => {
  await screen.findByRole('link', { name: 'Pizza Hut' });
  await screen.findByRole('link', { name: 'Globex' });
};

/** Browsers drop focus to <body> when a focused node is moved in the DOM
 *  (React reordering keyed children); jsdom keeps it. This plays the
 *  browser's part. Undone by vi.restoreAllMocks(). */
function emulateFocusLossOnMove() {
  for (const name of ['insertBefore', 'appendChild'] as const) {
    const original = Node.prototype[name] as (this: Node, ...args: unknown[]) => Node;
    vi.spyOn(Node.prototype, name).mockImplementation(function (this: Node, ...args: unknown[]) {
      const node = args[0] as Node;
      const active = document.activeElement;
      const loses = node.isConnected && active instanceof HTMLElement && node.contains(active);
      const out = original.apply(this, args);
      if (loses) active.blur();
      return out;
    } as never);
  }
}

/** Holds every request `matches` picks until release(); everything else
 *  goes straight to the stub. */
function holdRequests(spy: ReturnType<typeof stubPortfolio>, matches: (url: URL, init?: RequestInit) => boolean) {
  const waiting: (() => void)[] = [];
  let holding = true;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (holding && matches(new URL(String(input)), init)) await new Promise<void>((resolve) => waiting.push(resolve));
    return spy(input, init);
  });
  return {
    release: () => waiting.splice(0).forEach((resolve) => resolve()),
    stop: () => {
      holding = false;
      waiting.splice(0).forEach((resolve) => resolve());
    },
    held: () => waiting.length,
  };
}

/** Holds every PATCH until release(). */
const holdPatches = (spy: ReturnType<typeof stubPortfolio>) => holdRequests(spy, (_url, init) => init?.method === 'PATCH');

describe('Organizations board (portfolio)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("shares the List's top half and groups by lifecycle by default", async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    expect(screen.getByRole('group', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' })).toBeInTheDocument();
    expect(screen.getByText('2 organizations')).toBeInTheDocument();
    const [frame] = portfolioQueries(spy);
    expect(frame.get('group')).toBe('lifecycle');
    expect(frame.get('limit')).toBe('1');
    expect(column('live')).toContainElement(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(heading('adoption')).toHaveTextContent('Adoption · 1 · $120.0K');
    expect(screen.getByRole('combobox', { name: 'Group' })).toHaveValue('lifecycle');
    // No selection mode and no pinned fields on the Board.
    expect(screen.queryByRole('button', { name: 'Pin fields' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Select / })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument();
    expect(where().search).toBe('');
  });

  it('filters through the URL like the List; group=none still shows lifecycle columns', async () => {
    const spy = stubPortfolio();
    renderBoard('/organizations/board?group=none&owner=2');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(portfolioQueries(spy)[0].get('group')).toBe('lifecycle');
    expect(screen.getByRole('combobox', { name: 'Group' })).toHaveValue('lifecycle');
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Owner: Carl CSM' }));
    expect(where().searchParams.has('owner')).toBe(false);
    expect(where().searchParams.get('group')).toBe('none');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'health');
    expect(where().searchParams.get('group')).toBe('health');
    await waitFor(() => expect(heading('average')).toHaveTextContent('Average · 1 · $69.6K'));
    await within(column('average')).findByRole('link', { name: 'Pizza Hut' });
    expect(moveButton(7)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add organization to / })).not.toBeInTheDocument();
  });

  it('moves a card optimistically with Move to…, saves one PATCH, then reloads the frame and the two columns', async () => {
    const spy = stubPortfolio();
    const gate = holdPatches(spy);
    renderBoard();
    await ready();
    const before = portfolioQueries(spy).length;
    await chooseMove(7, 'Pizza Hut', 'Renewal');

    // At once: the card sits in Renewal, the counts follow, and moving is off while it saves.
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(column('live')).queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    expect(heading('renewal')).toHaveTextContent('Renewal · 1 · $69.6K');
    expect(heading('live')).toHaveTextContent('Live · 0 · $0');
    expect(moveButton(1)).toBeDisabled();

    gate.release();
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 7, body: { lifecycle_stage: 'renewal' } }]));
    expect(await screen.findByText('Moved Pizza Hut to Renewal.')).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => {
      const after = portfolioQueries(spy).slice(before);
      expect(after.some((q) => q.get('limit') === '1' && !q.has('group_value'))).toBe(true);
      expect(after.some((q) => q.get('group_value') === 'renewal')).toBe(true);
    });
    // Only the columns the move touched reload.
    expect(portfolioQueries(spy).slice(before).some((q) => q.get('group_value') === 'adoption')).toBe(false);
    await waitFor(() => expect(moveButton(1)).toBeEnabled());
    expect(heading('renewal')).toHaveTextContent('Renewal · 1 · $69.6K');
    expect(heading('live')).toHaveTextContent('Live · 0 · $0');
    // Once, in its new column only: no duplicate after the bumped reads.
    expect(within(column('renewal')).getAllByRole('link', { name: 'Pizza Hut' })).toHaveLength(1);
    expect(within(column('live')).queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Pizza Hut' })).toHaveLength(1);
  });

  it('puts focus on the moved card in its new column after a keyboard move, never on the page', async () => {
    const user = userEvent.setup();
    stubPortfolio();
    renderBoard();
    await ready();
    (moveButton(7) as HTMLElement).focus();
    await user.keyboard('{Enter}');
    const menu = screen.getByRole('menu', { name: 'Move Pizza Hut to' });
    await user.keyboard('{End}');
    expect(within(menu).getByRole('menuitem', { name: 'Other' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{Enter}');
    const open = within(column('renewal')).getByRole('button', { name: 'Open Pizza Hut' });
    expect(open).toHaveFocus();
    await waitFor(() => expect(moveButton(1)).toBeEnabled());
    expect(within(column('renewal')).getByRole('button', { name: 'Open Pizza Hut' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('keeps focus on the moved card when its new column re-sorts under a higher-ARR card', async () => {
    const user = userEvent.setup();
    // Globex (ARR 120K) already sits in Renewal and comes back above Pizza Hut.
    const globexRenewal = { ...globex, lifecycle: { value: 'renewal' as const, label: 'Renewal' } };
    stubPortfolio({ rows: [globexRenewal, pizzaHut, initech] });
    renderBoard();
    await ready();
    emulateFocusLossOnMove();
    (moveButton(7) as HTMLElement).focus();
    await user.keyboard('{Enter}');
    await user.click(within(screen.getByRole('menu', { name: 'Move Pizza Hut to' })).getByRole('menuitem', { name: 'Renewal' }));
    // The guess puts Pizza Hut on top; the fresh page puts Globex above it.
    await waitFor(() => {
      const ids = [...column('renewal').querySelectorAll('[data-card-id]')].map((el) => el.getAttribute('data-card-id'));
      expect(ids).toEqual(['1', '7']);
    });
    await waitFor(() => expect(moveButton(1)).toBeEnabled());
    expect(within(card(7)).getByRole('button', { name: 'Open Pizza Hut' })).toHaveFocus();
  });

  it('leaves focus alone after a mouse drag-drop', async () => {
    stubPortfolio();
    renderBoard();
    await ready();
    const search = screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' });
    search.focus();
    const dt = dataTransfer();
    fireEvent.dragStart(card(1), { dataTransfer: dt });
    fireEvent.dragOver(column('live'), { dataTransfer: dt });
    fireEvent.drop(column('live'), { dataTransfer: dt });
    await waitFor(() => expect(within(column('live')).getByRole('link', { name: 'Globex' })).toBeInTheDocument());
    await waitFor(() => expect(moveButton(1)).toBeEnabled());
    expect(search).toHaveFocus();
  });

  it("allows one move at a time until its reloads land, so the first card never reverts", async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    const reads = holdRequests(spy, (url) => url.searchParams.get('group_value') === 'renewal');
    await chooseMove(7, 'Pizza Hut', 'Renewal');
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(1));
    await waitFor(() => expect(reads.held()).toBe(1));
    // Saved, and the frame has reloaded, but Renewal's own page hasn't landed.
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(moveButton(1)).toBeDisabled();
    reads.stop();
    await waitFor(() => expect(moveButton(1)).toBeEnabled());
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    await chooseMove(1, 'Globex', 'Live');
    await waitFor(() => expect(within(column('live')).getByRole('link', { name: 'Globex' })).toBeInTheDocument());
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    await waitFor(() => expect(moveButton(1)).toBeEnabled());
    expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('switches Group without reading columns from the old frame (no owner read with a lifecycle key)', async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    const frames = holdRequests(spy, (url) => url.searchParams.get('group') === 'owner' && !url.searchParams.has('group_value'));
    const before = portfolioQueries(spy).length;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'owner');
    await waitFor(() => expect(frames.held()).toBe(1));
    // The old frame's columns stay as they were while the new one loads.
    expect(within(column('live')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(screen.queryByText('No organizations in Live.')).not.toBeInTheDocument();
    frames.stop();
    await waitFor(() => expect(column('2')).toContainElement(screen.getByRole('link', { name: 'Pizza Hut' })));
    const after = portfolioQueries(spy).slice(before);
    const lifecycleKeys = ['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other'];
    expect(after.filter((q) => q.get('group') === 'owner' && lifecycleKeys.includes(q.get('group_value') ?? ''))).toEqual([]);
    expect(screen.queryByText('No organizations in Live.')).not.toBeInTheDocument();
  });

  it("puts the card back with the server's reason when the save fails", async () => {
    stubPortfolio({ patch: () => ({ status: 403, body: { detail: 'You do not have permission to perform this action.' } }) });
    renderBoard();
    await ready();
    await chooseMove(7, 'Pizza Hut', 'Adoption');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't move Pizza Hut to Adoption. You do not have permission to perform this action.",
    );
    expect(within(column('live')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(column('adoption')).queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    expect(heading('live')).toHaveTextContent('Live · 1 · $69.6K');
    expect(heading('adoption')).toHaveTextContent('Adoption · 1 · $120.0K');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('drags a card between lifecycle columns', async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    const dt = dataTransfer();
    fireEvent.dragStart(card(1), { dataTransfer: dt });
    fireEvent.dragOver(column('live'), { dataTransfer: dt });
    fireEvent.drop(column('live'), { dataTransfer: dt });
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 1, body: { lifecycle_stage: 'live' } }]));
    await waitFor(() => expect(within(column('live')).getByRole('link', { name: 'Globex' })).toBeInTheDocument());
    await waitFor(() => expect(heading('live')).toHaveTextContent('Live · 2 · $189.6K'));
  });

  it('opens the churn modal on a drop into Churn: cancel changes nothing, confirming churns and reloads', async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    const dt = dataTransfer();
    fireEvent.dragStart(card(7), { dataTransfer: dt });
    fireEvent.dragOver(column('churn'), { dataTransfer: dt });
    fireEvent.drop(column('churn'), { dataTransfer: dt });
    expect(screen.getByRole('heading', { name: 'Churn Pizza Hut?' })).toBeInTheDocument();
    const before = portfolioQueries(spy).length;
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Churn Pizza Hut?' })).not.toBeInTheDocument();
    expect(patchBodies(spy)).toEqual([]);
    expect(portfolioQueries(spy)).toHaveLength(before);
    expect(within(column('live')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();

    // The same modal from the Move to… menu; confirming PATCHes churn and reloads the board.
    await chooseMove(7, 'Pizza Hut', 'Churn');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Churn' }));
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(1));
    expect(patchBodies(spy)[0]).toMatchObject({ id: 7, body: { lifecycle_stage: 'churn', churn_reason: '' } });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument());
    expect(heading('live')).toHaveTextContent('Live · 0 · $0');
    expect(screen.getByText('1 organization')).toBeInTheDocument();
  });

  it('lists churned cards in Churn once the view includes them', async () => {
    stubPortfolio();
    renderBoard();
    await ready();
    expect(within(column('churn')).getByText('Churned accounts are hidden.')).toBeInTheDocument();
    await userEvent.click(within(column('churn')).getByRole('button', { name: 'Show churned' }));
    expect(where().searchParams.get('include_churned')).toBe('1');
    expect(screen.getByRole('button', { name: 'Remove filter: Includes churned' })).toBeInTheDocument();
    expect(column('churn')).toContainElement(await screen.findByRole('link', { name: 'Initech' }));
    expect(heading('churn')).toHaveTextContent('Churn · 1 · $30.0K');
  });

  it('opens a card beside the board from sm, with Edit details, and keeps the board in place', async () => {
    stubPortfolio({ customer: customerFixture });
    renderBoard();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    const panel = screen.getByRole('complementary', { name: 'Pizza Hut' });
    expect(within(panel).getByText('Detractor')).toBeInTheDocument();
    expect(column('live')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Pizza Hut' })).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(within(panel).getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('heading', { name: 'Edit Pizza Hut' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Pizza Hut' })).not.toBeInTheDocument());

    await userEvent.click(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });

  it('closes the side panel when its card leaves the view (churned while churned accounts are hidden)', async () => {
    stubPortfolio({ customer: customerFixture });
    renderBoard();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('complementary', { name: 'Pizza Hut' })).toBeInTheDocument();
    await chooseMove(7, 'Pizza Hut', 'Churn');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Churn' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument());
  });

  it('keeps the side panel open, with fresh data, when a reload keeps its card in view', async () => {
    stubPortfolio({ customer: customerFixture });
    renderBoard();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    await chooseMove(7, 'Pizza Hut', 'Renewal');
    await waitFor(() => expect(moveButton(1)).toBeEnabled());
    expect(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByText(/^Carl CSM · Renewal ·/)).toBeInTheDocument();
  });

  it('closes the side panel when a filter leaves its card out', async () => {
    stubPortfolio();
    renderBoard();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' }), 'Globex');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument());
  });

  it('fills the frame height from sm: the frame, page and board are one flex column chain', async () => {
    stubPortfolio();
    renderBoard();
    await ready();
    const page = document.querySelector('[data-part="board-page"]') as HTMLElement;
    expect(page.parentElement).toHaveClass('flex', 'flex-col', 'min-h-0', 'overflow-y-auto');
    expect(page).toHaveClass('flex', 'flex-1', 'flex-col', 'min-h-0');
    const area = document.querySelector('[data-part="board-area"]') as HTMLElement;
    expect(area).toHaveClass('flex', 'flex-1', 'min-h-[360px]');
    expect(area.firstElementChild).toHaveClass('flex', 'flex-1', 'flex-col', 'min-h-0');
    expect(column('live').lastElementChild).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  });

  it('scrolls the columns sideways with a visible scrollbar, fading the right edge while more columns sit past it (UI broken-things fix 13)', async () => {
    stubPortfolio();
    renderBoard();
    await ready();
    const row = column('live').parentElement as HTMLElement;
    expect(row).toHaveClass('overflow-x-auto', 'rv-scrollbar', 'min-h-0');
    // jsdom lays nothing out: give the row a width and a wider content.
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 2100 });
    fireEvent.scroll(row);
    expect(row).toHaveAttribute('data-more', 'right');
    expect(row.className).toMatch(/mask-image:linear-gradient\(to_right/);
    row.scrollLeft = 1100;
    fireEvent.scroll(row);
    expect(row).not.toHaveAttribute('data-more');
    expect(row.className).not.toMatch(/mask-image/);
    // A card's figures line wraps rather than clipping its signal pill.
    const card = column('live').querySelector('[data-card-id]') as HTMLElement;
    const figures = [...card.querySelectorAll('[data-part="arr"]')].map((el) => el.parentElement!);
    expect(figures.some((line) => line.classList.contains('flex-wrap') && line.classList.contains('mt-2'))).toBe(true);
  });

  it('lays columns out as snapping panels with column tabs on phones, and opens cards in the bottom sheet', async () => {
    const spy = stubPortfolio();
    renderBoard('/organizations/board', { width: 375 });
    await ready();
    const tabs = screen.getByRole('navigation', { name: 'Board columns' });
    expect(column('live')).toHaveClass('w-full', 'snap-start');
    expect(card(7)).toHaveAttribute('draggable', 'false');

    await userEvent.click(within(column('live')).getByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('dialog', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();

    await chooseMove(7, 'Pizza Hut', 'Renewal');
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(1));
    expect(within(tabs).getByRole('button', { name: 'Renewal 1' })).toBeInTheDocument();
    await waitFor(() => expect(within(column('renewal')).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument());
  });

  it("adds into a stage from a column's +, and without a stage from the toolbar (ruling R2)", async () => {
    const spy = stubPortfolio();
    renderBoard();
    await ready();
    expect(within(column('churn')).queryByRole('button', { name: /^Add organization to / })).not.toBeInTheDocument();
    await userEvent.click(within(column('renewal')).getByRole('button', { name: 'Add organization to Renewal' }));
    expect(await screen.findByRole('combobox', { name: /lifecycle/i })).toHaveValue('renewal');
    const before = portfolioQueries(spy).length;
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('combobox', { name: /lifecycle/i })).not.toBeInTheDocument();
    // Cancelling changed nothing, so nothing reloads.
    await act(async () => {});
    expect(portfolioQueries(spy)).toHaveLength(before);

    await userEvent.click(screen.getByRole('button', { name: /^Add organization$/ }));
    expect(await screen.findByRole('combobox', { name: /lifecycle/i })).toHaveValue('onboarding');
  });

  it('moves focus to Search after a chip is removed, and links a card name to its page', async () => {
    stubPortfolio();
    renderBoard('/organizations/board?owner=2&health=average');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Remove filter: Health/ }));
    expect(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Owner: Carl CSM' }));
    expect(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' })).toHaveFocus();

    await userEvent.click(await screen.findByRole('link', { name: 'Pizza Hut' }));
    expect(screen.getByText('Organization page')).toBeInTheDocument();
  });

  it('lets the edit-open error be dismissed', async () => {
    stubPortfolio({ customer: undefined });
    renderBoard();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not stubbed');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a designed error with Try again when the board cannot load', async () => {
    let fail = true;
    stubPortfolio({ portfolio: (q) => (fail ? { status: 500, body: { detail: 'Server error' } } : buildPortfolio(q)) });
    renderBoard();
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });
});
