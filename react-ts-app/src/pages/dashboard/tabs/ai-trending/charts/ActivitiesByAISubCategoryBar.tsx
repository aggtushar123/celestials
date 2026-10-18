import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, LabelList } from 'recharts';
import type { InteractionBucket } from '../../../../../features/interactions/interactionsSlice';
import { niceMax } from '../chartTheme';
import { UnclassifiedNote } from './UnclassifiedNote';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { ROLE, TOOLTIP_STYLE, CURSOR_FILL, barListHeight } from '../../../shared/chartPalette';
import { AXIS_BASE, chartMargin, wrapTick } from '../../../shared/chartAxis';
import { useDrill } from '../../../drill/useDrill';
import { DrillTargets } from '../../../drill/DrillTargets';

const PATH = '/interactions/stats/';
/** Characters per line of a name. A longer name wraps onto a second line,
 *  and only a name past two lines shortens, with the full one on hover. */
const NAME_CHARS = 20;
/** Width of one 10px tick character, as the shared axis kit estimates it. */
const CHAR_PX = 6;

/** Subcategories are finer-grained than categories, so a couple more bars earn
 *  their place here — but the same readability ceiling applies. */
const MAX_BARS = 11;

/** Classified interactions by AI Subcategory, biggest first.
 *
 * Same shape as the Category bar beside it, and read together with it: the
 * backend guarantees every subcategory rolls up into exactly one of the
 * categories in that chart. */
export function ActivitiesByAISubCategoryBar({
  data,
  classified,
  total,
  query,
  drillable = true,
}: {
  data: InteractionBucket[];
  /** The API's own count of classified interactions — what the note below is
   *  about. Deliberately not the sum of the bars drawn: those are the top few,
   *  so summing them would understate the book and make the note a lie. */
  classified: number;
  total: number;
  query: string;
  /** False while the view refetches: the figures on screen are the old
   *  ones, but a drill would send the new query, so nothing opens. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  const rows = data.slice(0, MAX_BARS);
  const max = niceMax(rows.map((r) => r.value));

  const openSegment = (row: InteractionBucket, trigger?: HTMLElement) => {
    open(
      {
        title: row.name,
        figure: String(row.value),
        source: { kind: 'server', path: PATH, query, segment: `subcategory:${row.key}` },
      },
      trigger,
    );
  };

  // An empty bucket has no accounts behind it, so it offers no drill.
  const canDrill = (row: InteractionBucket) => drillable && row.value > 0;
  const drillItems = rows.filter(canDrill).map((row) => ({
    name: row.name,
    figure: String(row.value),
    onSelect: (trigger: HTMLElement) => openSegment(row, trigger),
  }));

  // Room for the longest name up to one full line, rather than a fixed
  // 140px that cut taxonomy names in a third-width card.
  const longest = Math.max(4, ...rows.map((row) => row.name.length));
  const axisWidth = Math.min(NAME_CHARS, longest) * CHAR_PX + 10;

  return (
    <div className="relative w-full h-full p-6 flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[14px] font-bold text-ink">Activities By AI Sub Category</h3>
        {data.length > MAX_BARS && (
          <span className="text-[11px] text-ink-faint">
            top {MAX_BARS} of {data.length}
          </span>
        )}
      </div>

      <DrillTargets label="Activities By AI Sub Category" items={drillItems} />

      {/* One 28px row per bar. The list is capped at MAX_BARS, so the card
          grows to fit rather than scrolling. */}
      <div className="relative w-full" style={{ height: barListHeight(rows.length, 28, 200) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={chartMargin({ right: true })}>
            {/* Hidden: every bar carries its count at its end, so axis ticks
                only repeated the same numbers. */}
            <XAxis type="number" hide domain={[0, max]} allowDecimals={false} />
            <YAxis
              {...AXIS_BASE}
              type="category"
              dataKey="name"
              width={axisWidth}
              interval={0}
              tick={wrapTick(NAME_CHARS)}
            />
            <Tooltip
              cursor={{ fill: CURSOR_FILL }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} ${Number(value) === 1 ? 'interaction' : 'interactions'}`, 'Classified']}
            />
            <Bar {...STATIC_SERIES} dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList
                dataKey="value"
                position="right"
                fill="var(--text-secondary)"
                fontSize={11}
              />
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  fill={ROLE.ink}
                  cursor={canDrill(row) ? 'pointer' : undefined}
                  onClick={canDrill(row) ? () => openSegment(row) : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <UnclassifiedNote classified={classified} total={total} />
    </div>
  );
}
