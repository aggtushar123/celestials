import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderOrganizations } from '../pages/organizations/testList';
import { patchBodies, pizzaHut, portfolioQueries, stubPortfolio } from '../features/organizations/testPortfolio';
import { installIntersectionObserver } from '../test/intersection';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, both Organizations
// pages, the store and the router. Only fetch is stubbed, with §2-shaped
// bodies, and PATCH /customers/<id>/ writes into the stub's book.
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const views = () => screen.getByRole('navigation', { name: 'Organizations views' });
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

/** BoardCard's "Move to…" is an icon button ("Move <name> to…") opening a
 *  menu (MoveToMenu), never a `<select>`: click it, then the target's
 *  `menuitem`, scoped to one card's own DOM node by its `data-card-id`. */
async function moveCardTo(id: number, label: string) {
  await userEvent.click(within(card(id)).getByRole('button', { name: /^Move .+ to…$/ }));
  await userEvent.click(within(card(id)).getByRole('menuitem', { name: label }));
}

describe('Organizations board', () => {
  // jsdom has no scrollIntoView; the phone column tabs call it.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('keeps a list filter on the board, opens a card, moves it, churns it by drag, and goes back', { timeout: 30000 }, async () => {
    const spy = stubPortfolio();
    renderOrganizations('/organizations/list', { nav: true });
    await screen.findByRole('link', { name: 'Globex' });

    // 1. Filter on the List: owner Carl CSM.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();

    // 2. The Board tab in the real top bar carries the filter; the board groups by lifecycle.
    await userEvent.click(within(views()).getByRole('link', { name: 'Board' }));
    expect(where().pathname).toBe('/organizations/board');
    expect(where().searchParams.get('owner')).toBe('2');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Owner: Carl CSM' })).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(column('live')).toContainElement(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument();
    expect(
      portfolioQueries(spy).some((q) => q.get('group') === 'lifecycle' && q.get('owner') === '2' && q.get('limit') === '1'),
    ).toBe(true);

    // 3. Open Pizza Hut beside the board.
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByText('Detractor')).toBeInTheDocument();

    // 4. Move it to Renewal from its Move to… menu; the open panel follows.
    await moveCardTo(7, 'Renewal');
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 7, body: { lifecycle_stage: 'renewal' } }]));
    expect(await screen.findByText('Moved Pizza Hut to Renewal.')).toBeInTheDocument();
    await waitFor(() => expect(within(column('renewal')).getByRole('heading')).toHaveTextContent('Renewal · 1 · $69.6K'));
    expect(within(column('live')).getByRole('heading')).toHaveTextContent('Live · 0 · $0');
    await waitFor(() =>
      expect(within(screen.getByRole('complementary', { name: 'Pizza Hut' })).getByText(/^Carl CSM · Renewal ·/)).toBeInTheDocument(),
    );

    // 5. Once the move has settled (one move at a time), drag it into Churn:
    // the churn modal opens; confirming churns it and it leaves the board.
    await waitFor(() => expect(within(card(7)).getByRole('button', { name: 'Move Pizza Hut to…' })).toBeEnabled());
    // Focus followed the card into its new column.
    expect(within(column('renewal')).getByRole('button', { name: 'Close Pizza Hut' })).toHaveFocus();
    const dt = { setData: vi.fn(), effectAllowed: 'all', dropEffect: 'none' };
    fireEvent.dragStart(card(7), { dataTransfer: dt });
    fireEvent.dragOver(column('churn'), { dataTransfer: dt });
    fireEvent.drop(column('churn'), { dataTransfer: dt });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Churn' }));
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(2));
    expect(patchBodies(spy)[1].body).toMatchObject({ lifecycle_stage: 'churn' });
    expect(await screen.findByText('No organizations match these filters')).toBeInTheDocument();

    // 6. Back to the List: the filter is still there.
    await userEvent.click(within(views()).getByRole('link', { name: 'List' }));
    expect(where().pathname).toBe('/organizations/list');
    expect(where().searchParams.get('owner')).toBe('2');
  });

  it('pages a long column as it scrolls, and moves a card on a phone from the column tabs', { timeout: 30000 }, async () => {
    const io = installIntersectionObserver();
    const many = Array.from({ length: 30 }, (_, i) => ({ ...pizzaHut, id: 100 + i, name: `Account ${i + 1}` }));
    const spy = stubPortfolio({ rows: many });
    renderOrganizations('/organizations/board', { width: 375, nav: true });
    await screen.findByRole('link', { name: 'Account 1' });
    const live = column('live');
    expect(within(live).getAllByRole('link')).toHaveLength(25);
    await act(async () => io.reveal(live.querySelector('[data-sentinel]')!));
    await waitFor(() => expect(within(live).getAllByRole('link')).toHaveLength(30));

    const tabs = screen.getByRole('navigation', { name: 'Board columns' });
    await userEvent.click(within(tabs).getByRole('button', { name: 'Renewal 0' }));
    expect(within(tabs).getByRole('button', { name: 'Renewal 0' })).toHaveAttribute('aria-current', 'true');

    await moveCardTo(100, 'Renewal');
    await waitFor(() => expect(patchBodies(spy)).toEqual([{ id: 100, body: { lifecycle_stage: 'renewal' } }]));
    await waitFor(() => expect(within(tabs).getByRole('button', { name: 'Renewal 1' })).toBeInTheDocument());
    await waitFor(() => expect(within(column('renewal')).getByRole('link', { name: 'Account 1' })).toBeInTheDocument());
    await waitFor(() => expect(within(tabs).getByRole('button', { name: 'Live 29' })).toBeInTheDocument());
  });
});
