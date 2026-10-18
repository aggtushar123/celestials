import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Archive, Check, Crown, Pencil, X, CreditCard } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import {
  archiveOrganisation,
  billingAction,
  fetchOrganisationBilling,
  fetchOrganisation,
  renameOrganisation,
  setOrganisationStatus,
  transferOwnership,
  type PlatformBilling,
} from '../../features/platform/platformSlice';
import { GmailTwoWayCard } from './GmailTwoWayCard';
import { DomainVerifyForm } from './DomainVerifyForm';
import { StatusPill } from './PlatformOrganisations';

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function PlatformOrganisationDetail() {
  const { id } = useParams();
  const dispatch = useAppDispatch();
  const { organisation, billing, error } = useAppSelector((state) => state.platform);
  const [reason, setReason] = useState('');
  const [newOwner, setNewOwner] = useState<number | ''>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Set by the New organisation modal, once: what the owner should do next.
  const created = (useLocation().state as { ownerMailed?: boolean; ownerEmail?: string } | null) ?? null;

  useEffect(() => {
    if (id) {
      dispatch(fetchOrganisation(Number(id)));
      dispatch(fetchOrganisationBilling(Number(id)));
    }
  }, [dispatch, id]);

  if (!organisation) {
    return (
      <div className="space-y-4">
        <Link to="/platform/organisations" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Organisations
        </Link>
        {error ? (
          <div role="alert" className="flex items-center gap-2 text-[12px] text-danger p-3 bg-danger-dim rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">Loading.</p>
        )}
      </div>
    );
  }

  const suspended = organisation.status === 'suspended';
  const archived = organisation.status === 'archived';

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!draftName.trim()) return;
    setActionError(null);
    setBusy(true);
    try {
      await dispatch(renameOrganisation({ id: organisation!.id, name: draftName.trim() })).unwrap();
      setEditingName(false);
    } catch (err) {
      setActionError(typeof err === 'string' ? err : 'Could not rename the organisation.');
    } finally {
      setBusy(false);
    }
  }

  async function archive(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      await dispatch(archiveOrganisation({ id: organisation!.id, reason: archiveReason.trim() })).unwrap();
      setConfirmArchive(false);
      setArchiveReason('');
    } catch (err) {
      setActionError(typeof err === 'string' ? err : 'Could not archive the organisation.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      await dispatch(
        setOrganisationStatus({ id: organisation!.id, status: suspended ? 'active' : 'suspended', reason: reason.trim() })
      ).unwrap();
      setReason('');
    } catch (err) {
      setActionError(typeof err === 'string' ? err : 'Could not change the status.');
    } finally {
      setBusy(false);
    }
  }

  async function handOver(e: FormEvent) {
    e.preventDefault();
    if (newOwner === '') return;
    setActionError(null);
    setBusy(true);
    try {
      await dispatch(transferOwnership({ id: organisation!.id, userId: newOwner })).unwrap();
      setNewOwner('');
    } catch (err) {
      setActionError(typeof err === 'string' ? err : 'Could not transfer ownership.');
    } finally {
      setBusy(false);
    }
  }

  const candidates = organisation.memberships.filter((m) => m.status === 'active' && m.is_active && !m.is_owner);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/platform/organisations" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Organisations
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {editingName ? (
            <form onSubmit={saveName} className="flex items-center gap-2">
              <label htmlFor="org-name" className="sr-only">Organisation name</label>
              <input id="org-name" type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus className="rv-input text-[16px] font-semibold max-w-[320px]" />
              <button type="submit" disabled={busy || !draftName.trim()} className="rv-pill-primary disabled:opacity-40" aria-label="Save name">
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                Save
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="rv-pill-secondary" aria-label="Cancel rename">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <>
              <h1 className="text-[22px] font-semibold tracking-tight text-ink">{organisation.name}</h1>
              <button
                type="button"
                onClick={() => { setDraftName(organisation.name); setEditingName(true); }}
                className="text-ink-faint hover:text-ink p-1"
                aria-label="Rename organisation"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
          <StatusPill status={organisation.status} />
        </div>
        {created?.ownerEmail && (
          <p role="status" className="text-[12.5px] text-ink mt-2 bg-success-dim border border-success/25 rounded-lg p-2.5">
            Created. {created.ownerEmail} is the root user.{' '}
            {created.ownerMailed
              ? 'They have been emailed a link to choose a password; signing in with Google or Microsoft on that address also works.'
              : 'They can sign in with Google or Microsoft on that address straight away.'}
          </p>
        )}
        <p className="text-[12.5px] text-ink-muted mt-1">
          {organisation.slug} · created {when(organisation.created_at)} · {organisation.members_active} active members ·{' '}
          {organisation.pending_requests} waiting · {organisation.open_invitations} invited
        </p>
      </div>

      {(error || actionError) && (
        <div role="alert" className="flex items-center gap-2 text-[12px] text-danger p-3 bg-danger-dim rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {actionError ?? error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Owner */}
        <section className="rv-card p-4 space-y-3" aria-labelledby="owner-heading">
          <h2 id="owner-heading" className="text-[13px] font-bold text-ink flex items-center gap-2">
            <Crown className="w-4 h-4 text-ink-faint" aria-hidden="true" />
            Owner
          </h2>
          {organisation.owner ? (
            <div className="text-[13px]">
              <div className="font-semibold text-ink">{organisation.owner.name}</div>
              <div className="text-ink-muted">{organisation.owner.email}</div>
            </div>
          ) : (
            <p className="text-[12.5px] text-warning">This organisation has no owner.</p>
          )}
          <form onSubmit={handOver} className="flex flex-wrap items-end gap-2 pt-1">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="new-owner" className="block text-[11.5px] text-ink-muted mb-1">
                Hand over to
              </label>
              <select
                id="new-owner"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value === '' ? '' : Number(e.target.value))}
                className="rv-input text-[12.5px]"
              >
                <option value="">Choose an active member</option>
                {candidates.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={busy || newOwner === ''} className="rv-pill-primary disabled:opacity-40">
              Transfer ownership
            </button>
          </form>
          <p className="text-[11px] text-ink-faint">Only when the owner cannot do it themselves. The new owner becomes an Admin. Audited on the tenant's own trail.</p>
        </section>

        {/* Status */}
        <section className="rv-card p-4 space-y-3" aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-[13px] font-bold text-ink">
            {archived ? 'Archived' : suspended ? 'Reactivate' : 'Suspend'}
          </h2>
          <p className="text-[12.5px] text-ink-muted">
            {archived
              ? 'Closed to sign-in and out of the default list. Everything it owns is still here; reactivating brings it back whole.'
              : suspended
                ? 'Sign-in is refused and every member holds nothing while suspended. Reactivating restores everything; nothing was deleted.'
                : 'Refuses sign-in by every door and voids every member’s capabilities. Nothing is deleted. The reason goes on the record.'}
          </p>
          <form onSubmit={changeStatus} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="status-reason" className="block text-[11.5px] text-ink-muted mb-1">
                Reason
              </label>
              <input
                id="status-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rv-input text-[12.5px]"
                placeholder={suspended ? 'e.g. Invoice settled' : 'e.g. Non-payment, 60 days'}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold disabled:opacity-40 ${
                suspended || archived ? 'bg-accent text-on-accent' : 'bg-danger text-white'
              }`}
            >
              {suspended || archived ? 'Reactivate' : 'Suspend organisation'}
            </button>
          </form>

          {!archived && (
            <div className="pt-3 border-t border-line-subtle">
              {confirmArchive ? (
                <form onSubmit={archive} className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <label htmlFor="archive-reason" className="block text-[11.5px] text-ink-muted mb-1">
                      Reason for archiving
                    </label>
                    <input id="archive-reason" type="text" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="rv-input text-[12.5px]" placeholder="e.g. Churned, contract ended" />
                  </div>
                  <button type="submit" disabled={busy || !archiveReason.trim()} className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-danger text-white disabled:opacity-40">
                    Archive organisation
                  </button>
                  <button type="button" onClick={() => setConfirmArchive(false)} className="rv-pill-secondary">
                    Keep it
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirmArchive(true)} className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-danger">
                  <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                  Archive this organisation
                </button>
              )}
              <p className="text-[11px] text-ink-faint mt-1.5">Archiving closes sign-in and hides it from the list. Nothing is purged; that is a separate, deliberate act with its own retention rules.</p>
            </div>
          )}
        </section>
      </div>

      <GmailTwoWayCard organisationId={organisation.id} gmail={organisation.gmail} />

      {billing && <BillingCard organisationId={organisation.id} billing={billing} onError={setActionError} />}

      {/* Members */}
      <section className="rv-card overflow-hidden" aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-[13px] font-bold text-ink px-4 pt-4 pb-2">
          Members
        </h2>
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-[0.08em] text-ink-faint text-left">
            <tr className="border-y border-line-subtle">
              <th className="px-4 py-2 font-semibold">Person</th>
              <th className="px-4 py-2 font-semibold">Role</th>
              <th className="px-4 py-2 font-semibold">Department</th>
              <th className="px-4 py-2 font-semibold">Standing</th>
              <th className="px-4 py-2 font-semibold">Last sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {organisation.memberships.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2">
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    {m.name}
                    {m.is_owner && <Crown className="w-3.5 h-3.5 text-warning" aria-label="Owner" />}
                  </div>
                  <div className="text-[11px] text-ink-muted">{m.email}</div>
                </td>
                <td className="px-4 py-2 text-ink-muted">{m.role ?? '—'}</td>
                <td className="px-4 py-2 text-ink-muted">{m.department ?? '—'}</td>
                <td className="px-4 py-2">
                  <StatusPill status={m.is_active ? m.status : 'archived'} />
                </td>
                <td className="px-4 py-2 text-ink-muted">{when(m.last_login)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rv-card p-4" aria-labelledby="domains-heading">
          <h2 id="domains-heading" className="text-[13px] font-bold text-ink mb-2">
            Domains
          </h2>
          {organisation.domains.length === 0 ? (
            <p className="text-[12.5px] text-ink-faint">None claimed.</p>
          ) : (
            <ul className="space-y-1.5 text-[12.5px]">
              {organisation.domains.map((d) => (
                <li key={d.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink">
                      {d.domain}
                      {d.is_primary && <span className="text-ink-faint text-[11px]"> · primary</span>}
                    </span>
                    <StatusPill status={d.verification_status === 'verified' ? 'active' : d.verification_status === 'revoked' ? 'suspended' : 'pending'} />
                  </div>
                  {d.verification_status === 'pending' ? <DomainVerifyForm organisationId={organisation.id} domainId={d.id} domain={d.domain} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rv-card p-4" aria-labelledby="events-heading">
          <h2 id="events-heading" className="text-[13px] font-bold text-ink mb-2">
            Recent events
          </h2>
          {organisation.recent_events.length === 0 ? (
            <p className="text-[12.5px] text-ink-faint">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5 text-[12px]">
              {organisation.recent_events.map((e, index) => (
                <li key={`${e.at}-${index}`} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink font-mono-brand text-[11.5px]">{e.action}</span>
                  <span className="text-ink-muted truncate">{e.actor || 'system'}</span>
                  <span className={`shrink-0 ${e.outcome === 'failure' ? 'text-danger' : 'text-ink-faint'}`}>{when(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default PlatformOrganisationDetail;

/**
 * Plan, seats and credits, with the three things staff may change. Each needs
 * a reason: these are the movements no system event explains, and every one
 * lands on the tenant's own audit trail.
 */
function BillingCard({
  organisationId,
  billing,
  onError,
}: {
  organisationId: number;
  billing: PlatformBilling;
  onError: (message: string | null) => void;
}) {
  const dispatch = useAppDispatch();
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [seatLimit, setSeatLimit] = useState('');
  const [seatReason, setSeatReason] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [planReason, setPlanReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: 'credits' | 'seats' | 'plan', body: Record<string, unknown>, reset: () => void) {
    onError(null);
    setBusy(action);
    try {
      await dispatch(billingAction({ id: organisationId, action, body })).unwrap();
      reset();
    } catch (err) {
      onError(typeof err === 'string' ? err : 'Could not update billing.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rv-card p-4 space-y-4" aria-labelledby="billing-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="billing-heading" className="text-[13px] font-bold text-ink flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-ink-faint" aria-hidden="true" />
          Billing
        </h2>
        <p className="text-[12px] text-ink-muted">
          <span className="font-semibold text-ink">{billing.plan.name}</span> · {billing.status.replace('_', ' ')}
          {billing.trial_ends_at ? ` · trial ends ${when(billing.trial_ends_at)}` : ''}
          {billing.stripe_customer_id ? ` · Stripe ${billing.stripe_customer_id}` : ''}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-[12.5px]">
        <div className="rounded-lg border border-line-subtle p-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">Seats</div>
          <div className="text-[20px] font-semibold text-ink tabular-nums">
            {billing.seats.used} <span className="text-[12px] text-ink-muted font-medium">of {billing.seats.limit}</span>
          </div>
        </div>
        <div className="rounded-lg border border-line-subtle p-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">AI credits</div>
          <div className="text-[20px] font-semibold text-ink tabular-nums">{billing.credits.balance}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run('credits', { amount: Number(creditAmount), reason: creditReason.trim() }, () => { setCreditAmount(''); setCreditReason(''); });
          }}
          className="space-y-2"
          aria-label="Adjust credits"
        >
          <label htmlFor="credit-amount" className="block text-[11.5px] text-ink-muted">Adjust credits (signed)</label>
          <input id="credit-amount" type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="rv-input text-[12.5px]" placeholder="+100 or -50" />
          <input aria-label="Credit reason" type="text" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} className="rv-input text-[12.5px]" placeholder="Reason" />
          <button type="submit" disabled={busy !== null || !creditAmount || !creditReason.trim()} className="rv-pill-secondary disabled:opacity-40">Apply credits</button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run('seats', { seats_limit: Number(seatLimit), reason: seatReason.trim() }, () => { setSeatLimit(''); setSeatReason(''); });
          }}
          className="space-y-2"
          aria-label="Set seat limit"
        >
          <label htmlFor="seat-limit" className="block text-[11.5px] text-ink-muted">Seat allowance</label>
          <input id="seat-limit" type="number" min={0} value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} className="rv-input text-[12.5px]" placeholder={String(billing.seats.limit)} />
          <input aria-label="Seat reason" type="text" value={seatReason} onChange={(e) => setSeatReason(e.target.value)} className="rv-input text-[12.5px]" placeholder="Reason" />
          <button type="submit" disabled={busy !== null || seatLimit === '' || !seatReason.trim()} className="rv-pill-secondary disabled:opacity-40">Set seats</button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run('plan', { plan_code: planCode, reason: planReason.trim() }, () => { setPlanCode(''); setPlanReason(''); });
          }}
          className="space-y-2"
          aria-label="Change plan"
        >
          <label htmlFor="plan-code" className="block text-[11.5px] text-ink-muted">Plan</label>
          <select id="plan-code" value={planCode} onChange={(e) => setPlanCode(e.target.value)} className="rv-input text-[12.5px]">
            <option value="">Choose a plan</option>
            {(billing.plans ?? []).map((p) => (
              <option key={p.code} value={p.code}>{p.name} · {p.seats_included} seats · {p.monthly_credits} credits</option>
            ))}
          </select>
          <input aria-label="Plan reason" type="text" value={planReason} onChange={(e) => setPlanReason(e.target.value)} className="rv-input text-[12.5px]" placeholder="Reason" />
          <button type="submit" disabled={busy !== null || !planCode || !planReason.trim()} className="rv-pill-primary disabled:opacity-40">Change plan</button>
        </form>
      </div>

      {(billing.ledger ?? []).length > 0 && (
        <ul className="text-[12px] divide-y divide-line-subtle" aria-label="Recent credit movements">
          {(billing.ledger ?? []).slice(0, 8).map((row) => (
            <li key={row.id} className="py-1.5 flex items-baseline justify-between gap-3">
              <span className="text-ink-muted truncate">{row.kind}{row.reason ? ` · ${row.reason}` : ''}{row.actor ? ` · ${row.actor}` : ''}</span>
              <span className={`tabular-nums shrink-0 ${row.amount < 0 ? 'text-ink-muted' : 'text-success'}`}>{row.amount > 0 ? `+${row.amount}` : row.amount}</span>
              <span className="tabular-nums shrink-0 text-ink">{row.balance_after}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

