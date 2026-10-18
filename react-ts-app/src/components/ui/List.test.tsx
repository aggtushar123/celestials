import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ListCard, ListHeaderRow, ListRow, TD, TD_NUM, TH } from './List';
import { LoadingState } from './States';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderList(rows: ReactNode, state?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
      <ListCard label="Organizations" state={state}>
        {rows}
      </ListCard>
    </MemoryRouter>,
  );
}

describe('ListCard (UI foundations spec §4.2)', () => {
  it('is one flat card holding one labelled, divided list', () => {
    renderList(<ListRow title="Uber" />);
    const list = screen.getByRole('list', { name: 'Organizations' });
    expect(list).toHaveClass('divide-y', 'divide-line-subtle');
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'overflow-hidden');
    expect(list.parentElement!.className).not.toMatch(/\bp-4\b/);
  });

  it('shows a state in place of the list, inside the same card', () => {
    renderList(<ListRow title="Uber" />, <LoadingState label="Loading organizations" />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('status').parentElement).toHaveClass('rounded-xl', 'border-line');
  });
});

describe('ListRow', () => {
  it('opens its route from the title, stretched over the row, on click and on Enter', async () => {
    renderList(<ListRow title="Uber" meta="Carl CSM · Renewal" href="/organizations/19" />);
    const link = screen.getByRole('link', { name: 'Uber' });
    expect(link).toHaveAttribute('title', 'Uber');
    expect(link).toHaveClass('truncate', 'font-semibold', 'after:absolute', 'after:inset-0');
    expect(link.closest('li')).toHaveClass('group', 'relative', 'min-h-14', 'py-3', 'hover:bg-subtle');
    expect(screen.getByText('Carl CSM · Renewal')).toHaveClass('text-[11px]', 'truncate');
    await userEvent.tab();
    expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/organizations/19');
  });

  it('opens in place from a title button, and marks the selected row current', async () => {
    const onSelect = vi.fn();
    renderList(<ListRow title="Stripe" onSelect={onSelect} selected />);
    const button = screen.getByRole('button', { name: 'Stripe' });
    expect(button).toHaveAttribute('aria-current', 'true');
    expect(button.closest('li')).toHaveClass('bg-subtle');
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('is plain text with no hover when it opens nothing', () => {
    renderList(<ListRow title="Read only" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Read only').closest('li')).not.toHaveClass('hover:bg-subtle');
  });

  it('keeps trailing controls above the stretched link and hides actions until hover or focus from sm', () => {
    renderList(
      <ListRow title="Uber" href="/organizations/19" trailing={<span>Risk 55</span>} actions={<button type="button">Ask about this</button>} density="compact" />,
    );
    const row = screen.getByRole('link', { name: 'Uber' }).closest('li')!;
    expect(row).toHaveClass('min-h-11', 'py-2');
    expect(within(row).getByText('Risk 55').parentElement).toHaveClass('relative', 'z-10');
    expect(within(row).getByRole('button', { name: 'Ask about this' }).parentElement).toHaveClass(
      'relative',
      'z-10',
      'sm:opacity-0',
      'sm:group-hover:opacity-100',
      'sm:group-focus-within:opacity-100',
      '[@media(hover:none)]:opacity-100',
    );
  });

  it('becomes a grid on a column template, with its cells in order', () => {
    const columns = 'sm:grid-cols-[minmax(12rem,1fr)_6rem_auto]';
    render(
      <MemoryRouter>
        <ListCard label="Pipelines" header={<ListHeaderRow columns={columns} labels={['Name', 'MRR', '']} />}>
          <ListRow title="Expansion" columns={columns} cells={[<span key="mrr">$2.0K</span>]} />
        </ListCard>
      </MemoryRouter>,
    );
    const row = screen.getByText('Expansion').closest('li')!;
    expect(row).toHaveClass('grid', columns);
    expect(within(row).getByText('$2.0K').parentElement).toHaveClass('min-w-0');
    const header = screen.getByText('MRR').parentElement!;
    expect(header).toHaveClass('hidden', 'sm:grid', columns);
    expect(header).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('table constants', () => {
  it('match the spec', () => {
    expect(TH).toBe('px-4 py-2 text-[11px] leading-4 font-semibold text-ink-muted');
    expect(TD).toBe('px-4 py-3 text-[13px] leading-5 align-middle');
    expect(TD_NUM).toBe(`${TD} text-right tabular-nums`);
  });
});

describe('ListRow and ListHeaderRow additions', () => {
  it('carries data attributes onto the row, and shows column labels from a chosen breakpoint', () => {
    const columns = '@min-[60rem]:grid-cols-[auto_minmax(12rem,1fr)]';
    render(
      <MemoryRouter>
        <ListCard label="Files" header={<ListHeaderRow columns={columns} labels={['', 'Name']} show="@min-[60rem]:grid" />}>
          <ListRow title="Brief.pdf" dataAttrs={{ 'data-file': 7 }} />
        </ListCard>
      </MemoryRouter>,
    );
    expect(screen.getByText('Brief.pdf').closest('li')).toHaveAttribute('data-file', '7');
    const header = screen.getByText('Name').parentElement!;
    expect(header).toHaveClass('hidden', '@min-[60rem]:grid');
    expect(header).not.toHaveClass('sm:grid');
  });
});

describe('ListHeaderRow alignment', () => {
  it('right-aligns the labels asked for', () => {
    render(<ListHeaderRow columns="" labels={['Name', 'ARR']} align={['left', 'right']} />);
    expect(screen.getByText('ARR')).toHaveClass('text-right');
    expect(screen.getByText('Name')).not.toHaveClass('text-right');
  });
});

describe('ListRow gridAt and strong (Ops PR)', () => {
  const gridAt = { row: '@min-[60rem]:grid', cell: '@min-[60rem]:block' };
  const columns = '@min-[60rem]:grid-cols-[minmax(14rem,1fr)_5rem]';

  it('is one flex line with hidden cells below the breakpoint, and a grid on its columns from it', () => {
    render(
      <MemoryRouter>
        <ListCard label="Pipeline">
          <ListRow title="Seat expansion" meta="Part of Uber" columns={columns} gridAt={gridAt} cells={[<span key="mrr">$5.1K</span>]} />
        </ListCard>
      </MemoryRouter>,
    );
    const li = screen.getByText('Seat expansion').closest('li')!;
    expect(li).toHaveClass('flex', '@min-[60rem]:grid', '@min-[60rem]:grid-cols-[minmax(14rem,1fr)_5rem]');
    expect(li).not.toHaveClass('grid');
    expect(screen.getByText('$5.1K').parentElement).toHaveClass('hidden', 'min-w-0', '@min-[60rem]:block');
  });

  it('keeps a columns row a grid at every width without gridAt (the Records rows)', () => {
    render(
      <MemoryRouter>
        <ListCard label="Deals">
          <ListRow title="Renewal" columns={columns} cells={[<span key="mrr">$1K</span>]} />
        </ListCard>
      </MemoryRouter>,
    );
    expect(screen.getByText('Renewal').closest('li')).toHaveClass('grid');
    expect(screen.getByText('$1K').parentElement).not.toHaveClass('hidden');
  });

  it('sets a quiet title in the regular weight', () => {
    render(
      <MemoryRouter>
        <ListCard label="Mail">
          <ListRow title="Read already" onSelect={() => {}} strong={false} />
          <ListRow title="Not read yet" onSelect={() => {}} />
        </ListCard>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Read already' })).toHaveClass('font-normal');
    expect(screen.getByRole('button', { name: 'Read already' })).not.toHaveClass('font-semibold');
    expect(screen.getByRole('button', { name: 'Not read yet' })).toHaveClass('font-semibold');
  });
});

describe('ListCard footer and busy (Impact PR)', () => {
  it('draws a footer inside the card only when given, and marks a list busy', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ListCard label="Plans" busy footer={<button type="button">Show more</button>}>
          <ListRow title="Onboarding" />
        </ListCard>
      </MemoryRouter>,
    );
    const list = screen.getByRole('list', { name: 'Plans' });
    expect(list).toHaveAttribute('aria-busy', 'true');
    const footer = screen.getByRole('button', { name: 'Show more' }).parentElement!;
    expect(footer).toHaveAttribute('data-part', 'list-footer');
    expect(footer).toHaveClass('border-t', 'border-line-subtle', 'px-4');
    expect(footer.parentElement).toBe(list.parentElement);
    rerender(
      <MemoryRouter>
        <ListCard label="Plans">
          <ListRow title="Onboarding" />
        </ListCard>
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-part="list-footer"]')).toBeNull();
    expect(screen.getByRole('list', { name: 'Plans' })).not.toHaveAttribute('aria-busy');
  });
});
