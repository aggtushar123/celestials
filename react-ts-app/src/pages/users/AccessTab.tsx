// Settings > People & teams > Access: who is asking to join, who has been
// asked, and which domains route people here automatically.
//
// Three parts, one rule each:
//   Requests: people who signed in with a corporate address and hold
//             nothing until someone here says yes, with a role.
//   Invitations: the company asking first. No link to forward: the invited
//             address signs in and is let straight in.
//   Domains: a claim proves nothing; the TXT record does. Verified
//             domains route sign-ins here; unverified ones only let the
//             next person ask.
//
// Requests and invitations need `manage_users`; domains need
// `manage_org_settings`, so that section is shown only to people who hold it.

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { BUTTON, Badge, CODE, FORM_ALERT, INPUT, INVALID, MetaParts, PRIMARY, QUIET, ROW_ACTIONS, Select, SettingsRow, SettingsSection, TYPE } from '../../components/ui';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import type { Role } from '../../features/userManagement/userManagementSlice';
import {
  addDomain,
  cancelInvitation,
  clearAccessError,
  decideAccessRequest,
  fetchAccessRequests,
  fetchDomains,
  fetchInvitations,
  sendInvitation,
  verifyDomain,
  type AccessRequest,
  type Invitation,
  type OrganisationDomain,
} from '../../features/access/accessSlice';

/** Runs a focus move after the render that follows a change (the row that
 *  had focus is gone by then), as AgentAccess and Webhooks do. */
function usePendingFocus() {
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const run = pending.current;
    pending.current = null;
    run?.();
  });
  return pending;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function AccessTab({ roles }: { roles: Role[] }) {
  const dispatch = useAppDispatch();
  const { requests, invitations, domains, error } = useAppSelector((state) => state.access);
  const canManageDomains = useCapability('manage_org_settings');
  // Where focus lands when a decision or a cancel empties its list.
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dispatch(fetchAccessRequests());
    dispatch(fetchInvitations());
    if (canManageDomains) dispatch(fetchDomains());
    return () => {
      dispatch(clearAccessError());
    };
  }, [dispatch, canManageDomains]);

  return (
    <>
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
      <RequestsSection requests={requests} roles={roles} emailRef={emailRef} />
      <InvitationsSection invitations={invitations} roles={roles} emailRef={emailRef} />
      {canManageDomains ? <DomainsSection domains={domains} /> : null}
    </>
  );
}

// ── Requests ──────────────────────────────────────────────────────────

function RequestsSection({ requests, roles, emailRef }: { requests: AccessRequest[]; roles: Role[]; emailRef: RefObject<HTMLInputElement | null> }) {
  const dispatch = useAppDispatch();
  const defaultRole = roles.find((r) => r.slug === 'csm') ?? roles[0];
  const [chosenRole, setChosenRole] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<number | null>(null);
  // Read synchronously, so a double press sends one decision.
  const deciding = useRef(new Set<number>());
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusRef = usePendingFocus();

  async function decide(request: AccessRequest, decision: 'approve' | 'reject') {
    if (deciding.current.has(request.id) || (decision === 'approve' && !defaultRole)) return;
    deciding.current.add(request.id);
    setBusy(request.id);
    try {
      await dispatch(
        decideAccessRequest({
          id: request.id,
          decision,
          roleId: chosenRole[request.id] ?? defaultRole?.id,
        })
      ).unwrap();
      // The row is gone: the list, or Work email once nobody is waiting.
      pendingFocusRef.current = () => (listRef.current ?? emailRef.current)?.focus();
    } catch {
      // The slice holds the refusal; the tab shows it above the sections.
    } finally {
      deciding.current.delete(request.id);
      setBusy(null);
    }
  }

  return (
    <SettingsSection look="card"
      title="Waiting to join"
      description="They signed in with a company address and hold nothing until you choose a role and approve."
      list="Waiting to join"
      listRef={listRef}
      state={requests.length === 0 ? <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>Nobody is waiting.</p> : undefined}
    >
      {requests.map((request) => (
        <li key={request.id} className="group relative flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <p title={request.user_name} className={`${TYPE.body} truncate font-semibold`}>
              {request.user_name}
            </p>
            <p className={`${TYPE.meta} truncate`}>
              <MetaParts parts={[request.email, `asked ${formatDate(request.requested_at)}`]} />
            </p>
          </div>
          <Select
            id={`request-role-${request.id}`}
            label={`Role for ${request.user_name}`}
            labelPosition="hidden"
            value={String(chosenRole[request.id] ?? defaultRole?.id ?? '')}
            onChange={(value) => setChosenRole((current) => ({ ...current, [request.id]: Number(value) }))}
            options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
            className="w-40"
          />
          <button type="button" onClick={() => void decide(request, 'approve')} aria-disabled={busy === request.id || !defaultRole || undefined} className={BUTTON}>
            <Check className="h-4 w-4" aria-hidden="true" />
            Approve
          </button>
          <div className={ROW_ACTIONS}>
            <button type="button" onClick={() => void decide(request, 'reject')} aria-disabled={busy === request.id || undefined} className={QUIET}>
              Reject
            </button>
          </div>
        </li>
      ))}
    </SettingsSection>
  );
}

