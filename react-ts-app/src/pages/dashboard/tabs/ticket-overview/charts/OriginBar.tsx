import { useMemo } from 'react';
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { TicketOrigin } from '../../../../../features/tickets/ticketsSlice';
import { niceMax } from '../chartTheme';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { ROLE, TOOLTIP_STYLE, CURSOR_FILL, barListHeight } from '../../../shared/chartPalette';
import { AXIS_BASE, chartMargin, truncTick } from '../../../shared/chartAxis';
import { useDrill } from '../../../drill/useDrill';
import { DrillTargets } from '../../../drill/DrillTargets';

const PATH = '/tickets/stats/';
/** Origin names print in full up to this many characters, then shorten
 *  with the full name on hover. */
const NAME_CHARS = 18;
/** Width of one 10px tick character, as the shared axis kit estimates it. */
const CHAR_PX = 6;

/** One distinct display name per origin. Connector names are the user's
 *  own, so two can match each other, or match the "Revenact" bucket for
 *  tickets raised here: a clashing connector gets its provider appended
 *  (the Revenact bucket keeps its bare name), and anything still clashing
 *  is numbered. Otherwise two targets would read "Support 9" and "Support
 *  7" with nothing to tell them apart. */
function originLabels(rows: TicketOrigin[]): string[] {
  const byName = new Map<string, number>();
  for (const row of rows) byName.set(row.name, (byName.get(row.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base =
      (byName.get(row.name) ?? 0) > 1 && row.connector_id !== null && row.provider
        ? `${row.name} (${row.provider})`
        : row.name;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/**
 * Where the tickets come from, ranked.
 *
 * Horizontal, like the assignee chart beside it, because the categories are
 * names. Vertically this card is ~250px wide across five origins, and a
 * vertical axis had no room for "Freshdesk" or "Salesforce": Recharts drops
 * labels that don't fit rather than overlapping them, so the chart was showing
 * five bars with two names — and it gave no sign that the other three had been
 * dropped.
 *
 * Counts ride at the end of each bar instead of on an axis, which is what the
 * five numbers are actually for: a 5-ticket origin is a sliver, and the figure
 * beside it is the only way to read it.
 */
export function OriginBar({
  data,
  query,
  drillable = true,
}: {
  data: TicketOrigin[];
  query: string;
  /** False while the view refetches: the figures on screen are the old
   *  ones, but a drill would send the new query, so nothing opens. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  // Biggest first. The API's order is the connector's, which is not a ranking.
  const ranked = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const labels = originLabels(sorted);
    return sorted.map((row, i) => ({ ...row, label: labels[i] }));
  }, [data]);
  // Computed, not hard-coded: the mock's domain={[0, 400]} silently
  // clipped any bar above 400.
  const max = niceMax(ranked.map((d) => d.value));

  // An empty bucket has no accounts behind it, so it offers no drill.
  const canDrill = (row: TicketOrigin) => drillable && row.value > 0;

  const openSegment = (row: (typeof ranked)[number], trigger?: HTMLElement) => {
    const segment = row.connector_id === null ? 'origin:none' : `origin:${row.connector_id}`;
    open(
      {
        title: row.label,
        figure: String(row.value),
        source: { kind: 'server', path: PATH, query, segment },
      },
      trigger,
    );
  };

  // Every origin drills, including the null-connector "Revenact" bucket —
  // the backend's own `origin:none` segment.
  const drillItems = ranked.filter(canDrill).map((row) => ({
    key: String(row.connector_id ?? 'none'),
    name: row.label,
    figure: String(row.value),
    onSelect: (trigger: HTMLElement) => openSegment(row, trigger),
  }));

  // Room for the longest name, so a name is only shortened when it is
  // genuinely long; a fixed 78px cut "Zendesk (support)" to "Zendesk (s…".
  const longest = Math.max(4, ...ranked.map((row) => row.label.length));
  const axisWidth = Math.min(NAME_CHARS, longest) * CHAR_PX + 10;

  return (
    <div className="relative w-full h-full p-4 flex flex-col bg-surface border border-line-subtle rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[13px] font-bold text-ink">Tickets By Origin</h3>
      </div>

      <DrillTargets label="Tickets By Origin" items={drillItems} />

      {ranked.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No tickets match these filters.</p>
      ) : (
        // One 26px row per origin, so twelve connectors get room and three do
        // not float in a tall card. Origins are bounded by the connectors a
        // workspace has, so the card grows rather than scrolls.
        <div data-testid="origin-plot" className="relative w-full" style={{ height: barListHeight(ranked.length, 26, 200) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={ranked}
              margin={chartMargin({ right: true })}
              barSize={16}
            >
              {/* Hidden: every bar carries its count at its end. */}
              <XAxis type="number" hide domain={[0, max]} allowDecimals={false} />
              <YAxis
                {...AXIS_BASE}
                type="category"
                dataKey="label"
                width={axisWidth}
                interval={0}
                tick={truncTick(NAME_CHARS)}
              />
              <Tooltip
                cursor={{ fill: CURSOR_FILL }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [
                  `${value} ${Number(value) === 1 ? 'ticket' : 'tickets'}`,
                  'Origin',
                ]}
              />
              <Bar {...STATIC_SERIES} dataKey="value" radius={[0, 2, 2, 0]}>
                <LabelList
                  dataKey="value"
                  position="right"
                  fill="var(--text-secondary)"
                  fontSize={11}
                  fontWeight={600}
                />
                {ranked.map((row) => (
                  <Cell
                    key={row.connector_id ?? 'none'}
                    fill={ROLE.ink}
                    cursor={canDrill(row) ? 'pointer' : undefined}
                    onClick={canDrill(row) ? () => openSegment(row) : undefined}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
