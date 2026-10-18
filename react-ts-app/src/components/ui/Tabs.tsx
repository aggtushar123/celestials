import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { FOCUS } from './styles';
import { tabId, tabPanelId } from './tabIds';
import { useScrollFade } from './useScrollFade';

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
  /** The route, when the tabs are links. */
  to?: string;
  /** The tab's accessible name when its label and count need other words
   *  ("Waiting on you, 3 waiting"). */
  ariaLabel?: string;
}

const ROW = 'flex h-full min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none] rv-scroll-fade';
const TAB = `inline-flex h-full min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-semibold focus-visible:outline-offset-[-2px] ${FOCUS}`;
const ACTIVE = 'border-accent text-ink';
const INACTIVE = 'border-transparent text-ink-muted hover:text-ink';

/** A tab's count. The space before it keeps the accessible name "Story 12",
 *  not "Story12"; a flex row does not draw whitespace-only text. */
function Count({ n }: { n?: number }) {
  if (n === undefined) return null;
  return (
    <>
      {' '}
      <span className="text-[11px] text-ink-muted tabular-nums">{n}</span>
    </>
  );
}

/** Page-level underline tabs (UI foundations spec §5.2). Without
 *  `onChange` they are links (`to`), the current one `aria-current="page"`.
 *  With `onChange` they are a tablist: arrows, Home and End move and
 *  select, and only the selected tab is in the tab order. One row of tabs
 *  per page, in the PageHeader or under the page's name. */
export function Tabs<K extends string>({
  label,
  items,
  value,
  onChange,
  idBase,
}: {
  label: string;
  items: readonly TabItem<K>[];
  value: K;
  onChange?: (key: K) => void;
  /** With a tablist: ids from `tabId`/`tabPanelId`, so panels can point back. */
  idBase?: string;
}) {
  const rowRef = useScrollFade<HTMLDivElement>();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // The selected tab is brought into view by scrolling the tab row itself
  // sideways (a phone), on every change and on first render. Only the row
  // moves, never the page, so tabs below the fold never pull the page down.
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
    if (row && tab) {
      const r = row.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      if (t.left < r.left) row.scrollLeft -= r.left - t.left;
      else if (t.right > r.right) row.scrollLeft += t.right - r.right;
    }
  }, [value, rowRef]);

  if (!onChange) {
    return (
      <nav aria-label={label} className="h-full min-w-0">
        <div ref={rowRef} className={ROW}>
          {items.map((item) => {
            const active = item.key === value;
            return (
              <Link key={item.key} to={item.to ?? '.'} aria-current={active ? 'page' : undefined} aria-label={item.ariaLabel} className={`${TAB} ${active ? ACTIVE : INACTIVE}`}>
                {item.label}
                <Count n={item.count} />
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  const choose = onChange;
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    choose(items[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div ref={rowRef} role="tablist" aria-label={label} className={ROW}>
      {items.map((item, index) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={idBase ? tabId(idBase, item.key) : undefined}
            type="button"
            role="tab"
            aria-label={item.ariaLabel}
            aria-selected={active}
            aria-controls={idBase ? tabPanelId(idBase, item.key) : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => choose(item.key)}
            onKeyDown={(event) => onKey(event, index)}
            className={`${TAB} ${active ? ACTIVE : INACTIVE}`}
          >
            {item.label}
            <Count n={item.count} />
          </button>
        );
      })}
    </div>
  );
}
