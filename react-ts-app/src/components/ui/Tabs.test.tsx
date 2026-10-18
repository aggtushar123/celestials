import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Tabs, type TabItem } from './Tabs';
import { tabPanelId } from './tabIds';

type Key = 'story' | 'calls' | 'files';
const ITEMS: TabItem<Key>[] = [
  { key: 'story', label: 'Story', count: 12 },
  { key: 'calls', label: 'Calls' },
  { key: 'files', label: 'Files' },
];

function Harness() {
  const [value, setValue] = useState<Key>('story');
  return <Tabs label="Organization sections" items={ITEMS} value={value} onChange={setValue} idBase="org" />;
}

describe('Tabs as a tablist (UI foundations spec §5.2)', () => {
  it('selects one tab, keeps only it in the tab order, and points at its panel', () => {
    render(<Harness />);
    const story = screen.getByRole('tab', { name: 'Story 12' });
    expect(screen.getByRole('tablist', { name: 'Organization sections' })).toHaveClass('overflow-x-auto', 'rv-scroll-fade');
    expect(story).toHaveAttribute('aria-selected', 'true');
    expect(story).toHaveAttribute('tabindex', '0');
    expect(story).toHaveAttribute('aria-controls', tabPanelId('org', 'story'));
    expect(story).toHaveClass('min-h-11', 'border-b-2', 'border-accent', 'text-ink', 'text-[13px]', 'font-semibold');
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveClass('border-transparent', 'text-ink-muted');
    expect(screen.getByText('12')).toHaveClass('text-[11px]', 'tabular-nums');
  });

  it('moves and selects with the arrows, Home and End, wrapping at the ends', async () => {
    render(<Harness />);
    screen.getByRole('tab', { name: 'Story 12' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Calls' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Story 12' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Story 12' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects on click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('tab', { name: 'Files' }));
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Tabs as links', () => {
  it('marks the current route and links the others', () => {
    render(
      <MemoryRouter>
        <Tabs
          label="Views"
          value="list"
          items={[
            { key: 'list', label: 'List', to: '/organizations/list' },
            { key: 'board', label: 'Board', to: '/organizations/board' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/organizations/board');
    expect(screen.getByRole('link', { name: 'Board' })).not.toHaveAttribute('aria-current');
  });
});

describe('the overflow fade', () => {
  const widths = (scroll: number, client: number) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scroll });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => client });
  };
  afterEach(() => {
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });

  it('marks the row while it overflows, and not when it fits', () => {
    widths(600, 300);
    const { unmount } = render(<Harness />);
    expect(screen.getByRole('tablist')).toHaveAttribute('data-overflow');
    unmount();
    widths(300, 300);
    render(<Harness />);
    expect(screen.getByRole('tablist')).not.toHaveAttribute('data-overflow');
  });
});

describe('Tabs scrolling', () => {
  // jsdom lays nothing out: the row is 200px wide from 0, Story sits at
  // 0-80 and Files at 250-320 of the row's content, less its scrollLeft.
  const BASE: Record<string, [number, number]> = { Story: [0, 80], Files: [250, 320] };
  const items = [
    { key: 'story', label: 'Story' },
    { key: 'files', label: 'Files' },
  ] as const;
  const rowOf = () => document.querySelector<HTMLElement>('[role="tablist"]')!;
  const rect = (left: number, right: number) => ({ left, right, top: 0, bottom: 44, width: right - left, height: 44, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const label = this.getAttribute('role') === 'tab' ? (this.textContent ?? '') : null;
      if (label && BASE[label]) {
        const shift = rowOf().scrollLeft;
        return rect(BASE[label][0] - shift, BASE[label][1] - shift);
      }
      return rect(0, 200);
    });
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('scrolls only the tab row sideways to show the selected tab, from the first render on, never the page', () => {
    const { rerender } = render(<Tabs label="Sections" items={items} value="files" onChange={() => {}} />);
    const row = screen.getByRole('tablist');
    // First render: Files (right edge 320) is past the row's 200, so the row moves by 120.
    expect(row.scrollLeft).toBe(120);
    rerender(<Tabs label="Sections" items={items} value="story" onChange={() => {}} />);
    // Story now starts at -120: the row moves back to show it.
    expect(row.scrollLeft).toBe(0);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(window.scrollBy).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
  });

  it('leaves the row alone when the selected tab is already in view', () => {
    render(<Tabs label="Sections" items={items} value="story" onChange={() => {}} />);
    expect(screen.getByRole('tablist').scrollLeft).toBe(0);
  });
});

describe('Tabs ariaLabel (Ops PR)', () => {
  it('names a link tab by its ariaLabel, the count shown as a quiet figure', () => {
    render(
      <MemoryRouter>
        <Tabs
          label="Brain"
          value="/brain"
          items={[
            { key: '/brain', label: 'What changed', to: '/brain' },
            { key: '/brain/waiting', label: 'Waiting on you', to: '/brain/waiting', count: 3, ariaLabel: 'Waiting on you, 3 waiting' },
          ]}
        />
      </MemoryRouter>,
    );
    const waiting = screen.getByRole('link', { name: 'Waiting on you, 3 waiting' });
    expect(within(waiting).getByText('3')).toHaveClass('text-[11px]', 'text-ink-muted', 'tabular-nums');
    expect(screen.getByRole('link', { name: 'What changed' })).toHaveAttribute('aria-current', 'page');
  });
});
