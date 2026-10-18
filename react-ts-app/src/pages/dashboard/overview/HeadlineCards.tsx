import { useEffect, useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchForecast } from '../../../features/forecast/forecastSlice';
import {
  clearHealthFilters,
  fetchHealthOverview,
  matchesFilters,
  replaceHealthFilters,
} from '../../../features/health/healthSlice';
import { fetchTicketStats } from '../../../features/tickets/ticketsSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { Kpi } from '../shared/Kpi';
import { Panel } from '../shared/Panel';
import { sharedSearch, toQuery } from '../shared/useDashboardFilters';
import { summarise, triage } from '../tabs/health-overview/triage';

type Values = Record<string, string>;

const DASH = '—';

function AreaLink({ area, label }: { area: string; label: string }) {
  const search = sharedSearch(useLocation().search);
  return (
    <Link
      to={{ pathname: `/dashboard/${area}`, search }}
      className="shrink-0 min-h-9 inline-flex items-center px-1 rounded text-[13px] font-semibold text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      Open {label} →
    </Link>
  );
}

/** A skeleton shaped like the card's Kpis: a label line over a figure line. */
function Skeleton({ figures }: { figures: number }) {
  return (
    <div data-testid="headline-skeleton" aria-hidden="true" className="grid grid-cols-2 gap-4">
      {Array.from({ length: figures }, (_, i) => (
        <div key={i} className="space-y-2">
          <span className="block h-3 w-16 rounded bg-subtle animate-pulse" />
          <span className="block h-6 w-20 rounded bg-subtle animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function Card({
  title,
  area,
  loading,
  figures = 2,
  children,
}: {
  title: string;
  area: string;
  loading: boolean;
  figures?: number;
  children: ReactNode;
}) {
  return (
    <Panel title={title} action={<AreaLink area={area} label={title} />}>
      <div aria-busy={loading || undefined}>
        {loading ? <Skeleton figures={figures} /> : <div className="grid grid-cols-2 gap-4">{children}</div>}
      </div>
    </Panel>
  );
}

function RevenueCard({ values }: { values: Values }) {
  const dispatch = useAppDispatch();
  const { stats, error, query: answered } = useAppSelector((state) => state.forecast);
  const query = toQuery({ ...values, horizon_days: '365' });

  useEffect(() => {
    dispatch(fetchForecast(query));
  }, [dispatch, query]);

  // The slice is shared with the Revenue area: figures for another filter
  // or horizon are not this card's, so they count as not loaded yet.
  const own = answered === query ? stats : null;
  const money = (value: number) => formatCompactMoney(value, own?.currency ?? 'USD');
  const bridge = error ? null : own?.bridge;
  return (
    <Card title="Revenue" area="revenue" loading={!own && !error}>
      <Kpi label="ARR today" value={bridge ? money(bridge.opening_arr) : DASH} />
      <Kpi label="At risk" value={bridge ? money(bridge.churn + bridge.contraction) : DASH} detail="churn and contraction, 12 months" />
    </Card>
  );
}

/**
 * Health filters its book client-side from `state.health.filters`, so the
 * shared URL filters are copied in exactly as `HealthOverviewContainer` does
 * (`replaceHealthFilters`, no pruning) and cleared on unmount, so leaving the
 * Overview never leaves a stale filter narrowing the Health area.
 */
function HealthCard({ values }: { values: Values }) {
  const dispatch = useAppDispatch();
  const { rows, filters, loadedAt, error } = useAppSelector((state) => state.health);

  useEffect(() => {
    dispatch(fetchHealthOverview());
  }, [dispatch]);

  useEffect(() => {
    dispatch(
      replaceHealthFilters({
        owner: values.owner || null,
        lifecycle: values.lifecycle || null,
        account: values.customer || null,
      }),
    );
  }, [dispatch, values.owner, values.lifecycle, values.customer]);

  useEffect(() => {
    return () => {
      dispatch(clearHealthFilters());
    };
  }, [dispatch]);

  const summary = useMemo(
    () => summarise(triage(rows.filter((row) => matchesFilters(row, filters)), new Date())),
    [rows, filters],
  );
  const failed = Boolean(error) && loadedAt === null;
  return (
    <Card title="Health" area="health" loading={loadedAt === null && !failed}>
      <Kpi label="Book at Good" value={failed ? DASH : `${summary.atGood}/${summary.total}`} />
      <Kpi label="Needs action" value={failed ? DASH : String(summary.needsAction)} />
    </Card>
  );
}

/** Tickets has no lifecycle filter, so only owner and account travel. */
function SupportCard({ values }: { values: Values }) {
  const dispatch = useAppDispatch();
  const { stats, statsError, statsQuery } = useAppSelector((state) => state.tickets);
  const query = toQuery({ owner: values.owner, customer: values.customer });

  useEffect(() => {
    dispatch(fetchTicketStats(query));
  }, [dispatch, query]);

  // Shared with the Support area, whose bar has its own filters: only
  // stats for this card's query are this card's.
  const own = statsQuery === query ? stats : null;
  const kpis = statsError ? null : own?.kpis;
  const oldest = kpis?.oldest_open_days;
  const detail = !kpis
    ? undefined
    : oldest === null || oldest === undefined || !kpis.open_count
      ? 'none open'
      : `oldest ${oldest} ${oldest === 1 ? 'day' : 'days'}`;
  return (
    <Card title="Support" area="support" loading={!own && !statsError} figures={1}>
      <Kpi label="Open tickets" value={kpis ? String(kpis.open_count ?? 0) : DASH} detail={detail} />
    </Card>
  );
}

/** Revenue, Health and Support at a glance, each read from the endpoint its
 *  area uses so the Overview never disagrees with the page it links to. */
export function HeadlineCards({ values }: { values: Values }) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <RevenueCard values={values} />
      <HealthCard values={values} />
      <SupportCard values={values} />
    </div>
  );
}
