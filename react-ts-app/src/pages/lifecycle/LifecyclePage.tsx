import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, GitBranch, TrendingDown, TrendingUp } from 'lucide-react';
import { useAppDispatch, useAppSelector, useOrgCurrency } from '../../hooks';
import { useAllEntities } from '../../hooks/useAllEntities';
import { fetchAccountStats, fetchCustomerStats } from '../../features/customers/customersSlice';
import { fetchAllPages } from '../../lib/apiClient';
import { mapCustomerToOrgRow } from '../../features/customers/mapToOrgRow';
import {
  LIFECYCLE_LABELS,
  HEALTH_COLORS,
  formatDate,
  formatMoney,
  formatCompactMoney,
  companyLabel,
} from '../../features/customers/formatters';
import { EntityAvatar } from '../../components/shared';
import type { Account, Customer } from '../../features/customers/customersSlice';
import type { CurrencyCode } from '../../features/auth/authSlice';
import type { LifecycleCategory } from '../../components/organizations/tableData';

// The real journey every organization's (and, since Accounts carry the
// exact same field — see revenact-backend's Account model docstring —
// every account's own) `lifecycle_stage` actually travels through.
// Same source of truth already powering the Organizations Board's own
// Kanban columns and MetricsPanel's "Lifecycle Stages" section. This
// page is deliberately not another Kanban of that same data (the Board
// already is one) — it's the funnel-shaped, whole-tenant view of where
// everyone sits and how the stages connect, with "Renewal" forking into
// the two real outcomes (Expansion or Churn) rather than one more
// column among equals.
const FORWARD_STAGES: LifecycleCategory[] = ['onboarding', 'kickoff', 'adoption', 'live', 'renewal'];

type MetricTab = 'count' | 'mrr';
type EntityTab = 'organizations' | 'accounts';

// Mirrors MetricsPanel.tsx's own lifecycle color mapping (kept local
// rather than shared — that component's map is private to its own
// donut, and duplicating five class names is cheaper than threading a
// new export through a component this page otherwise has nothing to
// do with).
const STAGE_COLORS: Record<LifecycleCategory, { text: string; bg: string; bar: string }> = {
  onboarding: { text: 'text-info', bg: 'bg-info-dim', bar: 'bg-info' },
  kickoff: { text: 'text-accent', bg: 'bg-accent-dim', bar: 'bg-accent' },
  adoption: { text: 'text-accent', bg: 'bg-accent-dim', bar: 'bg-accent' },
  live: { text: 'text-success', bg: 'bg-success-dim', bar: 'bg-success' },
  renewal: { text: 'text-warning', bg: 'bg-warning-dim', bar: 'bg-warning' },
  expansion: { text: 'text-success', bg: 'bg-success-dim', bar: 'bg-success' },
  churn: { text: 'text-danger', bg: 'bg-danger-dim', bar: 'bg-danger' },
  other: { text: 'text-ink-faint', bg: 'bg-subtle', bar: 'bg-line-strong' },
};

// One row shape both Customer and Account map into, so the table below
// doesn't need to branch per cell — `company` is only ever set for an
// Account (which org(s) it belongs to — see the backend Account
// model's own docstring on why that's now a list, not a single parent).
interface LifecycleRow {
  id: string;
  name: string;
  logo: string;
  avatarBg: string;
  company: string | null;
  owner: string;
  health: { val: number; clr: string };
  lifecycleCategory: LifecycleCategory;
  stageLabel: string;
  arr: string;
  renewal: string;
}

function customerToRow(c: Customer): LifecycleRow {
  const r = mapCustomerToOrgRow(c);
  return {
    id: `c${r.id}`,
    name: r.org,
    logo: r.logo,
    avatarBg: r.bg,
    company: null,
    owner: r.owner,
    health: r.health,
    lifecycleCategory: r.lifecycleCategory,
    stageLabel: r.stage,
    arr: r.arrAccount,
    renewal: r.renewal,
  };
}

function accountToRow(a: Account, currency: CurrencyCode): LifecycleRow {
  return {
    id: `a${a.id}`,
    name: a.name,
    logo: a.domain ? `https://logo.clearbit.com/${a.domain}` : '',
    avatarBg: a.owner ? 'bg-info' : 'bg-line-strong',
    company: companyLabel(a.customers),
    owner: a.owner?.name ?? 'Unassigned',
    health: { val: Number(a.health_score), clr: HEALTH_COLORS[a.health_category] },
    lifecycleCategory: a.lifecycle_stage,
    stageLabel: LIFECYCLE_LABELS[a.lifecycle_stage] ?? 'Other',
    arr: formatMoney(a.arr, currency),
    renewal: formatDate(a.renewal_date),
  };
}

