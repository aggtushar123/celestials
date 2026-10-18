import { Children, useId, type ReactNode } from 'react';

const FIGURE_TONE = {
  neutral: 'text-ink',
  loss: 'text-danger',
  gain: 'text-success',
} as const;

/** One headline number. Colour is reserved for a figure that *means* loss or
 *  gain; everything else is ink. Replaces the six local `Tile`s, which tinted
 *  a left border by tone and so coloured numbers that meant nothing. */
export function Kpi({
  label,
  value,
  detail,
  tone = 'neutral',
  onDrill,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: keyof typeof FIGURE_TONE;
  onDrill?: (trigger: HTMLElement) => void;
}) {
  const detailId = useId();
  // Spans (made block) rather than divs so the drill button holds only
  // phrasing content. The button's aria-label replaces its text as the
  // accessible name, so the detail line is wired back in as the
  // description — otherwise a screen reader would never hear it.
  const body = (
    <>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className={`block font-mono-brand tabular-nums text-[22px] leading-tight mt-1 ${FIGURE_TONE[tone]}`}>
        {value}
      </span>
      {detail && (
        <span id={detailId} className="block text-[11px] text-ink-muted mt-0.5">
          {detail}
        </span>
      )}
    </>
  );

  if (!onDrill) return <div className="min-w-0">{body}</div>;
  return (
    <button
      type="button"
      onClick={(event) => onDrill(event.currentTarget)}
      aria-label={`${label} ${value}, show accounts`}
      aria-describedby={detail ? detailId : undefined}
      className="min-w-0 w-full text-left rounded-lg -m-1 p-1 cursor-pointer hover:bg-subtle transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {body}
    </button>
  );
}

const STRIP_COLUMNS = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
} as const;

/** Four across from `md` by default, two below, separated by hairlines rather
 *  than boxes. Pass `columns={3}` for a strip that shouldn't leave an empty
 *  fourth slot (e.g. a three-figure summary like `TriageTiles`), or
 *  `columns={2}` for a strip inside a card rather than across the page.
 *
 *  `stackFromLg` is for a strip in a quarter-width card (Tickets' KPI card):
 *  from `lg` that card is ~200px wide, where even two columns wrap an
 *  uppercase label onto three or four lines. One per row keeps every label
 *  to two lines at most (measured at 1024–1920px). */
export function KpiStrip({
  children,
  columns = 4,
  stackFromLg = false,
}: {
  children: ReactNode;
  columns?: keyof typeof STRIP_COLUMNS;
  stackFromLg?: boolean;
}) {
  // `Children.toArray` (rather than `Array.isArray`) drops `null`/`false`, so
  // a conditionally-rendered `cond && <Kpi/>` never leaves an empty `<li>`.
  const items = Children.toArray(children);
  return (
    <ul
      className={`grid grid-cols-2 ${STRIP_COLUMNS[columns]} gap-y-4 bg-surface border border-line rounded-xl p-4 md:divide-x md:divide-line ${
        stackFromLg ? 'lg:grid-cols-1 lg:divide-x-0' : ''
      }`}
    >
      {items.map((child, i) => (
        <li key={i} className={`md:px-4 md:first:pl-0 ${stackFromLg ? 'lg:px-0' : ''}`}>
          {child}
        </li>
      ))}
    </ul>
  );
}
