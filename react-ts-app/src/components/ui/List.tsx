import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import { Card } from './Card';
import { NUM } from './styles';
import { TYPE } from './type';

// A list is one card whose rows are divided, never a card per row (UI
// foundations spec §4.2, owner decision 1). Tables sit flush in a card too.

export const TABLE = 'w-full text-left';
export const TH = 'px-4 py-2 text-[11px] leading-4 font-semibold text-ink-muted';
export const TD = 'px-4 py-3 text-[13px] leading-5 align-middle';
/** A table cell holding a figure: right-aligned, tabular figures. */
export const TD_NUM = `${TD} text-right ${NUM}`;

/** A list's column grid (spec §4.2) for `ListRow` `columns`/`gridAt` and
 *  `ListHeaderRow`. The class strings are literal so Tailwind sees them;
 *  `tracksRem`, `gapRem` and `breakpointRem` restate the numbers so a test
 *  can prove the row fits the container query it waits for. `narrowOnly`
 *  hides a meta-line span once the columns show. `ListRow`'s grid gap is
 *  `gap-3` (0.75rem). */
export interface ListGrid {
  tracksRem: readonly number[];
  gapRem: number;
  breakpointRem: number;
  columns: string;
  gridAt: { row: string; cell: string };
  headerShow: string;
  narrowOnly: string;
  labels: readonly string[];
  aligns: readonly ('left' | 'right')[];
}

/** Row controls beyond the first (spec §7): hidden until hover or focus
 *  from sm, always shown on touch. Opacity only, so they stay in the tab
 *  order; `relative z-10` lifts them over the row's stretched link. An
 *  open (portalled) menu keeps them shown while focus sits in it. */
export const ROW_ACTIONS =
  'relative z-10 flex shrink-0 items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100';

const DENSITY = { regular: 'min-h-14 py-3', compact: 'min-h-11 py-2' } as const;
const ROW_FOCUS =
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent';
const TITLE_BASE = `${TYPE.body} block truncate text-left focus-visible:outline-none`;
const TITLE = `${TITLE_BASE} font-semibold`;
/** A title in the regular weight (a read message among unread ones). */
const TITLE_QUIET = `${TITLE_BASE} font-normal`;
const STRETCH = "after:absolute after:inset-0 after:content-['']";

/** One card holding a labelled list. `state` (a LoadingState, EmptyState
 *  or ErrorState) takes the list's place inside the same card. `footer`
 *  (Show more) is a divided row inside the card, drawn only when given;
 *  `busy` marks the list while a new query reads; `listRef` reaches the
 *  list itself (Show more moves focus to its first new row). */
