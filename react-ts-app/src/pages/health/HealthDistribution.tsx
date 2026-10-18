import { useEffect, useMemo, useState } from 'react';
import { Smile, Meh, Frown, ThumbsUp, Minus, ThumbsDown } from 'lucide-react';
import { useAppDispatch, useAppSelector, useOrgCurrency } from '../../hooks';
import { useAllEntities } from '../../hooks/useAllEntities';
import { fetchAccountStats, fetchCustomerStats } from '../../features/customers/customersSlice';
import { fetchAllPages } from '../../lib/apiClient';
import { mapCustomerToOrgRow } from '../../features/customers/mapToOrgRow';
import {
  AI_PULSE_LABELS,
  LIFECYCLE_LABELS,
  HEALTH_COLORS as HEALTH_DOT_COLORS,
  npsColor,
  companyLabel,
  formatCompactMoney,
} from '../../features/customers/formatters';
import { EntityAvatar } from '../../components/shared';
import type { Account, Customer } from '../../features/customers/customersSlice';
import type { HealthCategory } from '../../components/organizations/tableData';
import { SHARED_KEYS, useDashboardFilters } from '../dashboard/shared/useDashboardFilters';
import { ScrollTable } from '../dashboard/shared/ScrollTable';
import { zeroMoney } from '../dashboard/shared/chartAxis';

// Real health signals already live on both Customer and Account (see
// revenact-backend's Account model docstring: its health/AI Pulse/NPS
// mean the same thing as a Customer's, just at a finer grain) and are
// already surfaced piecemeal elsewhere: `health_score`/`health_category`
// back MetricsPanel's own "Health" donut and every health dot in the
// Organizations/Accounts tables; `ai_pulse_score` backs the tables' own
// "AI Pulse" column; `nps_score` backs MetricsPanel's own "NPS" section.
// This page is the one place all three roll up together into a single,
// whole-tenant health view — for Organizations or Accounts — with a
// drill-down into who's actually behind each number.
//
// Lives at Dashboard > Health > Distribution now (it used to be its own
// page at /health). It reads `/customers/stats/` and `/accounts/stats/`,
// neither of which accepts the dashboard's owner/lifecycle/account
// filters, so it ignores the bar above it rather than silently pretending
// to honour it — see the notice this renders whenever one of those
// filters is on.
type MetricTab = 'count' | 'mrr';
type EntityTab = 'organizations' | 'accounts';

const HEALTH_ORDER: HealthCategory[] = ['good', 'average', 'poor'];

const HEALTH_COLORS: Record<HealthCategory, { text: string; bg: string; bar: string; icon: typeof Smile }> = {
  good: { text: 'text-success', bg: 'bg-success-dim', bar: 'bg-success', icon: Smile },
  average: { text: 'text-warning', bg: 'bg-warning-dim', bar: 'bg-warning', icon: Meh },
  poor: { text: 'text-danger', bg: 'bg-danger-dim', bar: 'bg-danger', icon: Frown },
};

const HEALTH_LABELS: Record<HealthCategory, string> = { good: 'Good', average: 'Average', poor: 'Poor' };

const AI_PULSE_ORDER: Customer['ai_pulse_score'][] = ['very_satisfied', 'satisfied', 'moderate', 'high_risk'];

const AI_PULSE_COLORS: Record<string, { text: string; bg: string }> = {
  very_satisfied: { text: 'text-success', bg: 'bg-success-dim' },
  // Positive but not the top band: neutral ink, not a fourth hue. The pill's
  // own label ("Satisfied") carries the meaning, not the colour.
  satisfied: { text: 'text-ink', bg: 'bg-subtle' },
  moderate: { text: 'text-warning', bg: 'bg-warning-dim' },
  high_risk: { text: 'text-danger', bg: 'bg-danger-dim' },
};

/** Owned vs unowned avatars: two monochrome steps, no hue. */
const OWNED_AVATAR_BG = 'bg-ink-muted';

// One row shape both Customer and Account map into — `company` is only
// ever set for an Account (which org(s) it belongs to).
interface HealthRow {
  id: string;
  name: string;
  logo: string;
  avatarBg: string;
  company: string | null;
  owner: string;
  health: { val: number; clr: string };
  healthCategory: HealthCategory;
  aiScore: string;
  lifecycleLabel: string;
  nps: string;
  npsColorClass: string;
}

function customerToRow(c: Customer): HealthRow {
  const r = mapCustomerToOrgRow(c);
  return {
    id: `c${r.id}`,
    name: r.org,
    logo: r.logo,
    // Not `r.bg`: mapCustomerToOrgRow paints owned rows in the blue info role,
    // the dashboard doesn't have (see chartPalette.test.ts).
    avatarBg: c.owner ? OWNED_AVATAR_BG : 'bg-line-strong',
    company: null,
    owner: r.owner,
    health: r.health,
    healthCategory: r.healthCategory,
    aiScore: r.aiScore,
    lifecycleLabel: LIFECYCLE_LABELS[r.lifecycleCategory] ?? 'Other',
    nps: r.nps,
    npsColorClass: r.npsColor,
  };
}

