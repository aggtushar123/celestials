import { useMemo } from 'react';
import { ACTION_THRESHOLD, RENEWAL_URGENT_DAYS, summarise, triageDrillSets } from '../triage';
import type { TriageRow } from '../triage';
import { Kpi, KpiStrip } from '../../../shared/Kpi';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';

/**
 * The three figures that decide whether this screen needs you today.
 *
 * Deliberately thin: the point of the Triage view is the ranked queue below,
 * and a row of big hero numbers above it would compete with the thing that
 * actually carries the work.
 *
 * Takes the whole book's scored rows, not just the summary counts, so each
 * tile can open the exact accounts it counted — the summary alone has no
 * way back to which accounts they were.
 */
export function TriageTiles({
  scored,
  drillable = true,
}: {
  scored: TriageRow[];
  /** False when the book behind `scored` is a truncated slice of a larger
   *  one — a drill would only ever show some of the accounts a tile counted.
   *  Defaults to `true` so every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  const summary = useMemo(() => summarise(scored), [scored]);
  const { needsAction, needsActionRenewingSoon, declining, atGood, total, atGoodPreviousMonth } = summary;

  const goodSub =
    atGoodPreviousMonth === null
      ? 'no prior month recorded'
      : atGoodPreviousMonth === atGood
        ? 'unchanged from last month'
        : atGoodPreviousMonth > atGood
          ? `down from ${atGoodPreviousMonth} last month`
          : `up from ${atGoodPreviousMonth} last month`;

  // The same three sets `summarise` counted, from the one predicate each
  // lives in (`triageDrillSets`) — not re-filtered here, so a tile's number
  // and the accounts a click on it opens can never quietly disagree.
  const {
    needsAction: needsActionRows,
    declining: decliningRows,
    atGood: atGoodRows,
  } = useMemo(() => triageDrillSets(scored), [scored]);

  return (
    <KpiStrip columns={3}>
      <Kpi
        label="Needs action now"
        value={String(needsAction)}
        detail={`risk ≥ ${ACTION_THRESHOLD} · ${needsActionRenewingSoon} renew inside ${RENEWAL_URGENT_DAYS} days`}
        onDrill={
          drillable
            ? (trigger) => {
                const scoreById = new Map(needsActionRows.map((t) => [t.row.id, t.score]));
                open(
                  {
                    title: 'Needs action now',
                    figure: String(needsAction),
                    source: {
                      kind: 'rows',
                      rows: fromHealthRows(
                        needsActionRows.map((t) => t.row),
                        (row) => `risk ${scoreById.get(row.id)}`,
                      ),
                    },
                  },
                  trigger,
                );
              }
            : undefined
        }
      />
      <Kpi
        label="Declining"
        value={String(declining)}
        detail="worse than three months ago"
        onDrill={
          drillable
            ? (trigger) =>
                open(
                  {
                    title: 'Declining',
                    figure: String(declining),
                    source: { kind: 'rows', rows: fromHealthRows(decliningRows.map((t) => t.row)) },
                  },
                  trigger,
                )
            : undefined
        }
      />
      <Kpi
        label="Book at Good"
        value={`${atGood}/${total}`}
        detail={goodSub}
        onDrill={
          drillable
            ? (trigger) =>
                open(
                  {
                    title: 'Book at Good',
                    figure: `${atGood}/${total}`,
                    source: { kind: 'rows', rows: fromHealthRows(atGoodRows.map((t) => t.row)) },
                  },
                  trigger,
                )
            : undefined
        }
      />
    </KpiStrip>
  );
}
