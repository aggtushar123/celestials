// Staff verify a domain that cannot carry a DNS record, such as a
// Google-owned *.onworkspace.com Workspace domain. Ownership is checked out
// of band; the reason lands on the tenant's own audit trail. The backend
// refuses personal domains and any domain another workspace proved in DNS.

import { useId, useState, type FormEvent } from 'react';
import { useAppDispatch } from '../../hooks';
import { verifyDomain } from '../../features/platform/platformSlice';
import { INPUT, PRIMARY, TYPE } from '../../components/ui';

export function DomainVerifyForm({ organisationId, domainId, domain }: { organisationId: number; domainId: number; domain: string }) {
  const dispatch = useAppDispatch();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch(verifyDomain({ id: organisationId, domainId, reason: reason.trim() })).unwrap();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <label htmlFor={`${ids}-reason`} className={TYPE.label}>
        Why {domain} is theirs
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`${ids}-reason`}
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby={error ? `${ids}-error` : undefined}
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button type="submit" disabled={busy || !reason.trim()} aria-label={`Verify ${domain}`} className={PRIMARY}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </div>
      {error ? (
        <p id={`${ids}-error`} role="alert" className={TYPE.meta}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