function accountToRow(a: Account): HealthRow {
  const nps = a.nps_score ?? 0;
  return {
    id: `a${a.id}`,
    name: a.name,
    logo: a.domain ? `https://logo.clearbit.com/${a.domain}` : '',
    avatarBg: a.owner ? OWNED_AVATAR_BG : 'bg-line-strong',
    company: companyLabel(a.customers),
    owner: a.owner?.name ?? 'Unassigned',
    health: { val: Number(a.health_score), clr: HEALTH_DOT_COLORS[a.health_category] },
    healthCategory: a.health_category,
    aiScore: AI_PULSE_LABELS[a.ai_pulse_score] ?? '—',
    lifecycleLabel: LIFECYCLE_LABELS[a.lifecycle_stage] ?? 'Other',
    nps: a.nps_score === null ? '0' : `${nps > 0 ? '+' : ''}${nps}`,
    npsColorClass: npsColor(nps),
  };
}

/**
 * Health › Distribution's lower half: the whole-tenant Organizations/Accounts
 * × count/MRR rollup that used to be its own page at /health.
 */
export function HealthDistribution() {
  const dispatch = useAppDispatch();
  const { stats, statsLoading, statsError, accountStats, accountStatsLoading, accountStatsError } = useAppSelector(
    (state) => state.customers
  );
  const currency = useOrgCurrency();
  const [entityTab, setEntityTab] = useState<EntityTab>('organizations');
  const [metricTab, setMetricTab] = useState<MetricTab>('count');
  const [selectedCategory, setSelectedCategory] = useState<HealthCategory | null>(null);

  // The dashboard's shared owner/lifecycle/account filters — read only to
  // decide whether the notice below should show, never to narrow this
  // section's own /stats/ reads (see the file header).
  const { activeCount } = useDashboardFilters(SHARED_KEYS);
  const filtersIgnored = activeCount(SHARED_KEYS) > 0;

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
    return Math.max(1, ...HEALTH_ORDER.map((c) => activeStats.health[c].count));
  }, [activeStats]);

  // Not part of CustomerStatsView's/AccountStatsView's own rollup (those
  // endpoints only aggregate health/nps/lifecycle) — cheap to derive
  // client-side since every entity is already fetched for the table.
  const aiPulseCounts = useMemo(() => {
    const counts: Record<string, number> = { very_satisfied: 0, satisfied: 0, moderate: 0, high_risk: 0 };
    const source: { ai_pulse_score: Customer['ai_pulse_score'] }[] = entityTab === 'organizations' ? customers : accounts;
    for (const e of source) {
      if (e.ai_pulse_score) counts[e.ai_pulse_score] += 1;
    }
    return counts;
  }, [entityTab, customers, accounts]);

  const rows = useMemo(() => {
    const mapped = entityTab === 'organizations' ? customers.map(customerToRow) : accounts.map(accountToRow);
    const filtered = selectedCategory ? mapped.filter((r) => r.healthCategory === selectedCategory) : mapped;
    const order: Record<HealthCategory, number> = { poor: 0, average: 1, good: 2 };
    return [...filtered].sort((a, b) => order[a.healthCategory] - order[b.healthCategory] || a.health.val - b.health.val);
  }, [entityTab, customers, accounts, selectedCategory]);

  function metricValue(category: HealthCategory): string {
    if (!activeStats) return '—';
    const bucket = activeStats.health[category];
    if (metricTab === 'count') return String(bucket.count);
    // Compact notation prints nothing as "$0.0", which reads like a rounded
    // non-zero.
    return bucket.mrr === 0 ? zeroMoney(currency) : formatCompactMoney(bucket.mrr, currency);
  }

  function toggleCategory(category: HealthCategory) {
    setSelectedCategory((current) => (current === category ? null : category));
  }

  const entityLabel = entityTab === 'organizations' ? 'Organizations' : 'Accounts';
  const entityLabelSingular = entityTab === 'organizations' ? 'organization' : 'account';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end gap-3">
        <div className="flex items-center gap-0.5 bg-surface border border-line-subtle rounded-lg p-0.5">
          {(['organizations', 'accounts'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setEntityTab(tab);
                setSelectedCategory(null);
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

      {filtersIgnored && (
        <p className="text-[11px] text-ink-muted">
          Covers the whole book; the filters above do not apply to this section.
        </p>
      )}

      {activeStatsError && <p className="text-[12.5px] text-danger">{activeStatsError}</p>}
      {metricTab !== 'count' && !!activeStats?.unconverted_count && (
        <p className="text-[12.5px] text-warning">
          {activeStats.unconverted_count} organization{activeStats.unconverted_count === 1 ? '' : 's'} excluded from
          the totals below — no exchange rate set for their currency (Settings &gt; Currency).
        </p>
      )}

      {/* Health distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 [&>*]:min-w-0">
        {HEALTH_ORDER.map((category) => {
          const colors = HEALTH_COLORS[category];
          const Icon = colors.icon;
          const count = activeStats?.health[category].count ?? 0;
          // An empty category draws no bar: the old 8% floor made nothing look
          // like something. A non-empty one keeps at least a sliver.
          const widthPct = Math.round((count / maxCount) * 100);
          const isSelected = selectedCategory === category;
          return (
            <button
              key={category}
              onClick={() => toggleCategory(category)}
              aria-pressed={isSelected}
              className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ${
                isSelected ? `${colors.bg} border-transparent shadow-sm` : 'bg-surface border-line-subtle hover:border-line-strong'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${isSelected ? colors.text : 'text-ink-faint'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isSelected ? colors.text : 'text-ink-faint'}`}>
                  {HEALTH_LABELS[category]}
                </span>
              </div>
              <span className="text-[24px] font-bold text-ink leading-none">
                {activeStatsLoading && !activeStats ? '—' : metricValue(category)}
              </span>
              <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                <div
                  data-testid="health-share-bar"
                  className={`h-full rounded-full ${colors.bar} ${count > 0 ? 'min-w-[2px]' : ''}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* NPS */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line-subtle bg-surface p-4">
        <div className="flex flex-col gap-0.5 pr-6 border-r border-line-subtle">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">NPS Score</span>
          <span className="text-[24px] font-bold text-ink leading-none">
            {activeStats ? (activeStats.nps.score > 0 ? `+${activeStats.nps.score}` : activeStats.nps.score) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
          <ThumbsUp className="w-4 h-4 text-success" /> {activeStats?.nps.promoters ?? 0} Promoters
        </div>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
          <Minus className="w-4 h-4 text-warning" /> {activeStats?.nps.passives ?? 0} Passives
        </div>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
          <ThumbsDown className="w-4 h-4 text-danger" /> {activeStats?.nps.detractors ?? 0} Detractors
        </div>
      </div>

      {/* AI Pulse */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12px] font-bold text-ink-faint uppercase tracking-wider shrink-0">AI Pulse</span>
        {AI_PULSE_ORDER.map((score) => (
          <span
            key={score}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-full ${AI_PULSE_COLORS[score!].bg} ${AI_PULSE_COLORS[score!].text}`}
          >
            {AI_PULSE_LABELS[score!]} · {aiPulseCounts[score!]}
          </span>
        ))}
      </div>

      {/* Detail table */}
      <div className="flex flex-col bg-surface rounded-xl border border-line-subtle shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle shrink-0">
          <h2 className="text-[13.5px] font-bold text-ink">
            {selectedCategory ? `${HEALTH_LABELS[selectedCategory]} — ${rows.length}` : `All ${entityLabel} — ${rows.length}`}
          </h2>
          {selectedCategory && (
            <button onClick={() => setSelectedCategory(null)} className="text-[12px] font-semibold text-accent hover:text-accent-hover">
              Clear filter
            </button>
          )}
        </div>

        {entitiesLoading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-ink-faint">Loading…</div>
        ) : entitiesError ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-danger">{entitiesError}</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-ink-faint">No {entityLabelSingular}s here.</div>
        ) : (
          // Scrolls inside its card with the header pinned: it used to grow
          // the page by every organization or account in the tenant.
          <ScrollTable caption={`${entityLabel} health`} maxHeight={520} minWidth={720}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line-subtle">
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">
                    {entityTab === 'organizations' ? 'Organization' : 'Account'}
                  </th>
                  {entityTab === 'accounts' && (
                    <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Company</th>
                  )}
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Health</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">AI Pulse</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Lifecycle</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">Owner</th>
                  <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">NPS</th>
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
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${row.health.clr}`} />
                        <span className="text-[13px] font-medium text-ink-muted">{row.health.val}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[13px] font-medium text-ink-muted">{row.aiScore}</td>
                    <td className="px-5 py-3 text-[13px] font-medium text-ink-muted">{row.lifecycleLabel}</td>
                    <td className="px-5 py-3 text-[13px] font-medium text-ink-muted">{row.owner}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${row.npsColorClass}`} />
                        <span className="text-[13px] font-medium text-ink-muted">{row.nps}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </div>
    </div>
  );
}
