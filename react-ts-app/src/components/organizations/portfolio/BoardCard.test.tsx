import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { globex, pizzaHut } from '../../../features/organizations/testPortfolio';
import { BoardCard, type BoardCardProps } from './BoardCard';

function renderCard(overrides: Partial<BoardCardProps> = {}) {
  const props: BoardCardProps = {
    row: pizzaHut,
    currency: 'USD',
    isSm: true,
    open: false,
    canMove: true,
    moveDisabled: false,
    onOpen: vi.fn(),
    onMove: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      {/* A focusable element outside the card, for the outside-click focus tests. */}
      <button type="button">Elsewhere</button>
      <ul>
        <BoardCard {...props} />
      </ul>
    </MemoryRouter>,
  );
  return props;
}
const card = (id = 7) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

describe('BoardCard', () => {
  it('shows the ring, name link, owner, ARR, signal and trend', () => {
    renderCard();
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(screen.getByText('Carl CSM')).toBeInTheDocument();
    expect(screen.getByText('$69.6K')).toBeInTheDocument();
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Health falling from 6.2 to 4.9 over 6 months' })).toBeInTheDocument();
  });

  it('opens on a click anywhere but the name, and from its Open button', async () => {
    const { onOpen } = renderCard();
    await userEvent.click(screen.getByText('$69.6K'));
    expect(onOpen).toHaveBeenLastCalledWith(pizzaHut);
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('says when it is open, and which panel it controls', () => {
    renderCard({ open: true });
    const button = screen.getByRole('button', { name: 'Close Pizza Hut' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'board-account-details');
    expect(card()).toHaveClass('ring-1', 'ring-accent');
  });

  // R1: "Move to…" is a menu button (role=menu / menuitem), not a native
  // select acting on change. Same behavioural assertions as the select
  // version: every other stage listed (Churn included), choosing one moves
  // without opening, and nothing moves until a stage is chosen.
  it('moves from the Move to… menu (every other stage, Churn included) without opening', async () => {
    const { onMove, onOpen } = renderCard();
    const button = screen.getByRole('button', { name: 'Move Pizza Hut to…' });
    // B1: a compact icon button in the card header, 44px on phones.
    expect(button).toHaveClass('min-h-11', 'min-w-11', 'sm:min-h-9', 'sm:min-w-9');
    expect(button.textContent).toBe('');
    expect(button.closest('[data-part="card-header"]')).not.toBeNull();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = within(card()).getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Onboarding', 'Kickoff', 'Adoption', 'Renewal', 'Churn', 'Expansion', 'Other',
    ]);
    expect(onMove).not.toHaveBeenCalled();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Adoption' }));
    expect(onMove).toHaveBeenCalledWith(pizzaHut, 'adoption', true);
    expect(onOpen).not.toHaveBeenCalled();
    expect(within(card()).queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves the menu selection with Arrow Down / Arrow Up', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    const menu = within(card()).getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(items[0]).toHaveFocus();
  });

  it('jumps to the first and last item with Home and End', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    const items = within(within(card()).getByRole('menu')).getAllByRole('menuitem');
    await user.keyboard('{End}');
    expect(items[items.length - 1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
  });

  it('closes the menu when Tab moves focus out of it, without pulling focus back', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    expect(within(card()).getByRole('menu')).toBeInTheDocument();
    await user.tab();
    await waitFor(() => expect(within(card()).queryByRole('menu')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open Pizza Hut' })).toHaveFocus();
  });

  it('closes the menu on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    renderCard();
    const button = screen.getByRole('button', { name: 'Move Pizza Hut to…' });
    await user.click(button);
    expect(within(card()).getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(within(card()).queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes the menu on a click outside, without moving focus', async () => {
    const user = userEvent.setup();
    renderCard();
    const button = screen.getByRole('button', { name: 'Move Pizza Hut to…' });
    await user.click(button);
    expect(within(card()).getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(within(card()).queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves focus on the element an outside click landed on', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    expect(within(card()).getByRole('menu')).toBeInTheDocument();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    await user.click(elsewhere);
    expect(within(card()).queryByRole('menu')).not.toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
  });

  it("closes another card's open menu when its own opens", async () => {
    const user = userEvent.setup();
    const props = { currency: 'USD' as const, isSm: true, open: false, canMove: true, moveDisabled: false, onOpen: vi.fn(), onMove: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn() };
    render(
      <MemoryRouter>
        <ul>
          <BoardCard row={pizzaHut} {...props} />
          <BoardCard row={globex} {...props} />
        </ul>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    await user.click(screen.getByRole('button', { name: 'Move Globex to…' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu', { name: 'Move Globex to' })).toBeInTheDocument();
  });

  it('tells the board a move came from the menu, so focus can follow the card', async () => {
    const { onMove } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    await userEvent.click(within(within(card()).getByRole('menu')).getByRole('menuitem', { name: 'Renewal' }));
    expect(onMove).toHaveBeenCalledWith(pizzaHut, 'renewal', true);
  });

  it('is memoised, so a board re-render does not re-render every card', () => {
    expect((BoardCard as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('drags from sm, handing over its id', () => {
    const { onDragStart, onDragEnd } = renderCard();
    expect(card()).toHaveAttribute('draggable', 'true');
    const dataTransfer = { setData: vi.fn(), effectAllowed: 'all' };
    fireEvent.dragStart(card(), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith(pizzaHut);
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '7');
    expect(dataTransfer.effectAllowed).toBe('move');
    fireEvent.dragEnd(card());
    expect(onDragEnd).toHaveBeenCalled();
  });

  it('does not drag on phones, where Move to… is the way', () => {
    renderCard({ isSm: false });
    expect(card()).toHaveAttribute('draggable', 'false');
    expect(screen.getByRole('button', { name: 'Move Pizza Hut to…' })).toBeEnabled();
  });

  it('neither drags nor moves while a move is saving', () => {
    const { onDragStart } = renderCard({ moveDisabled: true });
    expect(card()).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(card(), { dataTransfer: { setData: vi.fn() } });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Move Pizza Hut to…' })).toBeDisabled();
  });

  it('has no Move to… and does not drag for other groupings', () => {
    renderCard({ canMove: false });
    expect(screen.queryByRole('button', { name: 'Move Pizza Hut to…' })).not.toBeInTheDocument();
    expect(card()).toHaveAttribute('draggable', 'false');
  });

  it('prints a dash for ARR with no exchange rate, and no tag without a signal', () => {
    renderCard({ row: { ...globex, arr: null } });
    expect(within(card(1)).getByText('—')).toBeInTheDocument();
    expect(within(card(1)).queryByText('Renewal overdue')).not.toBeInTheDocument();
  });

  describe('Move to… menu placement (B3: the visible box)', () => {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 200, width: 200, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const menu = () => screen.getByRole('menu');
    const button = () => screen.getByRole('button', { name: 'Move Pizza Hut to…' });

    afterEach(() => vi.restoreAllMocks());

    it('opens below the button when there is room, at full height', async () => {
      renderCard();
      vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(rect(100, 132));
      await userEvent.click(button());
      expect(menu()).toHaveClass('top-full');
      expect(menu().style.maxHeight).toBe('224px');
      expect(menu()).toHaveClass('overflow-y-auto');
    });

    it('opens upward near the bottom of the window, so it is not cut off', async () => {
      renderCard();
      vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(rect(window.innerHeight - 60, window.innerHeight - 28));
      await userEvent.click(button());
      expect(menu()).toHaveClass('bottom-full');
      expect(menu()).not.toHaveClass('top-full');
    });

    it('measures a scrolling column that runs past the window by its visible part only', async () => {
      renderCard();
      const list = card().parentElement as HTMLElement;
      list.style.overflowY = 'auto';
      // The column extends far below the window: only the window's bottom counts.
      vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, window.innerHeight + 2000));
      vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(rect(window.innerHeight - 100, window.innerHeight - 64));
      await userEvent.click(button());
      expect(menu()).toHaveClass('bottom-full');
    });

    it('opens upward near the bottom of a scrolling column that would clip it', async () => {
      renderCard();
      const list = card().parentElement as HTMLElement;
      list.style.overflowY = 'auto';
      vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, 400));
      vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(rect(340, 372));
      await userEvent.click(button());
      expect(menu()).toHaveClass('bottom-full');
    });

    it('caps its height to the larger side when neither side has room, and scrolls', async () => {
      renderCard();
      const list = card().parentElement as HTMLElement;
      list.style.overflowY = 'auto';
      vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(200, 500));
      vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(rect(320, 356));
      await userEvent.click(button());
      // 140px below (500 - 356 - 4 gap) beats 116px above (320 - 200 - 4).
      expect(menu()).toHaveClass('top-full');
      expect(menu().style.maxHeight).toBe('140px');
      expect(menu()).toHaveClass('overflow-y-auto');
    });
  });

  it('is a flat Card whose buttons wait for hover or focus from sm, and stay in the row on phones and while open', () => {
    renderCard({ open: false });
    const el = card();
    expect(el).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'p-3', 'group', 'relative');
    expect(el.className).not.toMatch(/shadow/);
    const open = el.querySelector('[data-part="open"]')!;
    expect(open.parentElement).toHaveClass('sm:has-[[aria-expanded=true]]:opacity-100', 'sm:absolute', 'sm:opacity-0', 'sm:group-hover:opacity-100', 'sm:group-focus-within:opacity-100', '[@media(hover:none)]:opacity-100');
    expect(el.querySelector('[data-part="arr"]')).toHaveClass('tabular-nums');
  });

  it('keeps its buttons in the row, and rings the card, while open', () => {
    renderCard({ open: true });
    const shown = card().querySelector('[data-part="open"]')!.parentElement!;
    expect(shown.className).not.toMatch(/opacity-0/);
    expect(card()).toHaveClass('ring-1', 'ring-accent');
  });
});
