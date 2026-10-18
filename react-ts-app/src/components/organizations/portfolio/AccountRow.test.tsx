import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountRow, LONG_PRESS_MS, type AccountRowProps } from './AccountRow';
import { pizzaHut } from '../../../features/organizations/testPortfolio';

function renderRow(overrides: Partial<AccountRowProps> = {}) {
  const props: AccountRowProps = {
    row: pizzaHut,
    currency: 'USD',
    pins: [],
    isSm: false,
    selecting: false,
    selected: false,
    open: false,
    onToggleSelect: vi.fn(),
    onLongPress: vi.fn(),
    onToggleOpen: vi.fn(),
    ...overrides,
  };
  const view = render(
    <MemoryRouter>
      <ul>
        <AccountRow {...props} />
      </ul>
    </MemoryRouter>,
  );
  return { ...view, props, header: view.container.querySelector('[data-part="header"]') as HTMLElement };
}

describe('AccountRow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows all eight row elements on desktop', () => {
    const { container } = renderRow({ isSm: true });
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(container).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Health falling from 6.2 to 4.9 over 6 months' })).toBeInTheDocument();
    expect(screen.getByText('47d overdue')).toBeInTheDocument();
    expect(screen.getByText('$69.6K')).toHaveClass('tabular-nums');
    expect(container).toHaveTextContent('AI 1 · CSM 3');
    expect(screen.getByText('High Risk')).toBeInTheDocument();
    expect(screen.getByText('disagree')).toBeInTheDocument();
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
  });

  it('shows only the phone-card elements on phones, not the runway, pulse or pins', () => {
    const { container } = renderRow({ pins: ['nps'] });
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(container).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Health falling from 6.2 to 4.9 over 6 months' })).toBeInTheDocument();
    expect(screen.getByText('$69.6K')).toHaveClass('tabular-nums');
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
    expect(screen.queryByText('47d overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('High Risk')).not.toBeInTheDocument();
    expect(screen.queryByText('pulses disagree')).not.toBeInTheDocument();
    expect(container.querySelector('[data-pin="nps"]')).not.toBeInTheDocument();
  });

  it('opens from the row or the chevron, and the name navigates instead', async () => {
    const { props, header } = renderRow();
    await userEvent.click(header);
    expect(props.onToggleOpen).toHaveBeenCalledWith(pizzaHut);
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(props.onToggleOpen).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('link', { name: 'Pizza Hut' }));
    expect(props.onToggleOpen).toHaveBeenCalledTimes(2);
  });

  it('reports its open state on the chevron', () => {
    renderRow({ open: true, children: <div id="account-7-details">details</div> });
    const chevron = screen.getByRole('button', { name: 'Close Pizza Hut' });
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(chevron).toHaveAttribute('aria-controls', 'account-7-details');
    expect(screen.getByText('details')).toBeInTheDocument();
  });

  it('selects from its checkbox, and a tap selects while in selection mode', async () => {
    const { props, header } = renderRow({ selecting: true });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza Hut' }));
    expect(props.onToggleSelect).toHaveBeenCalledWith(7);
    await userEvent.click(header);
    expect(props.onToggleSelect).toHaveBeenCalledTimes(2);
    expect(props.onToggleOpen).not.toHaveBeenCalled();
  });

  it('tags archived and churned accounts in words', () => {
    const archived = renderRow({ row: { ...pizzaHut, is_archived: true } });
    expect(screen.getByText('Archived')).toBeInTheDocument();
    archived.unmount();
    const churned = renderRow({ isSm: true, row: { ...pizzaHut, churned: true, signal: null } });
    expect(screen.getByText('Churned')).toBeInTheDocument();
    churned.unmount();
    renderRow();
    expect(screen.queryByText(/^(Archived|Churned)$/)).not.toBeInTheDocument();
  });

  it('gives the name link a 44px target on phones', () => {
    renderRow();
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveClass('min-h-11');
  });

  it('shows pinned fields as chips on desktop', () => {
    const { container } = renderRow({ isSm: true, pins: ['nps', 'totalSeatUtilization'] });
    expect(container.querySelector('[data-pin="nps"]')).toHaveTextContent('NPS −80');
    expect(container.querySelector('[data-pin="totalSeatUtilization"]')).toHaveTextContent('Seats 16%');
  });

  it('starts selection on a long press and swallows the click that follows', () => {
    vi.useFakeTimers();
    const { props, header } = renderRow();
    fireEvent.pointerDown(header);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(props.onLongPress).toHaveBeenCalledWith(7);
    fireEvent.pointerUp(header);
    fireEvent.click(header);
    expect(props.onToggleOpen).not.toHaveBeenCalled();
  });

  it('treats a short press as a tap', () => {
    vi.useFakeTimers();
    const { props, header } = renderRow();
    fireEvent.pointerDown(header);
    vi.advanceTimersByTime(LONG_PRESS_MS - 300);
    fireEvent.pointerUp(header);
    fireEvent.click(header);
    expect(props.onLongPress).not.toHaveBeenCalled();
    expect(props.onToggleOpen).toHaveBeenCalledWith(pizzaHut);
  });

  it('clears the long-press timer on unmount so it never fires late', () => {
    vi.useFakeTimers();
    const { props, header, unmount } = renderRow();
    fireEvent.pointerDown(header);
    unmount();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(props.onLongPress).not.toHaveBeenCalled();
  });

  it('disables the checkbox while selectDisabled, and suppresses a long-press select', () => {
    vi.useFakeTimers();
    const { props, header } = renderRow({ selecting: true, selectDisabled: true });
    expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).toBeDisabled();
    fireEvent.pointerDown(header);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(props.onLongPress).not.toHaveBeenCalled();
  });

  it('disables an unchecked checkbox at the selection limit, but not a checked one', () => {
    const { unmount } = renderRow({ selecting: true, atLimit: true, selected: false });
    const unchecked = screen.getByRole('checkbox', { name: 'Select Pizza Hut' });
    expect(unchecked).toBeDisabled();
    expect(unchecked).toHaveAttribute('title', '500 is the most you can select at once');
    unmount();

    renderRow({ selecting: true, atLimit: true, selected: true });
    expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).not.toBeDisabled();
  });

  it('reaches the chevron by Tab and toggles it with Enter and Space', async () => {
    const user = userEvent.setup();
    const { props } = renderRow();
    const chevron = screen.getByRole('button', { name: 'Open Pizza Hut' });
    for (let i = 0; i < 8 && document.activeElement !== chevron; i++) {
      await user.tab();
    }
    expect(chevron).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onToggleOpen).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(props.onToggleOpen).toHaveBeenCalledTimes(2);
  });

  it('has no checkbox and ignores a long press when it is not selectable', () => {
    vi.useFakeTimers();
    const { props, header } = renderRow({ selectable: false });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.pointerDown(header);
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(props.onLongPress).not.toHaveBeenCalled();
  });

  it('puts a menu in the row whose clicks never open the row', () => {
    const { props } = renderRow({ menu: <button type="button">Row menu</button> });
    fireEvent.click(screen.getByRole('button', { name: 'Row menu' }));
    expect(props.onToggleOpen).not.toHaveBeenCalled();
  });
});

describe('AccountRow on the list card (Records PR)', () => {
  it('is a flat row of the one list card: no card of its own, a grid once its column is 62rem wide', () => {
    renderRow();
    const li = document.querySelector('[data-row-id]')!;
    expect(li.className).not.toMatch(/rounded-xl|bg-surface|shadow/);
    const header = li.querySelector('[data-part="header"]')!;
    expect(header).toHaveClass('px-4', 'py-3', 'hover:bg-subtle', '@min-[62rem]:grid', '@min-[62rem]:gap-x-2', 'flex-wrap', '@min-[62rem]:flex-nowrap');
    expect(li.querySelector('[data-part="header"] span.order-3')).toHaveClass('@min-[62rem]:justify-start', 'sm:w-32');
    expect(header.className).toContain('@min-[62rem]:grid-cols-[4.5rem_minmax(12rem,1fr)_4rem_7rem_5rem_10rem_8rem_5rem]');
  });
});