export function LifecyclePage() {
  const dispatch = useAppDispatch();
  const { stats, statsLoading, statsError, accountStats, accountStatsLoading, accountStatsError } = useAppSelector(
    (state) => state.customers
  );
  const currency = useOrgCurrency();
  const [entityTab, setEntityTab] = useState<EntityTab>('organizations');
  const [metricTab, setMetricTab] = useState<MetricTab>('count');
  const [selectedStage, setSelectedStage] = useState<LifecycleCategory | null>(null);

  useEffect(() => {
    dispatch(fetchCustomerStats());
    dispatch(fetchAccountStats());
  }, [dispatch]);

  const activeStats = entityTab === 'organizations' ? stats : accountStats;
  const activeStatsLoading = entityTab === 'organizations' ? statsLoading : accountStatsLoading;
  const activeStatsError = entityTab === 'organizations' ? statsError : accountStatsError;

  const { entities: customers, isLoading: customersLoading, error: customersError } = useAllEntities<Customer>(
    () => fetchAllPages('/customers/'),
    'organization',
    entityTab === 'organizations'
  );
  const { entities: accounts, isLoading: accountsLoading, error: accountsError } = useAllEntities<Account>(
    () => fetchAllPages('/accounts/'),
    'account',
    entityTab === 'accounts'
  );
  const entitiesLoading = entityTab === 'organizations' ? customersLoading : accountsLoading;
  const entitiesError = entityTab === 'organizations' ? customersError : accountsError;

  const maxCount = useMemo(() => {
    if (!activeStats) return 1;
    return Math.max(1, ...FORWARD_STAGES.map((s) => activeStats.lifecycle[s].count));
  }, [activeStats]);

  const rows = useMemo(() => {
    const mapped = entityTab === 'organizations'
      ? customers.map(customerToRow)
      : accounts.map((a) => accountToRow(a, currency));
    const filtered = selectedStage ? mapped.filter((r) => r.lifecycleCategory === selectedStage) : mapped;
    const order: Record<LifecycleCategory, number> = {
      onboarding: 0, kickoff: 1, adoption: 2, live: 3, renewal: 4, expansion: 5, churn: 6, other: 7,
    };
    return [...filtered].sort((a, b) => order[a.lifecycleCategory] - order[b.lifecycleCategory]);
  }, [entityTab, customers, accounts, selectedStage, currency]);

  function metricValue(stage: LifecycleCategory): string {
    if (!activeStats) return '—';
    const bucket = activeStats.lifecycle[stage];
    return metricTab === 'count' ? String(bucket.count) : formatCompactMoney(bucket.mrr, currency);
  }

  function toggleStage(stage: LifecycleCategory) {
    setSelectedStage((current) => (current === stage ? null : stage));
  }

  const entityLabel = entityTab === 'organizations' ? 'Organizations' : 'Accounts';
  const entityLabelSingular = entityTab === 'organizations' ? 'organization' : 'account';

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-ink tracking-tight">Customer Lifecycle</h1>
          <p className="text-[13px] text-ink-faint font-medium mt-0.5">
            Where every {entityLabelSingular} sits in its journey, from onboarding through renewal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 bg-surface border border-line-subtle rounded-lg p-0.5">
            {(['organizations', 'accounts'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setEntityTab(tab);
                  setSelectedStage(null);
                }}
                aria-pressed={entityTab === tab}
                className={`text-[12px] font-bold px-3 py-1.5 rounded-md transition-colors capitalize ${
                  entityTab === tab ? 'bg-accent-dim text-accent' : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 bg-surface border border-line-subtle rounded-lg p-0.5">
            {(['count', 'mrr'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMetricTab(tab)}
                aria-pressed={metricTab === tab}
                className={`text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-md transition-colors ${
                  metricTab === tab ? 'bg-accent-dim text-accent' : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeStatsError && <p className="text-[12.5px] text-danger">{activeStatsError}</p>}
      {metricTab !== 'count' && !!activeStats?.unconverted_count && (
        <p className="text-[12.5px] text-warning">
          {activeStats.unconverted_count} organization{activeStats.unconverted_count === 1 ? '' : 's'} excluded from
          the totals below — no exchange rate set for their currency (Settings &gt; Currency).
        </p>
      )}

      {/* Forward funnel */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {FORWARD_STAGES.map((stage, i) => {
          const colors = STAGE_COLORS[stage];
          const count = activeStats?.lifecycle[stage].count ?? 0;
          const widthPct = Math.max(8, Math.round((count / maxCount) * 100));
          const isSelected = selectedStage === stage;
          return (
            <div key={stage} className="flex items-center flex-1 min-w-[130px]">
              <button
                onClick={() => toggleStage(stage)}
                aria-pressed={isSelected}
                className={`flex-1 flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ${
                  isSelected ? `${colors.bg} border-transparent shadow-sm` : 'bg-surface border-line-subtle hover:border-line-strong'
                }`}
              >
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isSelected ? colors.text : 'text-ink-faint'}`}>
                  {LIFECYCLE_LABELS[stage]}
                </span>
                <span className="text-[24px] font-bold text-ink leading-none">
                  {activeStatsLoading && !activeStats ? '—' : metricValue(stage)}
                </span>
                <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                  <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${widthPct}%` }} />
                </div>
              </button>
              {i < FORWARD_STAGES.length - 1 && (
                <ChevronRight className="w-4 h-4 text-ink-faint shrink-0 mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Renewal forks into two real outcomes */}
      <div className="flex items-center gap-3 pl-2">
        <GitBranch className="w-4 h-4 text-ink-faint rotate-180 shrink-0" />
        <span className="text-[12px] text-ink-faint font-medium shrink-0">From Renewal, {entityLabelSingular}s either —</span>
        <div className="flex gap-3 flex-1">
          {(['expansion', 'churn'] as const).map((stage) => {
            const colors = STAGE_COLORS[stage];
            const isSelected = selectedStage === stage;
            const Icon = stage === 'expansion' ? TrendingUp : TrendingDown;
            return (
              <button
                key={stage}
                onClick={() => toggleStage(stage)}
                aria-pressed={isSelected}
                className={`flex items-center gap-2.5 flex-1 rounded-xl border p-3 transition-all ${
                  isSelected ? `${colors.bg} border-transparent shadow-sm` : 'bg-surface border-line-subtle hover:border-line-strong'
                }`}
              >
                <Icon className={`w-4 h-4 ${colors.text}`} />
                <span className="text-[13px] font-bold text-ink">{LIFECYCLE_LABELS[stage]}</span>
                <span className={`text-[13px] font-bold ml-auto ${colors.text}`}>
                  {activeStatsLoading && !activeStats ? '—' : metricValue(stage)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeStats && activeStats.lifecycle.other.count > 0 && (
        <button
          onClick={() => toggleStage('other')}
          aria-pressed={selectedStage === 'other'}
          className={`self-start text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            selectedStage === 'other' ? 'bg-subtle border-line-strong text-ink' : 'border-line-subtle text-ink-faint hover:text-ink-muted'
          }`}
        >
          {activeStats.lifecycle.other.count} uncategorized ("Other")
        </button>
      )}

      {/* Stage detail table */}
      <div className="flex-1 min-h-[240px] flex flex-col bg-surface rounded-xl border border-line-subtle shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle shrink-0">
          <h2 className="text-[13.5px] font-bold text-ink">
            {selectedStage ? `${LIFECYCLE_LABELS[selectedStage]} — ${rows.length}` : `All ${entityLabel} — ${rows.length}`}
          </h2>
          {selectedStage && (
            <button onClick={() => setSelectedStage(null)} className="text-[12px] font-semibold text-accent hover:text-accent-hover">
              Clear filter
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {entitiesLoading ? (
            <div className="flex items-center justify-center h-full py-16 text-[13px] text-ink-faint">Loading…</div>
          ) : entitiesError ? (
            <div className="flex items-center justify-center h-full py-16 text-[13px] text-danger">{entitiesError}</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-full py-16 text-[13px] text-ink-faint">No {entityLabelSingular}s here.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-subtle/40 border-b border-line-subtle sticky top-0">
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">
                    {entityTab === 'organizations' ? 'Organization' : 'Account'}
                  </th>
                  {entityTab === 'accounts' && (
                    <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Company</th>
                  )}
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Stage</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Owner</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Health</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">ARR</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Renewal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-subtle/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <EntityAvatar name={row.name} logoUrl={row.logo} className={`w-7 h-7 rounded-lg text-[11px] font-bold text-white ${row.avatarBg}`} />
                        <span className="text-[13px] font-bold text-ink">{row.name}</span>
                      </div>
                    </td>
                    {entityTab === 'accounts' && (
                      <td className="px-5 py-3 text-[13px] font-medium text-ink-muted">{row.company}</td>
                    )}
                    <td className="px-5 py-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[row.lifecycleCategory].bg} ${STAGE_COLORS[row.lifecycleCategory].text}`}>
                        {row.stageLabel}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] font-medium text-ink-muted">{row.owner}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${row.health.clr}`} />
                        <span className="text-[13px] font-medium text-ink-muted">{row.health.val}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[13px] font-medium text-ink-muted">{row.arr}</td>
                    <td className="px-5 py-3 text-[13px] font-medium text-ink-muted">{row.renewal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
