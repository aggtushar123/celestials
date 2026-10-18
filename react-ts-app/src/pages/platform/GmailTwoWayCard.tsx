// The pilot switch for two-way Gmail (contract §1): staff turn it on for a
// workspace whose people are on the Google Cloud test-user list. A reason
// is required and lands on the tenant's own audit trail. Turning it off
// pauses every Google mailbox in the workspace within a minute; nothing is
// deleted. Counts only: no address, no mail.

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchOverview, setGmailTwoWay, type PlatformGmail } from '../../features/platform/platformSlice';
import { Card, CardHeader, DANGER, INPUT, NUM, PRIMARY, TYPE } from '../../components/ui';

const FACT = 'flex items-baseline justify-between gap-3 py-2';

export function GmailTwoWayCard({ organisationId, gmail }: { organisationId: number; gmail: PlatformGmail }) {
  const dispatch = useAppDispatch();
  const cap = useAppSelector((state) => state.platform.overview?.gmail ?? null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    dispatch(fetchOverview());
  }, [dispatch]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch(setGmailTwoWay({ id: organisationId, enabled: !gmail.enabled, reason: reason.trim() })).unwrap();
      setReason('');
      dispatch(fetchOverview());
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card pad="none" aria-labelledby={`${ids}-title`}>
      <CardHeader id={`${ids}-title`} title="Google two-way mail" meta={gmail.enabled ? 'On' : 'Off'} />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className={TYPE.bodyMuted}>
          {gmail.enabled
            ? 'People here with a seat can connect a Google account on a verified domain. Turning it off pauses every Google mailbox in this workspace within a minute; nothing is deleted.'
            : "People here can't connect Gmail. Turn it on once Google lets their accounts in: the app trusted in their Workspace Admin console, or each person on the Google Cloud test-user list."}
        </p>
        <dl className="divide-y divide-line-subtle border-y border-line-subtle">
          <div className={FACT}>
            <dt className={TYPE.bodyMuted}>Connected here</dt>
            <dd className={TYPE.body}>
              <span className={NUM}>{gmail.connected}</span>
              {gmail.paused > 0 ? (
                <>
                  {' '}
                  (<span className={NUM}>{gmail.paused}</span> paused)
                </>
              ) : null}
            </dd>
          </div>
          {cap ? (
            <div className={FACT}>
              <dt className={TYPE.bodyMuted}>Google test users, all workspaces</dt>
              <dd className={TYPE.body}>
                <span className={NUM}>{cap.connected}</span> of <span className={NUM}>{cap.test_user_cap}</span>
              </dd>
            </div>
          ) : null}
        </dl>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={`${ids}-reason`} className={TYPE.label}>
              Reason for turning it {gmail.enabled ? 'off' : 'on'}
            </label>
            <input
              id={`${ids}-reason`}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={error ? `${ids}-error` : undefined}
              className={INPUT}
            />
          </div>
          <button type="submit" disabled={busy || !reason.trim()} className={gmail.enabled ? DANGER : PRIMARY}>
            {busy ? 'Saving…' : gmail.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </form>
        {error ? (
          <p id={`${ids}-error`} role="alert" className="text-[13px] leading-5 text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
