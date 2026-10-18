export type LegendKind = 'square' | 'line' | 'outline' | 'dashed';

export interface LegendItem {
  label: string;
  /** A token (`ROLE.*`, `HEALTH_COLORS.*`), never a literal colour. */
  color: string;
  /** square: a bar or area · line: a line series · outline: a target or
   *  unfilled mark · dashed: a forecast or reference line. */
  kind?: LegendKind;
  /** An optional figure shown after the label, e.g. a count. */
  value?: string;
}

const ALIGN = { start: 'justify-start', center: 'justify-center', end: 'justify-end' } as const;

function Swatch({ color, kind = 'square' }: { color: string; kind?: LegendKind }) {
  switch (kind) {
    case 'line':
      return <span aria-hidden="true" className="w-3 h-0.5 rounded-full shrink-0" style={{ backgroundColor: color }} />;
    case 'outline':
      return <span aria-hidden="true" className="size-2 rounded-sm border shrink-0" style={{ borderColor: color }} />;
    case 'dashed':
      return <span aria-hidden="true" className="w-3 h-0 border-t-2 border-dashed shrink-0" style={{ borderColor: color }} />;
    default:
      return <span aria-hidden="true" className="size-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />;
  }
}

/** The key for any chart where colour carries meaning. One component instead
 *  of the hand-rolled keys each chart used to draw. `role="list"` is explicit
 *  because Safari drops list semantics from an unstyled list. */
export function ChartLegend({
  items,
  align = 'start',
  className = '',
}: {
  items: LegendItem[];
  align?: keyof typeof ALIGN;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul role="list" className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted ${ALIGN[align]} ${className}`}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <Swatch color={item.color} kind={item.kind} />
          <span>{item.label}</span>
          {item.value !== undefined && (
            <>
              {/* Heard as "Good, 12" rather than "Good12". */}
              <span className="sr-only">, </span>
              <span className="font-mono-brand tabular-nums text-ink">{item.value}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
