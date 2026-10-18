import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Plus, Search, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { createOrganisation, fetchOrganisations } from '../../features/platform/platformSlice';

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-success-dim text-success',
  suspended: 'bg-danger-dim text-danger',
  pending: 'bg-warning-dim text-warning',
  archived: 'bg-subtle text-ink-muted',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS_STYLE[status] ?? 'bg-subtle text-ink-muted'}`}>
      {status}
    </span>
  );
}

export function PlatformOrganisations() {
  const dispatch = useAppDispatch();
  const { organisations, isLoading, error } = useAppSelector((state) => state.platform);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      dispatch(fetchOrganisations({ q: q.trim() || undefined, status: status || undefined }));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [dispatch, q, status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">Organisations</h1>
          <p className="text-[13px] text-ink-muted mt-1">Every tenant: who owns it, who is in it, what it has claimed.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="rv-pill-primary">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          New organisation
        </button>
      </div>

      {creating && <NewOrganisationModal onClose={() => setCreating(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[240px]">
          <span className="sr-only">Search organisations</span>
          <Search className="w-3.5 h-3.5 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or domain"
            className="rv-input pl-8 text-[12.5px]"
          />
        </label>
        <label className="sr-only" htmlFor="platform-status">
          Status
        </label>
        <select
          id="platform-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rv-input w-auto text-[12.5px]"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 text-[12px] text-danger p-3 bg-danger-dim rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="rv-card overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-[0.08em] text-ink-faint text-left">
            <tr className="border-b border-line-subtle">
              <th className="px-4 py-2.5 font-semibold">Organisation</th>
              <th className="px-4 py-2.5 font-semibold">Owner</th>
              <th className="px-4 py-2.5 font-semibold">Domains</th>
              <th className="px-4 py-2.5 font-semibold text-right">Members</th>
              <th className="px-4 py-2.5 font-semibold text-right">Waiting</th>
              <th className="px-4 py-2.5 font-semibold text-right">Gmail</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {organisations.map((org) => (
              <tr key={org.id} className="hover:bg-subtle/60">
                <td className="px-4 py-2.5">
                  <Link to={`/platform/organisations/${org.id}`} className="font-semibold text-ink hover:underline">
                    {org.name}
                  </Link>
                  <div className="text-[11px] text-ink-faint">{org.slug}</div>
                </td>
                <td className="px-4 py-2.5 text-ink-muted">
                  {org.owner ? (
                    <>
                      <div className="text-ink">{org.owner.name}</div>
                      <div className="text-[11px]">{org.owner.email}</div>
                    </>
                  ) : (
                    <span className="text-warning">No owner</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-muted">
                  {org.domains.length === 0
                    ? '—'
                    : org.domains.map((d) => (
                        <span key={d.domain} className="inline-flex items-center gap-1 mr-2">
                          {d.domain}
                          <span className={`w-1.5 h-1.5 rounded-full ${d.verification_status === 'verified' ? 'bg-success' : 'bg-warning'}`} aria-label={d.verification_status} />
                        </span>
                      ))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{org.members_active}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{org.pending_requests}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                  {org.gmail.enabled ? `${org.gmail.connected}${org.gmail.paused > 0 ? ` (${org.gmail.paused} paused)` : ''}` : 'Off'}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={org.status} />
                </td>
              </tr>
            ))}
            {!isLoading && organisations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                  Nothing matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PlatformOrganisations;

/**
 * Creating a tenant creates its root user with it: the owner, holding the
 * Admin role, with no password. They sign in with Google or Microsoft on
 * that address, or set a password from the reset email where mail is set
 * up. The modal says which of those happened.
 */
function NewOrganisationModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !ownerEmail.includes('@')) {
      setError('A name and the owner’s email address are needed.');
      return;
    }
    setBusy(true);
    try {
      const created = await dispatch(
        createOrganisation({ name: name.trim(), ownerEmail: ownerEmail.trim(), ownerName: ownerName.trim() })
      ).unwrap();
      navigate(`/platform/organisations/${created.id}`, {
        state: { ownerMailed: created.owner_mailed, ownerEmail: created.owner?.email },
      });
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not create the organisation.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-labelledby="new-org-heading">
      <form onSubmit={submit} noValidate className="rv-card w-full max-w-md p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="new-org-heading" className="text-[15px] font-semibold text-ink">New organisation</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              The owner becomes its root user: an Admin who can bring everyone else in.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink p-1">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-danger bg-danger-dim rounded-lg p-2.5">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="new-org-name" className="text-[11.5px] text-ink-muted">Organisation name</label>
          <input id="new-org-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="rv-input text-[13px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-org-owner-email" className="text-[11.5px] text-ink-muted">Owner’s work email</label>
          <input id="new-org-owner-email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="rv-input text-[13px]" placeholder="owner@company.com" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-org-owner-name" className="text-[11.5px] text-ink-muted">Owner’s name (optional)</label>
          <input id="new-org-owner-name" type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="rv-input text-[13px]" />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
          <button type="button" onClick={onClose} className="rv-pill-secondary">Cancel</button>
          <button type="submit" disabled={busy} className="rv-pill-primary disabled:opacity-40">
            Create organisation
          </button>
        </div>
      </form>
    </div>
  );
}
