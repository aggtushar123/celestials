import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport, setViewport } from '../../test/viewport';
import { PRIMARY } from './styles';
import { Toolbar } from './Toolbar';

const exportCsv = vi.fn();
const SECONDARY = [
  { key: 'export', label: 'Export', onSelect: exportCsv },
  { key: 'import', label: 'Import', onSelect: vi.fn() },
  { key: 'archive', label: 'Archive', onSelect: vi.fn(), danger: true },
];

function renderToolbar(count?: string) {
  return render(
    <Toolbar
      lead={<button type="button">Opportunities</button>}
      search={<input aria-label="Search" />}
      filters={<button type="button">Owner</button>}
      actions={{
        primary: (
          <button type="button" className={PRIMARY}>
            New organization
          </button>
        ),
        secondary: SECONDARY,
      }}
      count={count}
    />,
  );
}

describe('Toolbar (UI foundations spec §5.6)', () => {
  afterEach(() => {
    resetViewport();
    exportCsv.mockClear();
  });

  it('shows two secondaries from sm, folds the rest into More actions, and puts the primary last', async () => {
    setViewport(1440);
    const { container } = renderToolbar('14 organizations');
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    const buttons = [...container.querySelectorAll('button')].map((button) => button.textContent || button.getAttribute('aria-label'));
    expect(buttons).toEqual(['Opportunities', 'Owner', 'Export', 'Import', 'More actions', 'New organization']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu', { name: 'More actions' })).getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(exportCsv).toHaveBeenCalledTimes(1);
  });

  it('folds every secondary into the menu below sm', async () => {
    setViewport(390);
    renderToolbar();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Export', 'Import', 'Archive']);
  });

  it('announces the count politely beside the search, and keeps the region mounted without one', () => {
    setViewport(1440);
    const { rerender } = renderToolbar();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
    expect(status.parentElement).toContainElement(screen.getByRole('textbox', { name: 'Search' }));
    rerender(
      <Toolbar search={<input aria-label="Search" />} count="14 organizations" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('14 organizations');
    expect(screen.getByRole('status')).toHaveClass('text-[13px]', 'text-ink-muted', 'tabular-nums');
  });

  it('puts an extra control in the actions\' own right-aligned group, so they always wrap together', () => {
    setViewport(1440);
    render(
      <Toolbar
        search={<input aria-label="Search" />}
        filters={<button type="button">Owner</button>}
        actions={{ extra: <button type="button">Pin fields</button>, secondary: SECONDARY.slice(0, 1) }}
      />,
    );
    const group = screen.getByRole('button', { name: 'Pin fields' }).parentElement!;
    expect(group).toHaveClass('ml-auto', 'flex');
    expect(group).toContainElement(screen.getByRole('button', { name: 'Export' }));
    expect(group).not.toContainElement(screen.getByRole('button', { name: 'Owner' }));
  });

  it('draws no menu when nothing is folded', () => {
    setViewport(1440);
    render(<Toolbar search={<input aria-label="Search" />} actions={{ secondary: SECONDARY.slice(0, 2) }} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
  it('keeps the DOM in the desktop order (lead, search), and lifts the search and count to row 1 below sm (WCAG 2.4.3)', () => {
    setViewport(390);
    const { container } = renderToolbar('14 organizations');
    const bar = container.firstElementChild as HTMLElement;
    const search = screen.getByRole('textbox', { name: 'Search' }).closest('[data-part="toolbar-search"]')!;
    const lead = screen.getByRole('button', { name: 'Opportunities' }).closest('[data-part="toolbar-lead"]')!;
    expect(bar.firstElementChild).toBe(lead);
    expect(lead.nextElementSibling).toBe(search);
    expect(search).toHaveClass('basis-full', 'sm:flex-1', 'sm:basis-auto', 'max-sm:-order-1');
    expect(lead.className).not.toMatch(/order/);
  });
});

describe('Toolbar without a search (Impact PR)', () => {
  afterEach(() => resetViewport());

  it('keeps the count inline and live when there is no search, with no phone row of its own', () => {
    setViewport(390);
    render(<Toolbar lead={<button type="button">Mine</button>} count="4 campaigns" actions={{ primary: <button type="button">New campaign</button> }} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('4 campaigns');
    const wrap = status.parentElement!;
    expect(wrap).toHaveAttribute('data-part', 'toolbar-search');
    expect(wrap).not.toHaveClass('basis-full');
    expect(wrap).not.toHaveClass('max-sm:-order-1');
  });

  it('lets a caller send focus to the count', () => {
    const ref = createRef<HTMLParagraphElement>();
    render(<Toolbar search={<input aria-label="Search members" />} count="3 members" countRef={ref} />);
    expect(ref.current).toBe(screen.getByRole('status'));
    expect(ref.current).toHaveAttribute('tabindex', '-1');
    expect(ref.current).toHaveClass('focus-visible:outline-accent');
  });
});
