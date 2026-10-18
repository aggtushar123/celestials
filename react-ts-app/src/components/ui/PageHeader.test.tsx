import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetViewport, setViewport } from '../../test/viewport';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { PageBody, PageHeader, PageHeaderActions, ScrollSentinel } from './PageHeader';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

describe('PageHeader (UI foundations spec §6.1)', () => {
  afterEach(() => resetViewport());

  it('titles the page with an h1 in the bar, tabs beside it and actions on the right', () => {
    setViewport(1440);
    render(
      <MemoryRouter>
        <PageHeader
          title="Organizations"
          tabs={<nav aria-label="Views">tabs</nav>}
          actions={{ primary: <button type="button">New organization</button>, secondary: [{ key: 'export', label: 'Export', onSelect: vi.fn() }] }}
        />
      </MemoryRouter>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Organizations' });
    expect(title).toHaveClass('text-[15px]', 'font-semibold', 'truncate');
    const bar = title.closest('[data-page-header]')!;
    expect(bar).toHaveClass('h-16', 'px-4', 'border-b', 'border-transparent', 'data-[scrolled]:border-line-subtle');
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New organization' })).toBeInTheDocument();
  });

  it('shows Back instead of the title, keeping the h1 for screen readers', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Uber" back={{ to: '/organizations/list', label: 'Organizations' }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Organizations' })).toHaveAttribute('href', '/organizations/list');
    expect(screen.getByRole('heading', { level: 1, name: 'Uber' })).toHaveClass('sr-only');
  });
});

describe('PageBody (spec §6.2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['full', null],
    ['reading', 'max-w-5xl'],
    ['form', 'max-w-3xl'],
  ] as const)('caps the %s width', (width, cap) => {
    render(<PageBody width={width}>Content</PageBody>);
    const body = screen.getByText('Content');
    expect(body).toHaveClass('flex', 'w-full', 'flex-col', 'gap-4', 'px-4', 'pb-8');
    if (cap) expect(body).toHaveClass(cap);
    else expect(body.className).not.toMatch(/max-w-/);
  });

  it("draws the header's hairline once the sentinel scrolls out of view, and drops it when back", () => {
    let callback: Callback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      <MemoryRouter>
        <PageHeader title="Organizations" />
        <PageBody>Content</PageBody>
      </MemoryRouter>,
    );
    const bar = screen.getByRole('heading', { level: 1 }).closest('[data-page-header]')!;
    expect(bar).not.toHaveAttribute('data-scrolled');
    act(() => callback([{ isIntersecting: false }]));
    expect(bar).toHaveAttribute('data-scrolled');
    act(() => callback([{ isIntersecting: true }]));
    expect(bar).not.toHaveAttribute('data-scrolled');
  });
});

describe('PageHeader in the Navbar bar (Records PR)', () => {
  it('draws into the title slot when the layout has one, and no bar of its own', () => {
    const slot = document.createElement('div');
    document.body.append(slot);
    render(
      <MemoryRouter>
        <NavActionsSlotContext.Provider value={{ slot: null, setSlot: () => {}, titleSlot: slot, setTitleSlot: () => {} }}>
          <PageHeader title="Organizations" tabs={<nav aria-label="Organizations views">tabs</nav>} />
        </NavActionsSlotContext.Provider>
      </MemoryRouter>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Organizations' });
    expect(slot).toContainElement(heading);
    expect(heading).toHaveClass('min-w-0', 'truncate', 'text-[15px]');
    expect(screen.getByRole('navigation', { name: 'Organizations views' }).parentElement).toHaveClass('max-sm:order-last', 'max-sm:basis-full', 'max-sm:h-11');
    expect(document.querySelector('[data-page-header]')).toBeNull();
    slot.remove();
  });

  it('leads back from a record page inside a Breadcrumb nav, with no h1 when the page names itself', () => {
    render(
      <MemoryRouter>
        <PageHeader back={{ to: '/organizations/list', label: 'Organizations' }} />
      </MemoryRouter>,
    );
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Organizations' });
    expect(back).toHaveAttribute('href', '/organizations/list');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    // Below sm the bar wraps, so the Back row has its own 44px height: a
    // full-height link would stretch the first row and push the bar's tools
    // out of the bar, over the record's name.
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('h-full', 'max-sm:h-11');
    // Below sm the label is for screen readers only, so the bar fits one
    // row: a 44px chevron, still named for where it goes.
    expect(screen.getByText('Organizations')).toHaveClass('max-sm:sr-only');
    expect(back).toHaveClass('max-sm:min-w-11');
  });
});

describe('ScrollSentinel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks the page header scrolled while the sentinel is out of view', () => {
    let callback: Callback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      <>
        <header data-page-header="" />
        <ScrollSentinel />
      </>,
    );
    const bar = document.querySelector('[data-page-header]')!;
    act(() => callback([{ isIntersecting: false }]));
    expect(bar).toHaveAttribute('data-scrolled');
    act(() => callback([{ isIntersecting: true }]));
    expect(bar).not.toHaveAttribute('data-scrolled');
    expect(document.querySelector('[data-part="scroll-sentinel"]')).toHaveClass('h-px', '-mb-px', 'shrink-0');
  });

  it('clears the hairline when it unmounts, so the shared bar does not keep it on the next route', () => {
    let callback: Callback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const bar = document.createElement('header');
    bar.setAttribute('data-page-header', '');
    document.body.append(bar);
    const { unmount } = render(<ScrollSentinel />);
    act(() => callback([{ isIntersecting: false }]));
    expect(bar).toHaveAttribute('data-scrolled');
    unmount();
    expect(bar).not.toHaveAttribute('data-scrolled');
    bar.remove();
  });
});

describe('PageHeaderActions (Ops PR)', () => {
  afterEach(() => resetViewport());

  it("puts a page's controls in the bar's actions slot from sm, before the Ask controls", () => {
    setViewport(1440);
    const slot = document.createElement('div');
    document.body.append(slot);
    render(
      <NavActionsSlotContext.Provider value={{ slot, setSlot: () => {}, titleSlot: null, setTitleSlot: () => {} }}>
        <main>
          <PageHeaderActions>
            <button type="button">My team</button>
          </PageHeaderActions>
        </main>
      </NavActionsSlotContext.Provider>,
    );
    const group = slot.querySelector('[data-page-actions="bar"]') as HTMLElement;
    expect(group).toHaveClass('order-first', 'mr-3');
    expect(within(group).getByRole('button', { name: 'My team' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'My team' })).toBeNull();
    slot.remove();
  });

  it('stays in place on a phone, and with no slot', () => {
    setViewport(390);
    render(
      <main>
        <PageHeaderActions>
          <button type="button">My team</button>
        </PageHeaderActions>
      </main>,
    );
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'My team' }).parentElement).toHaveAttribute('data-page-actions', 'inline');
  });
});

describe('PageHeader title as text (Settings PR)', () => {
  it('draws the title as text, not a heading, when the page owns its h1', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Settings" titleAs="p" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    const title = screen.getByText('Settings');
    expect(title.tagName).toBe('P');
    expect(title).toHaveClass('truncate', 'text-[15px]', 'font-semibold');
  });
});