// ── Invitations ───────────────────────────────────────────────────────

function InvitationsSection({ invitations, roles, emailRef }: { invitations: Invitation[]; roles: Role[]; emailRef: RefObject<HTMLInputElement | null> }) {
  const dispatch = useAppDispatch();
  const [cancelling, setCancelling] = useState<number | null>(null);
  // Read synchronously, so a double press sends one cancel.
  const cancellingIds = useRef(new Set<number>());
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusRef = usePendingFocus();
  const defaultRole = roles.find((r) => r.slug === 'csm') ?? roles[0];
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<number | ''>('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // A refusal that is not about the email (seats full, the role) sits in the section, not on the field.
  const [serverError, setServerError] = useState<string | null>(null);

  const effectiveRole = roleId === '' ? defaultRole?.id : roleId;

  async function cancel(invitation: Invitation) {
    if (cancellingIds.current.has(invitation.id)) return;
    cancellingIds.current.add(invitation.id);
    setCancelling(invitation.id);
    try {
      await dispatch(cancelInvitation(invitation.id)).unwrap();
      // The row is gone: the list, or Work email once none is pending.
      pendingFocusRef.current = () => (listRef.current ?? emailRef.current)?.focus();
    } catch {
      // The slice holds the refusal; the tab shows it above the sections.
    } finally {
      cancellingIds.current.delete(invitation.id);
      setCancelling(null);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    setServerError(null);
    setSent(null);
    if (!email.includes('@') || !effectiveRole) {
      setFormError('An email address and a role are needed.');
      return;
    }
    setSending(true);
    try {
      const invitation = await dispatch(sendInvitation({ email: email.trim(), roleId: effectiveRole })).unwrap();
      setSent(invitation.email);
      setEmail('');
    } catch (err) {
      setServerError(typeof err === 'string' ? err : 'Could not send that invitation.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <form onSubmit={handleInvite} noValidate aria-label="Invite someone">
        <SettingsSection look="card"
          title="Invitations"
          description="They sign in with the invited address and are let straight in with this role. Nothing to forward; open for seven days."
          footer={
            <>
              {/* Always mounted: the sent news is announced. */}
              <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
                {sent ? `Invitation sent to ${sent}.` : ''}
              </p>
              <button type="submit" aria-disabled={sending || undefined} aria-busy={sending || undefined} className={PRIMARY}>
                {sending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
                Send invitation
              </button>
            </>
          }
        >
          <SettingsRow label="Work email" htmlFor="invite-email" error={formError ?? undefined} errorId="invite-error">
            <input
              ref={emailRef}
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'invite-error' : undefined}
              className={`${INPUT} ${INVALID}`}
            />
          </SettingsRow>
          <SettingsRow label="Role" htmlFor="invite-role">
            <Select
              id="invite-role"
              label="Role"
              labelPosition="external"
              value={String(effectiveRole ?? '')}
              onChange={(value) => setRoleId(Number(value))}
              options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
              className="sm:max-w-xs"
            />
          </SettingsRow>
          {serverError ? (
            <p role="alert" className={`${FORM_ALERT} px-4 py-3`}>
              {serverError}
            </p>
          ) : null}
        </SettingsSection>
      </form>
      {invitations.length > 0 ? (
        <SettingsSection look="card" title="Pending invitations" list="Pending invitations" listRef={listRef}>
          {invitations.map((invitation) => (
            <li key={invitation.id} className="group relative flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <p title={invitation.email} className={`${TYPE.body} truncate font-semibold`}>
                  {invitation.email}
                </p>
                <p className={`${TYPE.meta} truncate`}>
                  <MetaParts parts={[invitation.role_name, invitation.invited_by_name ? `invited by ${invitation.invited_by_name}` : null, `expires ${formatDate(invitation.expires_at)}`]} />
                </p>
              </div>
              <div className={ROW_ACTIONS}>
                <button
                  type="button"
                  onClick={() => void cancel(invitation)}
                  aria-disabled={cancelling === invitation.id || undefined}
                  aria-label={`Cancel the invitation to ${invitation.email}`}
                  className={QUIET}
                >
                  Cancel
                </button>
              </div>
            </li>
          ))}
        </SettingsSection>
      ) : null}
    </>
  );
}

// ── Domains ───────────────────────────────────────────────────────────

function DomainsSection({ domains }: { domains: OrganisationDomain[] }) {
  const dispatch = useAppDispatch();
  const [domain, setDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<number | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (adding || !domain.trim()) return;
    setFormError(null);
    setAdding(true);
    try {
      await dispatch(addDomain(domain.trim())).unwrap();
      setDomain('');
    } catch (err) {
      setFormError(typeof err === 'string' ? err : 'Could not add that domain.');
    } finally {
      setAdding(false);
    }
  }

  async function handleVerify(record: OrganisationDomain) {
    if (verifying === record.id) return;
    setVerifying(record.id);
    setVerifyMessage((m) => ({ ...m, [record.id]: '' }));
    try {
      await dispatch(verifyDomain(record.id)).unwrap();
      setVerifyMessage((m) => ({ ...m, [record.id]: 'Verified. Sign-ins from this domain now come to you.' }));
    } catch (err) {
      setVerifyMessage((m) => ({ ...m, [record.id]: typeof err === 'string' ? err : 'Could not verify yet.' }));
    } finally {
      setVerifying(null);
    }
  }

  async function copyRecord(record: OrganisationDomain) {
    if (!record.dns_record) return;
    try {
      await navigator.clipboard.writeText(record.dns_record.value);
      setCopied(record.id);
      // "Copied" resets after a moment, so the next copy is news again.
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard access can be denied; the value is on screen regardless.
    }
  }

  return (
    <>
      <form onSubmit={handleAdd} noValidate aria-label="Add a domain">
        <SettingsSection look="card"
          title="Email domains"
          description="Prove a domain with a DNS record and anyone signing in with it is routed here to ask to join. Adding one proves nothing on its own."
          footer={
            <button type="submit" aria-disabled={adding || !domain.trim() || undefined} className={PRIMARY}>
              Add domain
            </button>
          }
        >
          <SettingsRow label="Domain" htmlFor="domain-name" error={formError ?? undefined} errorId="domain-error">
            <input
              id="domain-name"
              type="text"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="company.com"
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'domain-error' : undefined}
              className={`${INPUT} ${INVALID} ${CODE}`}
            />
          </SettingsRow>
        </SettingsSection>
      </form>
      {domains.length > 0 ? (
        <SettingsSection look="card" title="Domains" list="Domains">
          {domains.map((record) => (
            <li key={record.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className={`${TYPE.body} ${CODE} truncate font-semibold`}>{record.domain}</p>
                  <p className={TYPE.meta}>
                    {record.verification_status === 'verified'
                      ? `Verified ${formatDate(record.verified_at)}`
                      : record.verification_status === 'revoked'
                        ? 'Another organisation proved this domain'
                        : 'Not verified yet'}
                  </p>
                </div>
                {record.verification_status === 'verified' ? (
                  <Badge tone="success">Verified</Badge>
                ) : record.verification_status === 'revoked' ? (
                  <Badge tone="danger">Claimed elsewhere</Badge>
                ) : (
                  <button type="button" onClick={() => void handleVerify(record)} aria-disabled={verifying === record.id || undefined} aria-busy={verifying === record.id || undefined} className={BUTTON}>
                    {verifying === record.id ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
                    Check DNS
                  </button>
                )}
              </div>
              {record.dns_record ? (
                <div className={`flex flex-col gap-1.5 rounded-lg bg-subtle px-3 py-2 ${TYPE.meta}`}>
                  <p>
                    Publish this <span className={`${CODE} text-ink`}>TXT</span> record on <span className={`${CODE} text-ink`}>{record.dns_record.name}</span>:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className={`flex-1 break-all ${CODE} text-[11px] leading-4 text-ink`}>{record.dns_record.value}</code>
                    {/* The name is the visible word plus what it copies, so "Copied" is heard. */}
                    <button type="button" onClick={() => void copyRecord(record)} className={QUIET}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      {copied === record.id ? 'Copied' : 'Copy'} <span className="sr-only">record value</span>
                    </button>
                  </div>
                </div>
              ) : null}
              {/* Always mounted per row: the Check DNS answer is announced. */}
              <p role="status" className={`${TYPE.meta} empty:sr-only`}>
                {verifyMessage[record.id] ?? ''}
              </p>
            </li>
          ))}
        </SettingsSection>
      ) : null}
    </>
  );
}

export default AccessTab;
