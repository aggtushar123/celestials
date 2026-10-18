import type { ReactNode } from 'react';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import type { Account } from '../../../features/customers/customersSlice';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { AI_PULSE_LABELS, LIFECYCLE_LABELS, formatCompactMoney } from '../../../features/customers/formatters';
import { HEALTH_LABEL } from '../../../features/organizations/portfolioLabels';
import { signed } from '../../../features/organizations/portfolioFields';
import { PulseDots, renewalText } from '../portfolio/rowParts';
import {
  Card,
  CardHeader,
  EmptyState as UiEmptyState,
  ErrorState as UiErrorState,
  FOCUS,
  ICON_BUTTON,
  LoadingState,
  NUM,
  QUIET,
  TYPE,
} from '../../ui';

export interface AccountsSectionProps {
  /** `GET /customers/{id}/accounts/`, the same read as the chips. */
  items: Account[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (account: Account) => void;
}

const DASH = '—';

const utcDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "in Nd" / "Nd overdue" (reusing `renewalText`'s own wording), or "—" with
 *  no renewal date on file — its "No renewal date" phrase is for the
 *  organisation's own tile, not this compact per-account line (round-1 fix,
 *  2026-09-27: every blank value here reads as "—"). */
function renewalInfo(renewalDate: string | null, today: string): { text: string; overdue: boolean } {
  if (!renewalDate) return { text: DASH, overdue: false };
  const days = Math.round((utcDay(renewalDate) - utcDay(today)) / 86400000);
  return { text: renewalText(days), overdue: days < 0 };
}

function pctOrDash(raw: string | null): string {
  return raw == null ? DASH : `${parseFloat(raw)}%`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A number in the house style — tabular DM Mono, so figures line up. */
function Num({ children }: { children: ReactNode }) {
  return <span className={`${NUM} text-ink`}>{children}</span>;
}

/** Every figure the old Accounts-tab summary banner showed (health/ARR by
 *  category, NPS and its promoter/passive/detractor split, average CSAT,
 *  the lifecycle-stage breakdown), computed the same way it was, so nothing
 *  is lost when the banner and its donuts go (round-1 fix, 2026-09-27). */
function summarize(items: Account[]) {
  const total = items.length;
  const health = { good: 0, average: 0, poor: 0 };
  const lifecycle = new Map<Account['lifecycle_stage'], number>();
  let arr = 0;
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  let npsCount = 0;
  let csatTotal = 0;
  let csatCount = 0;
  let csmTotal = 0;
  let csmCount = 0;
  for (const a of items) {
    health[a.health_category]++;
    lifecycle.set(a.lifecycle_stage, (lifecycle.get(a.lifecycle_stage) ?? 0) + 1);
    arr += Number(a.arr) || 0;
    // NPS, CSAT and CSM average only the accounts that actually have a
    // score — a blank one is left out, not counted as a passive/0 (round-3
    // fix, 2026-09-27: confirmed bug — the old code diluted every average
    // toward a blank account's implicit 0/passive; a deliberate break from
    // the old banner, which did dilute this way).
    if (a.nps_score != null) {
      npsCount++;
      if (a.nps_score > 0) promoters++;
      else if (a.nps_score === 0) passives++;
      else detractors++;
    }
    if (a.csat_score != null) {
      csatCount++;
      csatTotal += parseFloat(a.csat_score);
    }
    if (a.csm_pulse_score != null) {
      csmCount++;
      csmTotal += a.csm_pulse_score;
    }
  }
  const npsScore = npsCount > 0 ? signed(Math.round(((promoters - detractors) / npsCount) * 100)) : DASH;
  const avgCsat = csatCount > 0 ? `${Math.round(csatTotal / csatCount)}%` : DASH;
  const avgCsm = csmCount > 0 ? (csmTotal / csmCount).toFixed(1) : DASH;
  const lifecycleLine = (Object.keys(LIFECYCLE_LABELS) as Account['lifecycle_stage'][])
    .filter((key) => lifecycle.get(key))
    .map((key) => `${LIFECYCLE_LABELS[key]} ${lifecycle.get(key)}`)
    .join(' · ');
  return { total, health, arr, npsScore, promoters, passives, detractors, avgCsat, avgCsm, lifecycleLine };
}

/** Replaces the old Accounts-tab summary banner's donuts with the same figures as
 *  compact text (owner decision 2026-09-26; round-1 fix, 2026-09-27: "don't
 *  lose information" — everything the banner showed is still here). */
function AccountsSummary({ items, currency }: { items: Account[]; currency: CurrencyCode }) {
  const { total, health, arr, npsScore, promoters, passives, detractors, avgCsat, avgCsm, lifecycleLine } = summarize(items);
  return (
    <div className={`flex flex-col gap-0.5 px-4 pb-3 ${TYPE.meta}`}>
      <p>
        <Num>{total}</Num> {total === 1 ? 'account' : 'accounts'} · <Num>{health.good}</Num> healthy · <Num>{health.average}</Num> average ·{' '}
        <Num>{health.poor}</Num> at risk · ARR <Num>{formatCompactMoney(arr, currency)}</Num> · NPS <Num>{npsScore}</Num> (
        {plural(promoters, 'promoter')}, {plural(passives, 'passive')}, {plural(detractors, 'detractor')}) · CSAT <Num>{avgCsat}</Num> · avg CSM{' '}
        <Num>{avgCsm}</Num>
      </p>
      {lifecycleLine ? <p>{lifecycleLine}</p> : null}
    </div>
  );
}

function AccountItem({
  account,
  onEdit,
  currency,
  today,
}: {
  account: Account;
  onEdit: (account: Account) => void;
  currency: CurrencyCode;
  today: string;
}) {
  const ai = account.ai_pulse_value;
  const csm = account.csm_pulse_score;
  const healthScore = Number(account.health_score);
  const healthText = Number.isNaN(healthScore) ? (
    <Num>{DASH}</Num>
  ) : (
    <>
      <Num>{healthScore.toFixed(1)}</Num> {HEALTH_LABEL[account.health_category]}
    </>
  );
  const lifecycleText = LIFECYCLE_LABELS[account.lifecycle_stage] ?? 'Other';
  const renewal = renewalInfo(account.renewal_date, today);
  return (
    <li data-account={account.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <Link
          to={`/accounts/${account.id}`}
          className={`flex min-h-11 min-w-0 max-w-full items-center truncate rounded-sm ${TYPE.body} font-semibold hover:underline sm:min-h-0 ${FOCUS}`}
        >
          {account.name}
        </Link>
        <p className={`truncate ${TYPE.meta}`}>{[account.owner?.name || 'No owner', account.domain || null].filter(Boolean).join(' · ')}</p>
        {/* Everything AccountSerializer adds beyond the chip's own fields
           (health, lifecycle, ARR, renewal, NPS, CSAT, the Revenact ID) —
           round-1 fix, 2026-09-27: these used to live only in the old
           Accounts tab's table/banner and would otherwise be lost. */}
        <p className={`mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5 ${TYPE.meta}`}>
          <span>Health {healthText}</span>
          <span>· {lifecycleText}</span>
          <span>· <Num>{formatCompactMoney(account.arr, currency)}</Num> ARR</span>
          <span className={renewal.overdue ? 'font-semibold text-danger-ink' : undefined}>· {renewal.text}</span>
          <span>· NPS <Num>{signed(account.nps_score)}</Num></span>
          <span>· CSAT <Num>{pctOrDash(account.csat_score)}</Num></span>
          <span>· ID <Num>{account.id}</Num></span>
        </p>
        <p className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
          {/* The List's own "AI n · CSM n" form (round-2 fix, 2026-09-27:
             csm_pulse_score was being dropped too). */}
          <span className="text-ink">
            AI <Num>{ai == null ? DASH : ai}</Num> · CSM <Num>{csm == null ? DASH : csm}</Num>
          </span>
          {account.ai_pulse_score ? <span>{AI_PULSE_LABELS[account.ai_pulse_score]}</span> : null}
          {account.pulse.length ? <PulseDots history={account.pulse} /> : null}
        </p>
        {account.ai_pulse_reason ? <p className={`mt-1 line-clamp-2 ${TYPE.bodyMuted}`}>{account.ai_pulse_reason}</p> : null}
      </div>
      <button type="button" aria-label={`Edit ${account.name}`} onClick={() => onEdit(account)} className={`${ICON_BUTTON} self-start`}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/** Accounts on the Details tab (the owner's decision, 2026-09-26: an
 *  account's details are not lost with the old Accounts tab). One list item
 *  per connected account with what the accounts endpoint serves — including
 *  its health, lifecycle, ARR, renewal, NPS, CSAT and Revenact ID (round-1
 *  fix, 2026-09-27: "don't lose information" — these were on the old table/
 *  banner and are not columns here, just a second meta line); the name opens
 *  `/accounts/:id`. A compact summary above the list replaces the old
 *  old Accounts-tab summary banner's donuts with the same figures as text. Add and
 *  Edit are also on the Story tab's chip row. On phones the item's Edit
 *  wraps under its details. */
export function AccountsSection({
  items,
  loading,
  error,
  onRetry,
  onAdd,
  onEdit,
  currency,
  today = new Date().toISOString().slice(0, 10),
}: AccountsSectionProps & {
  /** The organisation's own contract currency (`details.commercial.currency`)
   *  — an Account never carries its own, so its ARR always renders in this
   *  one, matching what the old Accounts-tab summary banner did. */
  currency: CurrencyCode;
  /** For deterministic renewal-runway text in tests; real callers take the
   *  default. */
  today?: string;
}) {
  const headingId = useId();
  return (
    <Card as="section" pad="none" aria-labelledby={headingId}>
      <CardHeader
        id={headingId}
        title="Accounts"
        action={
          <button type="button" onClick={onAdd} className={QUIET}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add account
          </button>
        }
      />
      {loading && items.length === 0 ? (
        <LoadingState label="Loading accounts" />
      ) : error ? (
        <UiErrorState message={error} onRetry={onRetry} />
      ) : items.length ? (
        <>
          <AccountsSummary items={items} currency={currency} />
          <ul className="divide-y divide-line-subtle border-t border-line-subtle">
            {items.map((account) => (
              <AccountItem key={account.id} account={account} onEdit={onEdit} currency={currency} today={today} />
            ))}
          </ul>
        </>
      ) : (
        <UiEmptyState title="No accounts yet" detail="Accounts connected to this organization appear here, each with its owner and pulse." />
      )}
    </Card>
  );
}
