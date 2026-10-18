import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { connectImap, disconnectMailbox, fetchMailbox, startOAuth, syncMailbox, type MailboxConnection } from '../../features/mail/mailSlice';
import {
  DISCONNECT_GOOGLE,
  DISCONNECT_OTHER,
  GATE_COPY,
  disconnectedLine,
  importLine,
  pausedLine,
  pushText,
  reconnectBanner,
  refusalCopy,
  twoWayText,
} from '../../features/mail/mailText';
import { useMailboxPolling } from '../../features/mail/useMailboxPolling';
import { GMAIL } from '../../features/connectors/connectionsText';
import { fetchCalendarStatus, type CalendarStatus } from '../../features/calendar/calendarApi';
import { formatDate } from '../../features/customers/formatters';
import { Figured } from '../brain/Figured';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { MailboxSignature } from './MailboxSignature';
import { AgentConsent } from './AgentConsent';
import { ConnectionRow } from './ConnectionRow';
import { PROVIDER_LOGOS } from './providerLogos';
import { BUTTON, FORM_ALERT, FORM_OK, INPUT, PRIMARY, QUIET, SettingsNote, TYPE } from '../ui';

const GMAIL_HOSTS = { imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587 };
const APP_PASSWORDS_URL = 'https://myaccount.google.com/apppasswords';
const FACT = 'grid gap-1 py-2 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-baseline';

const OTHER_FIELDS = [
  { key: 'imap_host', label: 'IMAP host', placeholder: 'imap.company.com' },
  { key: 'imap_port', label: 'IMAP port', placeholder: '993' },
  { key: 'smtp_host', label: 'SMTP host', placeholder: 'smtp.company.com' },
  { key: 'smtp_port', label: 'SMTP port', placeholder: '587' },
] as const;

function statusOf(c: MailboxConnection): { text: string; danger: boolean } {
  if (c.status === 'error') return { text: `Needs attention: ${c.error}`, danger: true };
  const paused = pausedLine(c.paused_reason);
  if (paused) return { text: paused, danger: false };
  return { text: c.error || 'Connected', danger: false };
}

/**
 * "Your accounts › Gmail" (spec 2026-10-16 §3, Gmail). An app password over
 * IMAP/SMTP is the main path; when the workspace is cleared for two-way
 * Gmail (portal switch and a verified domain) Google sign-in is offered
 * first and the app password moves to the menu. A Google mailbox keeps its
 * two-way facts (import, push, pauses) under the row. Only the person reads
 * the mail, until they add a conversation to Revenact.
 */
