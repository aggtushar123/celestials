import { useMemo, useState } from 'react';
import { useHealthOverview } from './useHealthOverview';
import { HealthEmpty, HealthError, HealthLoading, HealthTruncatedNotice } from './HealthDataState';
import { formatCompactMoney } from '../../../../features/customers/formatters';
import { Kpi, KpiStrip } from '../../shared/Kpi';
import {
  HEADLINE_HORIZON_DAYS,
  coverageBands,
  ownerLoad,
  quarterColumns,
  renewalDrillSets,
  renewalQueue,
  renewalRows,
  summarise,
} from './renewal';
import { RenewalQuarterChart } from './charts/RenewalQuarterChart';
import { RenewalCoverageChart } from './charts/RenewalCoverageChart';
import { OwnerLoadChart } from './charts/OwnerLoadChart';
import { RenewalQueueTable } from './charts/RenewalQueueTable';
import { useDrill } from '../../drill/useDrill';
import { fromHealthRows } from '../../drill/rows';

/** The window the owner-load chart covers — two quarters, which is as far
 *  ahead as a staffing decision is worth making. */
const OWNER_HORIZON_DAYS = 180;

/**
 * Health Overview read as a renewal forecast.
 *
 * The other four tabs count accounts; this one counts money, because a renewal
 * is a revenue event. Twelve healthy logos renewing next quarter alongside one
 * shaky account worth more than all of them is a good quarter with a problem in
 * it, and an account-count chart shows the opposite.
 *
 * Four questions, in the order a renewals review asks them: what is coming
 * (calendar), what is exposed (tiles), who is not being talked to (coverage),
 * and what do I do about it (work list) — with owner load beside it because
 * the answer to the last one is usually "somebody is carrying too much".
 *
 * The risk model behind every money figure here is a stated assumption, not a
 * fitted model — see `renewal.ts`. It is written down once so the charts can't
 * each invent their own.
 */
