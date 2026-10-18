import { useMemo } from 'react';

import { BarChart, Bar, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { HealthDataRow, HealthStatus } from '../mockData';
import { HEALTH_ORDER, healthByOwner } from '../controls';
import type { OwnerHealth } from '../controls';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { TOOLTIP_STYLE, CURSOR_FILL, HEALTH_COLORS, HEALTH_LEGEND, barListHeight } from '../../../shared/chartPalette';
import { AXIS_BASE, chartMargin, truncTick } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import { ScrollArea } from '../../../shared/ScrollTable';
import { stackedTotalLabelList } from '../../../shared/stackedTotalLabel';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';
import { DrillTargets } from '../../../drill/DrillTargets';

/** Owner names print in full up to this many characters, then shorten
 *  with the full name on hover. */
const NAME_CHARS = 24;
/** Width of one 10px tick character, as the shared axis kit estimates it. */
const CHAR_PX = 6;
/** Past this the owner rows scroll inside the card instead of growing it. */
const MAX_PLOT = 320;

/**
 * Who is carrying the sick accounts.
 *
 * The grouping and the ordering live in `controls.healthByOwner` — including
 * the argument for counting accounts rather than reporting a share of each
 * book. This file is the drawing.
 */
export function HealthByOwnerStackedBar({
  data,
  drillable = true,
}: {
  data: HealthDataRow[];
  /** False when `data` is a truncated book — a drill from it would only ever
   *  show some of the accounts a segment counted. Defaults to `true` so
   *  every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  const chartData = useMemo(() => healthByOwner(data), [data]);

  const widest = Math.max(1, ...chartData.map((row) => row.total));

  // Two owners can share a display name — `healthByOwner` now groups by
  // `ownerKey`, not the label — so the drill target's name has to
  // disambiguate them too, or two distinct entries collapse into one
  // identically-labelled button.
  const duplicateNames = new Set(
    [...new Set(chartData.map((row) => row.owner))].filter(
      (name) => chartData.filter((row) => row.owner === name).length > 1,
    ),
  );
  const labelFor = (owner: OwnerHealth) =>
    duplicateNames.has(owner.owner) ? `${owner.owner} (${owner.ownerKey})` : owner.owner;

  const openSegment = (owner: OwnerHealth, status: HealthStatus, trigger?: HTMLElement) => {
    const picked = owner.rows[status];
    open(
      {
        title: `${labelFor(owner)} · ${status}`,
        figure: String(picked.length),
        source: { kind: 'rows', rows: fromHealthRows(picked) },
      },
      trigger,
    );
  };

  // One button per owner × status that actually has an account in it — a
  // keyboard user (and this chart's own test) can't reach a recharts <Bar>'s
  // SVG segments, so this is the real drill target; the Bar's own onClick
  // below is the pointer shortcut to the same thing. None at all when the
  // book is truncated — see `drillable`.
  const drillItems = drillable
    ? chartData.flatMap((owner) =>
        HEALTH_ORDER.filter((status) => owner.rows[status].length > 0).map((status) => ({
          name: `${labelFor(owner)} · ${status}`,
          figure: String(owner.rows[status].length),
          onSelect: (trigger: HTMLElement) => openSegment(owner, status, trigger),
        })),
      )
    : [];

  // Room for the longest name, so a name is only ever shortened when it is
  // genuinely long, not because the axis was a fixed 100px.
  const longest = Math.max(4, ...chartData.map((row) => row.owner.length));
  const axisWidth = Math.min(NAME_CHARS, longest) * CHAR_PX + 10;
  const plotHeight = barListHeight(chartData.length, 28, 200);

  return (
    <div className="relative w-full p-4 flex flex-col gap-2">
      <div>
        <h3 className="text-[13px] font-bold text-ink">Health by owner</h3>
        <p className="text-[11px] text-ink-faint mt-0.5">Accounts per owner, stacked by health · worst book first</p>
      </div>
      <ChartLegend items={HEALTH_LEGEND} />

      <DrillTargets label="Health by owner" items={drillItems} />

      {chartData.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No accounts match these filters.</p>
      ) : (
        <ScrollArea label="Health by owner" maxHeight={MAX_PLOT}>
          <div data-testid="owner-plot" className="w-full" style={{ height: plotHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={chartData} margin={chartMargin({ right: true })} barSize={18}>
                {/* Hidden: every bar carries its total at its end. */}
                <XAxis type="number" hide domain={[0, widest]} allowDecimals={false} />
                <YAxis
                  {...AXIS_BASE}
                  type="category"
                  dataKey="owner"
                  width={axisWidth}
                  interval={0}
                  tick={truncTick(NAME_CHARS)}
                />
                <Tooltip
                  cursor={{ fill: CURSOR_FILL }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [`${value} ${Number(value) === 1 ? 'account' : 'accounts'}`, name]}
                />
                {HEALTH_ORDER.map((status) => (
                  <Bar
                    key={status}
                    {...STATIC_SERIES}
                    dataKey={status}
                    stackId="a"
                    fill={HEALTH_COLORS[status]}
                    cursor={drillable ? 'pointer' : undefined}
                    onClick={drillable ? (_, dataIndex) => openSegment(chartData[dataIndex], status) : undefined}
                  >
                    {/* The book size rides past the end of the bar, not inside
                        the slices: most owners hold one or two accounts per
                        band, and no label fits in a 6px slice. */}
                    <LabelList {...stackedTotalLabelList(status, chartData, 11, { horizontal: true })} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
