/** Real buttons for a chart's drillable parts. Recharts draws SVG that a
 *  keyboard cannot reach; these give keyboard and screen-reader users the
 *  same drill a pointer gets by clicking a segment. Hidden until focused so
 *  the chart stays uncluttered, and overlaid (not inserted) when focused so
 *  the chart keeps its size. Render it inside a `relative` card. */
export function DrillTargets({
  label,
  items,
}: {
  label: string;
  /** `key` identifies the part when two can share a display name (two
   *  connectors both called "Support"); it falls back to `name`. */
  items: { key?: string; name: string; figure: string; onSelect: (trigger: HTMLElement) => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={label}
      // Stays out of flow when revealed: `sr-only` already makes it
      // absolute, and focus only un-clips it, flush over the top edge of the
      // nearest positioned ancestor: every call site's card wrapper is
      // `relative` for this (guarded in DrillTargets.test.tsx). Revealing it
      // as a static row used to push the plot down and squash fixed-height
      // charts.
      className="sr-only focus-within:top-0 focus-within:inset-x-0 focus-within:z-20 focus-within:size-auto focus-within:m-0 focus-within:p-2 focus-within:overflow-visible focus-within:[clip-path:none] focus-within:[clip:auto] focus-within:whitespace-normal focus-within:flex focus-within:flex-wrap focus-within:gap-1 focus-within:bg-surface focus-within:border-b focus-within:border-line focus-within:rounded-t-[inherit]"
    >
      {items.map((item) => (
        <li key={item.key ?? item.name}>
          <button
            type="button"
            onClick={(event) => item.onSelect(event.currentTarget)}
            className="min-h-8 px-2 rounded-md border border-line bg-surface text-[11px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {item.name} <span className="font-mono-brand tabular-nums">{item.figure}</span>
            <span className="sr-only">, show accounts</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
