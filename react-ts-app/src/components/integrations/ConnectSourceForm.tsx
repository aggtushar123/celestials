import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { BUTTON, CODE, FOCUS, FORM_ALERT, INPUT, PRIMARY, QUIET, TYPE } from '../ui';
import { connectConnector, startConnectorOAuth, type Connector, type ConnectResult } from '../../features/connectors/connectorsSlice';
import { HOST_FIELDS, hostOnly } from '../../features/connectors/connectorForm';

/**
 * Hand a ticket source its credentials. The form is whatever the backend
 * says the provider needs (`connector.setup.fields`); secrets go straight
 * to the backend and never into the store. The webhook provider has no
 * form: connecting mints a secret, shown here once.
 *
 * A refusal ("...is not a valid atlassian.net tenant.") shows beside the
 * buttons, under the fields, and takes focus so it cannot be missed. A
 * pasted full URL in a site field keeps just its host.
 */
export function ConnectSourceForm({ connector, onDone }: { connector: Connector; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const saving = useAppSelector((s) => s.connectors.saving);
  const setup = connector.setup;
  const [form, setForm] = useState<Record<string, string>>({});
  const [minted, setMinted] = useState<ConnectResult | null>(null);
  const [copied, setCopied] = useState(false);
  // Text only, never the secret: the one region that announces this form's news.
  const [news, setNews] = useState('');
  const [refused, setRefused] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const refusedRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  // The secret is shown: start reading at its heading.
  useEffect(() => {
    if (minted) headingRef.current?.focus();
  }, [minted]);
  // A refusal takes focus, so a keyboard or screen reader user lands on it.
  useEffect(() => {
    if (refused) refusedRef.current?.focus();
  }, [refused]);

  if (!setup) return null;

  /** The form as sent: a site field keeps just its host. */
  const cleaned = () => Object.fromEntries(Object.entries(form).map(([key, value]) => [key, HOST_FIELDS.includes(key) ? hostOnly(value) : value]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setRefused(null);
    const result = await dispatch(connectConnector({ id: connector.id, form: cleaned() }));
    if (!connectConnector.fulfilled.match(result)) {
      setRefused(`Could not connect: ${result.payload ?? 'the provider refused.'}`);
      return;
    }
    if (result.payload.token) {
      setMinted(result.payload);
      setNews('Secret generated. It is shown once.');
    } else onDone();
  }

  async function signIn() {
    setRefused(null);
    // The sign-in skips the form's submit, so ask for its required fields here
    // (Slack's channel): without them the provider's answer can only be refused.
    if (formRef.current && !formRef.current.reportValidity()) return;
    const result = await dispatch(startConnectorOAuth({ id: connector.id, form: cleaned() }));
    if (startConnectorOAuth.fulfilled.match(result)) window.location.assign(result.payload.authorize_url);
    else setRefused(result.payload ?? 'Could not start the sign-in.');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setNews('Copied.');
      // "Copied" resets after a moment, so the next copy is news again.
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
        setNews('');
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  // Always mounted across the form and the secret, so the same node announces.
  const status = (
    <p role="status" className="sr-only">
      {news}
    </p>
  );

  if (minted) {
    return (
      <>
        {status}
        <div className="flex flex-col gap-2">
          <h3 ref={headingRef} tabIndex={-1} className={`${TYPE.body} font-semibold ${FOCUS}`}>
            Your system posts tickets to:
          </h3>
          <code className={`select-all break-all rounded-lg bg-subtle px-3 py-2 ${TYPE.body} ${CODE}`}>{minted.inbound_url}</code>
          <p className={`${TYPE.body} font-semibold`}>
            with the header <code className={CODE}>X-Revenact-Token</code> set to this secret. It is shown once:
          </p>
          <div className="flex items-center gap-2">
            <code aria-label="Webhook secret" className={`flex-1 select-all break-all rounded-lg bg-subtle px-3 py-2 ${TYPE.body} ${CODE}`}>
              {minted.token}
            </code>
            <button type="button" onClick={() => void copy(minted.token ?? '')} className={BUTTON}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy secret'}
            </button>
          </div>
          <p className={TYPE.meta}>
            Send one ticket object or <code className={CODE}>{'{"tickets": [...]}'}</code> with external_id, title and optionally description, status, priority, requester_email, requester_name, assignee_name, url, opened_at, resolved_at.
          </p>
          <button type="button" onClick={onDone} className={`self-start ${BUTTON}`}>
            Done
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {status}
      <form ref={formRef} onSubmit={submit} aria-label={`Connect ${connector.name}`} className="flex flex-col gap-3">
        {setup.fields.map((field, index) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={`${connector.id}-${field.name}`} className={TYPE.label}>
              {field.label}
              {field.required ? null : <span className={`font-normal ${TYPE.meta}`}> (optional)</span>}
            </label>
            <input
              id={`${connector.id}-${field.name}`}
              type={field.secret ? 'password' : 'text'}
              autoComplete={field.secret ? 'new-password' : 'off'}
              autoFocus={index === 0}
              required={field.required && !(setup.uses_oauth && field.secret)}
              value={form[field.name] ?? ''}
              onChange={(event) => {
                setForm({ ...form, [field.name]: event.target.value });
                setRefused(null);
              }}
              onBlur={HOST_FIELDS.includes(field.name) ? (event) => setForm({ ...form, [field.name]: hostOnly(event.target.value) }) : undefined}
              placeholder={field.placeholder}
              className={INPUT}
            />
          </div>
        ))}
        {setup.help ? <p className={TYPE.meta}>{setup.help}</p> : null}
        {refused ? (
          <p ref={refusedRef} tabIndex={-1} role="alert" className={`${FORM_ALERT} ${FOCUS}`}>
            {refused}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onDone} className={QUIET}>
            Cancel
          </button>
          {setup.uses_oauth ? (
            <button type="button" onClick={() => void signIn()} disabled={saving} className={BUTTON}>
              Sign in with {setup.label}
            </button>
          ) : null}
          <button type="submit" aria-disabled={saving || undefined} className={PRIMARY}>
            {saving ? 'Checking…' : setup.fields.length ? 'Connect' : 'Generate secret'}
          </button>
        </div>
      </form>
    </>
  );
}