export function GmailAccountRow() {
  const dispatch = useAppDispatch();
  const { connection, disconnected, providers, loaded, saving, error, syncQueued } = useAppSelector((s) => s.mail);
  const [form, setForm] = useState<null | 'gmail' | 'other'>(null);
  const [fields, setFields] = useState({ address: '', password: '', imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587' });
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null);
  const { search } = useLocation();
  useMailboxPolling({ whileImporting: true });

  useEffect(() => {
    dispatch(fetchMailbox());
  }, [dispatch]);

  // Calendar rides the Google connection (Calendar delivery 2). No answer
  // (a backend without Calendar) means no Calendar line at all.
  const googleConnected = connection?.provider === 'google';
  useEffect(() => {
    if (!googleConnected) return;
    let live = true;
    fetchCalendarStatus()
      .then((status) => live && setCalendar(status))
      .catch(() => live && setCalendar(null));
    return () => {
      live = false;
    };
  }, [googleConnected]);

  const query = new URLSearchParams(search);
  const outcome = query.get('mailbox');
  const googleOption = providers.find((p) => p.key === 'google' && p.uses_oauth);
  const google = googleOption && !googleOption.gate ? googleOption : null;
  const imapAvailable = providers.some((p) => p.key === 'imap');

  async function signInWithGoogle() {
    // One OAuth start at a time: each answer sets the cookie the callback checks.
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    const result = await dispatch(startOAuth('google'));
    if (startOAuth.fulfilled.match(result)) {
      window.location.assign(result.payload.authorize_url);
      return;
    }
    startingRef.current = false;
    setStarting(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const hosts =
      form === 'gmail'
        ? GMAIL_HOSTS
        : { imap_host: fields.imap_host.trim(), imap_port: Number(fields.imap_port) || 993, smtp_host: fields.smtp_host.trim(), smtp_port: Number(fields.smtp_port) || 587 };
    const result = await dispatch(connectImap({ address: fields.address.trim(), password: fields.password, ...hosts }));
    // The password never outlives the attempt.
    setFields((f) => ({ ...f, password: '' }));
    if (connectImap.fulfilled.match(result)) setForm(null);
  }

  async function disconnect() {
    const result = await dispatch(disconnectMailbox());
    if (disconnectMailbox.rejected.match(result)) throw result.payload ?? 'Could not disconnect.';
    await dispatch(fetchMailbox());
  }

  const row = { id: 'gmail', logo: PROVIDER_LOGOS.gmail, name: GMAIL.NAME, desc: GMAIL.DESC };
  if (!loaded) return <ConnectionRow {...row} state="Loading…" />;

  const failure =
    outcome === 'refused'
      ? refusalCopy(query.get('code'), query.get('detail'))
      : outcome === 'error'
        ? `Could not connect: ${query.get('detail') || 'the provider refused.'}`
        : null;
  const notices =
    outcome === 'connected' || failure || error ? (
      <>
        {outcome === 'connected' ? (
          <p className={FORM_OK}>
            {GMAIL.CONNECTED}
          </p>
        ) : null}
        {failure ? (
          <p role="alert" className={FORM_ALERT}>
            {failure}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className={FORM_ALERT}>
            {error}
          </p>
        ) : null}
      </>
    ) : null;

  if (connection) {
    const status = statusOf(connection);
    const isGoogle = connection.provider === 'google';
    const banner = isGoogle ? reconnectBanner(connection) : null;
    const busySync = saving || syncQueued;
    const syncBlocked = busySync || Boolean(connection.paused_reason);
    const synced = connection.last_synced_at ? `synced ${formatDate(connection.last_synced_at.slice(0, 10))}` : 'not synced yet';
    return (
      <ConnectionRow
        {...row}
        state={`${connection.address} · ${synced}`}
        stateTone={status.danger ? 'danger' : 'neutral'}
        action={
          <button
            type="button"
            onClick={() => {
              if (!syncBlocked) void dispatch(syncMailbox());
            }}
            aria-disabled={syncBlocked || undefined}
            className={BUTTON}
          >
            <RefreshCw className={`h-4 w-4 ${busySync ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
            {busySync ? GMAIL.SYNCING : GMAIL.SYNC}
          </button>
        }
        menu={[
          ...(isGoogle && !banner ? [{ key: 'reconnect', label: GMAIL.RECONNECT, onSelect: () => void signInWithGoogle() }] : []),
          { key: 'disconnect', label: GMAIL.DISCONNECT, onSelect: () => setConfirming(true), danger: true },
        ]}
      >
        <div className="flex flex-col gap-3">
          {notices}
          {banner ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SettingsNote icon="warning">{banner}</SettingsNote>
              <button type="button" onClick={() => void signInWithGoogle()} aria-disabled={starting || undefined} className={PRIMARY}>
                Reconnect Google
              </button>
            </div>
          ) : null}
          <dl className="divide-y divide-line-subtle">
            <div className={FACT}>
              <dt className={TYPE.label}>Status</dt>
              <dd className={status.danger ? FORM_ALERT : TYPE.body}>{status.text}</dd>
            </div>
            <div className={FACT}>
              <dt className={TYPE.label}>Connected as</dt>
              <dd className={TYPE.body}>{connection.provider_display}</dd>
            </div>
            {isGoogle ? (
              <>
                <div className={FACT}>
                  <dt className={TYPE.label}>Two-way</dt>
                  <dd className={TYPE.body}>{twoWayText(connection.two_way)}</dd>
                </div>
                <div className={FACT}>
                  <dt className={TYPE.label}>Push</dt>
                  <dd className={TYPE.body}>{pushText(connection.push)}</dd>
                </div>
                <div className={FACT}>
                  <dt className={TYPE.label}>Email agent</dt>
                  <dd>
                    <AgentConsent on={Boolean(connection.agent_reads_mail)} />
                  </dd>
                </div>
                {calendar ? (
                  <div className={FACT}>
                    <dt className={TYPE.label}>Calendar</dt>
                    <dd className={`${TYPE.body} flex flex-wrap items-center gap-3`}>
                      {calendar.calendar === 'connected' ? (
                        `Connected · ${calendar.last_synced_at ? `synced ${formatDate(calendar.last_synced_at.slice(0, 10))}` : 'not synced yet'}`
                      ) : (
                        <>
                          <span>Not added: meetings won't show in Revenact.</span>
                          <button type="button" onClick={() => void signInWithGoogle()} aria-disabled={starting || undefined} className={BUTTON}>
                            Add Calendar
                          </button>
                        </>
                      )}
                    </dd>
                  </div>
                ) : null}
              </>
            ) : null}
            {isGoogle && connection.import ? (
              <div className={FACT}>
                <dt className={TYPE.label}>Import</dt>
                <dd className={TYPE.body}>
                  <Figured text={importLine(connection.import) ?? ''} />
                </dd>
              </div>
            ) : null}
          </dl>
          <MailboxSignature connection={connection} />
        </div>
        {confirming ? (
          <ConfirmDialog
            title={`Disconnect ${connection.address}?`}
            message={isGoogle ? DISCONNECT_GOOGLE : DISCONNECT_OTHER}
            confirmLabel={GMAIL.DISCONNECT}
            danger
            onConfirm={disconnect}
            onClose={() => setConfirming(false)}
          />
        ) : null}
      </ConnectionRow>
    );
  }

  const close = () => {
    setForm(null);
    setFields((f) => ({ ...f, password: '' }));
  };
  const action = google ? (
    <button type="button" onClick={() => void signInWithGoogle()} aria-disabled={starting || undefined} className={PRIMARY}>
      Connect {google.label}
    </button>
  ) : imapAvailable && form === null ? (
    <button type="button" onClick={() => setForm('gmail')} className={PRIMARY}>
      {GMAIL.CONNECT}
    </button>
  ) : null;
  const menu = imapAvailable
    ? [
        ...(google ? [{ key: 'app-password', label: GMAIL.USE_APP_PASSWORD, onSelect: () => setForm('gmail') }] : []),
        { key: 'other', label: GMAIL.OTHER_PROVIDER, onSelect: () => setForm('other') },
      ]
    : [];
  const gateNote = googleOption?.gate ? GATE_COPY[googleOption.gate] : null;
  const showBody = notices || form || disconnected;

  return (
    <ConnectionRow {...row} state={GMAIL.NOT_CONNECTED} action={action} menu={menu}>
      {showBody ? (
        <div className="flex flex-col gap-3">
          {notices}
          {disconnected && !form ? (
            <p className={TYPE.bodyMuted}>
              <Figured text={disconnectedLine(disconnected)} />
            </p>
          ) : null}
          {form ? (
            <form onSubmit={submit} aria-label={form === 'gmail' ? GMAIL.CONNECT : GMAIL.OTHER_PROVIDER} className="flex flex-col gap-3">
              {form === 'gmail' ? (
                <p className={TYPE.meta}>
                  {GMAIL.APP_PASSWORD_HELP}{' '}
                  <a href={APP_PASSWORDS_URL} target="_blank" rel="noreferrer" className="underline">
                    {GMAIL.APP_PASSWORD_LINK}
                  </a>
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="gmail-address" className={TYPE.label}>
                    {form === 'gmail' ? GMAIL.ADDRESS : 'Email address'}
                  </label>
                  <input
                    id="gmail-address"
                    type="email"
                    autoComplete="off"
                    required
                    autoFocus
                    value={fields.address}
                    onChange={(e) => setFields({ ...fields, address: e.target.value })}
                    placeholder={form === 'gmail' ? 'you@gmail.com' : 'you@company.com'}
                    className={INPUT}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="gmail-password" className={TYPE.label}>
                    {form === 'gmail' ? GMAIL.APP_PASSWORD : 'Password or app password'}
                  </label>
                  <input
                    id="gmail-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={fields.password}
                    onChange={(e) => setFields({ ...fields, password: e.target.value })}
                    className={INPUT}
                  />
                </div>
                {form === 'other'
                  ? OTHER_FIELDS.map((field) => (
                      <div key={field.key} className="flex min-w-0 flex-col gap-1.5">
                        <label htmlFor={`imap-${field.key}`} className={TYPE.label}>
                          {field.label}
                        </label>
                        <input
                          id={`imap-${field.key}`}
                          type="text"
                          autoComplete="off"
                          required={field.key.endsWith('_host')}
                          inputMode={field.key.endsWith('_port') ? 'numeric' : undefined}
                          value={fields[field.key]}
                          onChange={(e) => setFields({ ...fields, [field.key]: e.target.value })}
                          placeholder={field.placeholder}
                          className={INPUT}
                        />
                      </div>
                    ))
                  : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={close} className={QUIET}>
                  {GMAIL.CANCEL}
                </button>
                <button type="submit" aria-disabled={saving || undefined} className={PRIMARY}>
                  {saving ? GMAIL.CHECKING : 'Connect'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : gateNote && !google ? (
        <p className={TYPE.meta}>{gateNote} Until then, connect with an app password.</p>
      ) : null}
    </ConnectionRow>
  );
}