export function ListCard({
  label,
  header,
  state,
  footer,
  busy = false,
  className = '',
  listRef,
  children,
}: {
  label: string;
  header?: ReactNode;
  state?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  className?: string;
  listRef?: Ref<HTMLUListElement>;
  children?: ReactNode;
}) {
  return (
    <Card pad="none" className={`overflow-hidden ${className}`.trim()}>
      {header}
      {state ? (
        state
      ) : (
        <ul ref={listRef} role="list" aria-label={label} aria-busy={busy || undefined} className="divide-y divide-line-subtle">
          {children}
        </ul>
      )}
      {footer ? (
        <div data-part="list-footer" className="flex flex-col items-center gap-1 border-t border-line-subtle px-4 py-2">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/** Column labels over a grid list, on the rows' own template. From sm only:
 *  on a phone each row's meta line says what its figures are. `show` is the
 *  breakpoint the labels appear at (default sm; a portfolio row's container
 *  query otherwise). `align` right-aligns the labels over figures. */
export function ListHeaderRow({ columns, labels, align, show = 'sm:grid' }: { columns: string; labels: readonly string[]; align?: readonly ('left' | 'right')[]; show?: string }) {
  return (
    <div aria-hidden="true" className={`hidden items-center gap-3 border-b border-line-subtle px-4 py-2 ${show} ${columns}`}>
      {labels.map((label, index) => (
        <span key={`${index}-${label}`} className={`text-[11px] leading-4 font-semibold text-ink-muted ${align?.[index] === 'right' ? 'text-right' : ''}`.trim()}>
          {label}
        </span>
      ))}
    </div>
  );
}

export interface ListRowProps {
  /** The row's name; the real control when the row opens something. */
  title: string;
  /** One meta line, never two: extras go here or into a badge. */
  meta?: ReactNode;
  /** 32 to 40px: an avatar, a ring, an icon chip. */
  leading?: ReactNode;
  /** Grid cells between the title and the trailing slot (with `columns`). */
  cells?: ReactNode[];
  /** Always visible: at most one control, or a badge or figure. */
  trailing?: ReactNode;
  /** Shown on hover or focus from sm (spec §7). */
  actions?: ReactNode;
  /** Opens a route: the title is a Link stretched over the row. */
  href?: string;
  /** Opens in place: the title is a button stretched over the row. */
  onSelect?: () => void;
  selected?: boolean;
  density?: 'regular' | 'compact';
  /** A grid template such as `sm:grid-cols-[minmax(12rem,1fr)_6rem_8rem_auto]`,
   *  so figures line up down the list. Prefix it with sm: so phones stack. */
  columns?: string;
  /** With `columns`: below this breakpoint the row is one flex line and its
   *  cells are hidden (the meta line says what they hold); from it the row
   *  is a grid on `columns`. Literal classes, so Tailwind sees them:
   *  `{ row: '@min-[60rem]:grid', cell: '@min-[60rem]:block' }`. Without it a
   *  `columns` row is a grid at every width and its cells stack below the
   *  template's breakpoint. */
  gridAt?: { row: string; cell: string };
  /** False sets the title in the regular weight (a read message). */
  strong?: boolean;
  /** Data attributes for the row's li (tests and field coverage read them). */
  dataAttrs?: Record<`data-${string}`, string | number>;
}

/** One row (spec §4.2). Clickable rows put the control on the title and
 *  stretch it over the row; the li itself never takes a click. With `gridAt`
 *  the row is one flex line below its breakpoint (title, then trailing and
 *  actions) and a grid from it. */
export function ListRow({ title, meta, leading, cells = [], trailing, actions, href, onSelect, selected = false, density = 'regular', columns, gridAt, strong = true, dataAttrs }: ListRowProps) {
  const titleClass = strong ? TITLE : TITLE_QUIET;
  const current = selected ? 'true' : undefined;
  const titleControl = href ? (
    <Link to={href} title={title} aria-current={current} className={`${titleClass} ${STRETCH}`}>
      {title}
    </Link>
  ) : onSelect ? (
    <button type="button" title={title} aria-current={current} onClick={onSelect} className={`${titleClass} w-full ${STRETCH}`}>
      {title}
    </button>
  ) : (
    <span title={title} className={titleClass}>
      {title}
    </span>
  );
  const clickable = Boolean(href || onSelect);
  const classes = [
    'group relative items-center gap-3 px-4',
    columns ? (gridAt ? `flex ${gridAt.row} ${columns}` : `grid ${columns}`) : 'flex',
    DENSITY[density],
    clickable ? 'hover:bg-subtle active:bg-line-subtle' : '',
    ROW_FOCUS,
    selected ? 'bg-subtle' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li {...dataAttrs} className={classes}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {titleControl}
          {meta ? <p className={`${TYPE.meta} truncate`}>{meta}</p> : null}
        </div>
      </div>
      {cells.map((cell, index) => (
        <div key={index} className={gridAt ? `hidden min-w-0 ${gridAt.cell}` : 'min-w-0'}>
          {cell}
        </div>
      ))}
      {trailing ? <div className="relative z-10 flex shrink-0 items-center gap-2">{trailing}</div> : null}
      {actions ? <div className={ROW_ACTIONS}>{actions}</div> : null}
    </li>
  );
}