export function RenewalView() {
  // Pinned at mount so the windows don't shift mid-session — the same reason
  // MovementView pins its own clock.
  const [now] = useState(() => new Date());
  const { open } = useDrill();
  const { rows, error, truncated, isInitialLoad, hasLoaded, currency, unconvertedCount } =
    useHealthOverview();

  // A truncated book is a capped slice of a larger one — a drill from it
  // would only ever show *some* of the accounts a tile or chart segment
  // counted, so every drill on this view is switched off rather than
  // quietly lying.
  const drillable = !truncated;

  const { rows: scored, withoutDate } = useMemo(() => renewalRows(rows, now), [rows, now]);
  const summary = useMemo(() => summarise(scored), [scored]);
  const quarters = useMemo(() => quarterColumns(scored, now), [scored, now]);
  const bands = useMemo(() => coverageBands(scored), [scored]);
  const load = useMemo(() => ownerLoad(scored, OWNER_HORIZON_DAYS), [scored]);
  const queue = useMemo(() => renewalQueue(scored), [scored]);

  // Same four predicates `summarise` counted, kept as row lists so each tile
  // can open exactly the accounts it counted — never re-filtered here.
  const { upForRenewal, forecastAtRisk, noRecentContact, pastDue } = useMemo(
    () => renewalDrillSets(scored),
    [scored],
  );

  if (isInitialLoad) return <HealthLoading />;
  if (error) return <HealthError message={error} />;
  if (hasLoaded && rows.length === 0) return <HealthEmpty />;

  const money = (value: number) => formatCompactMoney(value, currency);
  const atRiskShare = summary.arr > 0 ? Math.round((summary.exposure / summary.arr) * 100) : 0;

  return (
    <div className="w-full flex flex-col gap-4 pb-12">
      {truncated && <HealthTruncatedNotice />}

      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 px-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          Next {HEADLINE_HORIZON_DAYS} days
        </span>
        <span className="text-[11px] text-ink-faint">
          {scored.length} dated {scored.length === 1 ? 'renewal' : 'renewals'} in the book
        </span>
        {/* Both of these are reasons a total below is smaller than the truth,
            so they are stated rather than left for someone to discover. */}
        {withoutDate > 0 && (
          <span className="text-[11px] text-ink-faint">
            · {withoutDate} with no renewal date recorded
          </span>
        )}
        {unconvertedCount > 0 && (
          <span className="text-[11px] text-warning">
            · {unconvertedCount} excluded from money totals (no exchange rate)
          </span>
        )}
      </div>

      <KpiStrip>
        <Kpi
          label="Up for renewal"
          value={money(summary.arr)}
          detail={`${summary.count} ${summary.count === 1 ? 'account' : 'accounts'}${
            summary.unpriced > 0 ? ` · ${summary.unpriced} unpriced` : ''
          }`}
          onDrill={
            drillable
              ? (trigger) =>
                  open(
                    {
                      title: 'Up for renewal',
                      figure: money(summary.arr),
                      source: { kind: 'rows', rows: fromHealthRows(upForRenewal.map((r) => r.row)) },
                    },
                    trigger,
                  )
              : undefined
          }
        />
        <Kpi
          label="Forecast at risk"
          value={money(summary.exposure)}
          detail={`${atRiskShare}% of the window, weighted by risk`}
          tone={atRiskShare >= 20 ? 'loss' : 'neutral'}
          onDrill={
            drillable
              ? (trigger) => {
                  // Same `risk`/`exposure` pair `summarise` summed into the
                  // tile's own figure (Σ ARR × risk) — read here per row, not
                  // recomputed, so each row's weighted amount visibly adds up
                  // to it.
                  const byId = new Map(forecastAtRisk.map((r) => [r.row.id, r]));
                  open(
                    {
                      title: 'Forecast at risk',
                      figure: money(summary.exposure),
                      source: {
                        kind: 'rows',
                        rows: fromHealthRows(forecastAtRisk.map((r) => r.row), (row) => {
                          const item = byId.get(row.id);
                          const riskPct = Math.round((item?.risk ?? 0) * 100);
                          return `${riskPct}% risk · ${money(item?.exposure ?? 0)} at risk`;
                        }),
                      },
                    },
                    trigger,
                  );
                }
              : undefined
          }
        />
        <Kpi
          label="No recent contact"
          value={money(summary.coldArr)}
          detail={`${summary.coldCount} renewing with nothing logged in 60 days`}
          tone={summary.coldCount > 0 ? 'loss' : 'neutral'}
          onDrill={
            drillable
              ? (trigger) =>
                  open(
                    {
                      title: 'No recent contact',
                      figure: money(summary.coldArr),
                      source: { kind: 'rows', rows: fromHealthRows(noRecentContact.map((r) => r.row)) },
                    },
                    trigger,
                  )
              : undefined
          }
        />
        <Kpi
          label="Past due"
          value={String(summary.overdueCount)}
          detail={
            summary.overdueCount > 0
              ? `${money(summary.overdueArr)} past its renewal date`
              : 'every renewal date is still ahead'
          }
          tone={summary.overdueCount > 0 ? 'loss' : 'neutral'}
          onDrill={
            drillable
              ? (trigger) => {
                  const daysById = new Map(pastDue.map((r) => [r.row.id, Math.abs(r.days)]));
                  open(
                    {
                      title: 'Past due',
                      figure: String(summary.overdueCount),
                      source: {
                        kind: 'rows',
                        rows: fromHealthRows(
                          pastDue.map((r) => r.row),
                          (row) => `${daysById.get(row.id)} days overdue`,
                        ),
                      },
                    },
                    trigger,
                  );
                }
              : undefined
          }
        />
      </KpiStrip>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 [&>*]:min-w-0">
        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
          <RenewalQuarterChart columns={quarters} currency={currency} drillable={drillable} />
        </div>
        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
          <RenewalCoverageChart bands={bands} currency={currency} drillable={drillable} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 [&>*]:min-w-0">
        <div className="xl:col-span-2 bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
          <RenewalQueueTable queue={queue} currency={currency} />
        </div>
        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden max-h-[420px]">
          <OwnerLoadChart
            load={load}
            currency={currency}
            horizonDays={OWNER_HORIZON_DAYS}
            drillable={drillable}
          />
        </div>
      </div>
    </div>
  );
}
