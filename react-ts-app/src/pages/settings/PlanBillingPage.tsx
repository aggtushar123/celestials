// Settings › Workspace › Plan & billing: what this workspace has and has used
// (UI foundations spec §6.3, §9.1). Every number is the server's. Seats are
// people (an active member holds one); credits are AI (one per model call).
// /account-settings/billing keeps BillingSettingsPage, untouched until the
// account settings round; both read the same billing slice.

import { useEffect } from 'react';
import { CalendarClock } from 'lucide-react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { fetchBillingLedger, fetchBillingSummary, fetchPlans, type BillingSummary } from '../../features/billing/billingSlice';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FORM_ALERT,
  LoadingState,
  MetaParts,
  NUM,
  SettingsFrame,
  SettingsNote,
  SettingsRow,
  SettingsSection,
  TABLE,
  TD,
  TD_NUM,
  TH,
  TYPE,
  Tile,
  tileRow,
  type BadgeTone,
  ScrollTable,
} from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
}

const KIND_LABEL: Record<string, string> = {
  grant: 'Granted',
  consume: 'Model call',
  refund: 'Refunded',
  adjust: 'Adjusted',
  expire: 'Expired',
};

/** Status colour only for real status (spec §7): a trial is neutral. */
const STATUS: Record<BillingSummary['status'], { label: string; tone: BadgeTone; dot?: boolean }> = {
  trialing: { label: 'Trial', tone: 'neutral' },
  active: { label: 'Active', tone: 'success', dot: true },
  past_due: { label: 'Past due', tone: 'warning' },
  canceled: { label: 'Canceled', tone: 'danger' },
};

export function PlanBillingPage() {
  const dispatch = useAppDispatch();
  const { summary, ledger, plans, error } = useAppSelector((state) => state.billing);
  const canSeeLedger = useCapability('manage_org_settings');

  useEffect(() => {
    dispatch(fetchBillingSummary());
    dispatch(fetchPlans());
    if (canSeeLedger) dispatch(fetchBillingLedger());
  }, [dispatch, canSeeLedger]);

  const title = settingsTitle('/settings/billing');
  const intro = 'What this workspace has and has used.';
  if (!summary) {
    return (
      <SettingsFrame title={title} intro={intro}>
        <Card pad="none">{error ? <ErrorState message={error} /> : <LoadingState label="Loading the plan" variant="block" />}</Card>
      </SettingsFrame>
    );
  }

  const full = summary.seats.used >= summary.seats.limit;
  const seatPct = summary.seats.limit > 0 ? Math.min(100, Math.round((summary.seats.used / summary.seats.limit) * 100)) : 0;
  const trialEnds = when(summary.trial_ends_at);
  const status = STATUS[summary.status];
  return (
    <SettingsFrame title={title} intro={intro}>
      {/* A later read (the ledger) failed: say so above what did load. */}
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
      <div className={tileRow(2)}>
        <Tile
          label="Seats"
          value={
            <>
              <span className={NUM}>{summary.seats.used}</span> <span className={TYPE.bodyMuted}>of {summary.seats.limit}</span>
            </>
          }
          meta={full ? 'Every seat is taken. Free one, or upgrade, before approving anyone else.' : `${summary.seats.limit - summary.seats.used} free.`}
        >
          <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-subtle">
            <span className={`block h-full rounded-full ${full ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${seatPct}%` }} />
          </span>
        </Tile>
        <Tile
          label="AI credits"
          value={<span className={NUM}>{summary.credits.balance}</span>}
          meta={`One credit per Copilot or agent call. A failed call costs nothing.${summary.credits.balance === 0 ? ' None left: the Copilot will refuse until credits are added.' : ''}`}
        />
      </div>

      <SettingsSection look="card"
        title="Current plan"
        action={
          <Badge tone={status.tone} dot={status.dot}>
            {status.label}
          </Badge>
        }
      >
        <SettingsRow label="Plan">
          <p className={TYPE.body}>{summary.plan.name}</p>
        </SettingsRow>
        <SettingsRow label="Price">
          <p className={TYPE.body}>
            {summary.plan.is_trial ? (
              trialEnds ? (
                `Free until ${trialEnds}. Seats stay at ${summary.plan.seats_included} until a plan is bought.`
              ) : (
                'Free while you evaluate.'
              )
            ) : (
              <MetaParts
                parts={[
                  <>
                    <span className={NUM}>{money(summary.plan.price_cents, summary.plan.currency)}</span> a month
                  </>,
                  <>
                    <span className={NUM}>{summary.plan.seats_included}</span> seats
                  </>,
                  <>
                    <span className={NUM}>{summary.plan.monthly_credits}</span> AI credits a month
                  </>,
                ]}
              />
            )}
          </p>
        </SettingsRow>
        {summary.current_period_end ? (
          <SettingsRow label="Period ends">
            <p className={`flex items-center gap-1.5 ${TYPE.body}`}>
              <CalendarClock className="h-4 w-4 text-ink-faint" aria-hidden="true" />
              {when(summary.current_period_end)}
            </p>
          </SettingsRow>
        ) : null}
        {summary.enforced ? null : (
          <div className="px-4 py-3">
            <SettingsNote>Limits are recorded but not enforced during the beta.</SettingsNote>
          </div>
        )}
      </SettingsSection>

      <SettingsSection look="card"
        title="Plans"
        description="Online checkout is coming. To change plans today, contact Revenact and it is applied to your account the same day."
        list="Plans"
        state={plans.length === 0 ? <EmptyState size="inline" title="No plans are published yet." /> : undefined}
      >
        {plans.map((plan) => (
          <li key={plan.code} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <p className={`${TYPE.body} font-semibold`}>{plan.name}</p>
              <p className={TYPE.meta}>
                <MetaParts
                  parts={[
                    <>
                      <span className={NUM}>{plan.seats_included}</span> seats
                    </>,
                    <>
                      <span className={NUM}>{plan.monthly_credits}</span> AI credits a month
                    </>,
                  ]}
                />
              </p>
            </div>
            {plan.code === summary.plan.code ? <Badge>Current plan</Badge> : null}
            <p className={TYPE.body}>
              <span className={NUM}>{money(plan.price_cents, plan.currency)}</span>
              <span className={TYPE.meta}> a month</span>
            </p>
          </li>
        ))}
      </SettingsSection>

      {canSeeLedger ? (
        <SettingsSection look="card"
          title="Credit history"
          description="Every movement, newest first. Your balance is computed from this record."
          state={ledger.length === 0 ? <EmptyState size="inline" title="Nothing yet." /> : undefined}
        >
          <ScrollTable>
            <table aria-label="Credit history" className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    When
                  </th>
                  <th scope="col" className={TH}>
                    What
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Change
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td className={`${TD} text-ink-muted ${NUM}`}>{new Date(row.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className={TD}>
                      {/* The short kind, then the reason as a muted line: a narrow column, so Balance shows at 390. */}
                      <span className="block">{KIND_LABEL[row.kind] ?? row.kind}</span>
                      {row.reason ? <span className={`block ${TYPE.meta}`}>{row.reason}</span> : null}
                    </td>
                    <td className={TD_NUM}>{row.amount > 0 ? `+${row.amount}` : row.amount}</td>
                    <td className={TD_NUM}>{row.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </SettingsSection>
      ) : null}
    </SettingsFrame>
  );
}
