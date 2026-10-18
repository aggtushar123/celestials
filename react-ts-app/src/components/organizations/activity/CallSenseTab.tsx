import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Phone, Plus, Clock, Link2, FileText, Sparkles, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { clearCalls, fetchCalls, logCall, type Call, type LogCallInput } from '../../../features/calls/callsSlice';
import { durationLabel } from '../../../features/calls/callFormat';
import { downloadAttachment, type FileParent } from '../../../features/files/filesSlice';
import type { Contact } from '../../../features/customers/customersSlice';
import { apiFetch } from '../../../lib/apiClient';
import { formatDate, initials } from '../../../features/customers/formatters';
import { FOCUS, PRIMARY } from '../portfolio/styles';
import { Field } from './FormField';
import { CONTROL, FILE_CONTROL, FORM_ERROR, FORM_GRID } from './formStyles';

/**
 * CallSense: the calls that happened with this organisation or account,
 * on the real Call records. A call is logged here with a summary, or with
 * a transcript (pasted, or a .txt/.vtt/.srt file from the recorder) that
 * the model summarises; either way it is classified for sentiment and
 * counts toward the Account Pulse. Calls that arrive through a recorder
 * connector show up in the same list.
 */

const SENTIMENT: Record<string, { label: string; cls: string }> = {
  positive: { label: 'Positive', cls: 'bg-success-dim text-success border-success/30' },
  neutral: { label: 'Neutral', cls: 'bg-subtle text-ink-muted border-line' },
  negative: { label: 'Negative', cls: 'bg-danger-dim text-danger border-danger/30' },
};

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** The log-a-call form on its own, so the organization page's "+ Add" can
 *  show it in a sheet. It clears itself and calls `onDone` once logged. */
export function CallForm({
  onLog,
  saving,
  error,
  contacts,
  onDone,
}: {
  onLog: (input: LogCallInput) => Promise<boolean>;
  saving: boolean;
  error: string | null;
  /** This company's contacts, offered as participants. */
  contacts: Contact[];
  onDone?: () => void;
}) {
  const [participants, setParticipants] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [host, setHost] = useState('');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('');
  const [summary, setSummary] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !when) return;
    const file = fileInput.current?.files?.[0] ?? null;
    const ok = await onLog({
      title: title.trim(),
      host_name: host.trim() || undefined,
      occurred_at: new Date(when).toISOString(),
      duration_minutes: duration ? Number(duration) : null,
      summary: summary.trim() || undefined,
      recording_url: recordingUrl.trim() || undefined,
      transcript_text: transcriptText.trim() || undefined,
      transcriptFile: file,
      participant_ids: participants.length ? participants : undefined,
    });
    if (ok) {
      setTitle(''); setHost(''); setWhen(''); setDuration(''); setSummary(''); setTranscriptText(''); setRecordingUrl(''); setParticipants([]);
      if (fileInput.current) fileInput.current.value = '';
      onDone?.();
    }
  }

  return (
    <form onSubmit={submit} aria-label="Log a call" className="@container flex flex-col gap-3">
      <div className={FORM_GRID}>
        <Field id={`${ids}-title`} label="Call title" wide>
          <input id={`${ids}-title`} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Renewal readiness check-in" className={CONTROL} />
        </Field>
        <Field id={`${ids}-host`} label="Host" hint="You, when left blank.">
          <input id={`${ids}-host`} value={host} onChange={(e) => setHost(e.target.value)} className={CONTROL} />
        </Field>
        <Field id={`${ids}-when`} label="When">
          <input id={`${ids}-when`} required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={CONTROL} />
        </Field>
        <Field id={`${ids}-duration`} label="Duration in minutes">
          <input id={`${ids}-duration`} type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className={`${CONTROL} font-mono-brand tabular-nums`} />
        </Field>
        <Field id={`${ids}-recording`} label="Recording link" hint="Optional.">
          <input id={`${ids}-recording`} value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} className={CONTROL} />
        </Field>
        <Field id={`${ids}-summary`} label="Summary" hint="Leave blank to have it written from the transcript." wide>
          <textarea id={`${ids}-summary`} value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={`${CONTROL} resize-y`} />
        </Field>
        <Field id={`${ids}-transcript`} label="Transcript" hint="Paste it, or upload the file below." wide>
          <textarea id={`${ids}-transcript`} value={transcriptText} onChange={(e) => setTranscriptText(e.target.value)} rows={3} className={`${CONTROL} resize-y`} />
        </Field>
        <Field id={`${ids}-file`} label="Transcript file" hint="A .txt, .vtt, .srt or .md file from the recorder." wide>
          <input id={`${ids}-file`} ref={fileInput} type="file" accept=".txt,.vtt,.srt,.md" className={FILE_CONTROL} />
        </Field>
        {contacts.length > 0 && (
          <fieldset className="flex min-w-0 flex-col gap-1 @xl:col-span-2" aria-label="Who was on the call">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Who was on the call</legend>
            <div className="flex flex-wrap gap-2">
              {contacts.map((c) => {
                const on = participants.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setParticipants((p) => (on ? p.filter((id) => id !== c.id) : [...p, c.id]))}
                    className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold sm:min-h-9 ${FOCUS} ${on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink hover:bg-subtle active:bg-line-subtle'}`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-muted">Their sentiment is read from this call. Anyone the transcript names is added too.</p>
          </fieldset>
        )}
      </div>
      <div>
        <button type="submit" disabled={saving} className={PRIMARY}>
          {saving ? 'Logging…' : 'Log call'}
        </button>
      </div>
      {error && <p className={FORM_ERROR} role="alert">{error}</p>}
    </form>
  );
}

function LogCallForm({
  onLog,
  saving,
  error,
  contacts,
}: {
  onLog: (input: LogCallInput) => Promise<boolean>;
  saving: boolean;
  error: string | null;
  contacts: Contact[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-6 py-3 border-b border-line-subtle flex flex-col gap-2 bg-surface shrink-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-faint">Log a call with its summary, or hand over the transcript and the summary is written for you. Every call is read for sentiment and counts toward the pulse.</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[13px] font-bold shrink-0">
          <Plus className="w-3.5 h-3.5" /> {open ? 'Cancel' : 'Log a call'}
        </button>
      </div>
      {open && <CallForm onLog={onLog} saving={saving} error={error} contacts={contacts} onDone={() => setOpen(false)} />}
    </div>
  );
}

function CallCard({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false);
  const sentiment = call.sentiment ? SENTIMENT[call.sentiment] : null;
  const source = call.connector_name ? `via ${call.connector_name}` : call.logged_by ? `logged by ${call.logged_by.name}` : '';
  return (
    <article className="relative flex items-start gap-5 z-10">
      <div className="w-[24px] h-[24px] rounded-md bg-subtle border border-accent/30 text-accent flex items-center justify-center shrink-0 mt-5 relative z-10 shadow-sm">
        <Phone className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 bg-surface border border-line/80 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-[22px] h-[22px] rounded-full bg-info-dim text-info flex items-center justify-center text-[11px] font-bold shrink-0">{initials(call.host_name)}</div>
            <span className="text-[13px] font-bold text-ink-muted truncate">{call.host_name}</span>
            {source && <span className="text-[11px] text-ink-faint truncate">· {source}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sentiment && <span className={`px-2 py-px rounded-full border text-[11px] font-bold ${sentiment.cls}`}>{sentiment.label}</span>}
            {call.duration_minutes !== null && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted"><Clock className="w-3 h-3" /> {durationLabel(call.duration_minutes)}</span>
            )}
            <span className="text-[13px] font-bold text-ink-muted">{timeOf(call.occurred_at)}</span>
          </div>
        </div>
        <h4 className="text-[15px] font-extrabold text-ink mb-2 leading-snug">{call.title}</h4>
        {call.participants.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[11px]" aria-label="Participants">
            <Users className="w-3 h-3 text-ink-faint" />
            {call.participants.map((p) => (
              <span key={p.id} className="px-1.5 py-px rounded-full bg-subtle border border-line text-ink-muted font-semibold" title={p.role_display}>
                {p.name}
              </span>
            ))}
          </div>
        )}
        {call.summary ? (
          <div>
            <p className={`text-[13px] text-ink-muted whitespace-pre-line ${expanded ? '' : 'line-clamp-3'}`}>{call.summary}</p>
            {call.summary.length > 220 && (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 flex items-center gap-1 text-[11px] font-bold text-accent">
                {expanded ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> More</>}
              </button>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-ink-faint italic">No summary yet.</p>
        )}
        {(call.ai_area || call.transcript || call.recording_url) && (
          <div className="flex items-center gap-3 mt-3 flex-wrap text-[11px] font-semibold">
            {call.ai_area && <span className="flex items-center gap-1 text-ink-faint"><Sparkles className="w-3 h-3" /> {call.ai_category || call.ai_area}</span>}
            {call.transcript && (
              <button type="button" onClick={() => void downloadAttachment(call.transcript!)} className="flex items-center gap-1 text-accent hover:underline">
                <FileText className="w-3 h-3" /> Transcript
              </button>
            )}
            {call.recording_url && (
              <a href={call.recording_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                <Link2 className="w-3 h-3" /> Recording
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export interface CallSenseTabProps {
  entityType: 'organization' | 'account';
  entityId: number | string;
  customerId?: number;
  /** A change reads the calls again (a call logged elsewhere on the page). */
  version?: number;
  /** Inside a page that scrolls on its own (the organization page): the
   *  list grows with its calls instead of scrolling inside itself. Off by
   *  default, so the account page's feed keeps its own scroll. */
  embedded?: boolean;
}

export function CallSenseTab({ entityType, entityId, customerId, version = 0, embedded = false }: CallSenseTabProps) {
  const dispatch = useAppDispatch();
  const { items, isLoading, error, saving, saveError } = useAppSelector((s) => s.calls);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const parent: FileParent | null =
    entityType === 'organization'
      ? { entityType, customerId: Number(entityId) }
      : customerId !== undefined
        ? { entityType, customerId, accountId: Number(entityId) }
        : null;

  useEffect(() => {
    if (parent) dispatch(fetchCalls(parent));
    else dispatch(clearCalls());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, entityType, entityId, customerId, version]);

  // The company's contacts, for the participant picker. Fetched here rather
  // than through the customers slice so this tab never disturbs the
  // Contacts tab's own list.
  useEffect(() => {
    let cancelled = false;
    if (!parent) return undefined;
    const path =
      parent.entityType === 'organization'
        ? `/customers/${parent.customerId}/contacts/`
        : `/customers/${parent.customerId}/accounts/${parent.accountId}/contacts/`;
    apiFetch<Contact[]>(path)
      .then((rows) => { if (!cancelled) setContacts(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setContacts([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, customerId]);

  const stats = useMemo(() => {
    const minutes = items.reduce((sum, c) => sum + (c.duration_minutes ?? 0), 0);
    const by = { positive: 0, neutral: 0, negative: 0 };
    items.forEach((c) => { if (c.sentiment && c.sentiment in by) by[c.sentiment as keyof typeof by] += 1; });
    return { count: items.length, minutes, ...by };
  }, [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, Call[]>();
    items.forEach((c) => {
      const day = c.occurred_at.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), c]);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  async function onLog(input: LogCallInput) {
    if (!parent) return false;
    const result = await dispatch(logCall({ ...parent, input }));
    return logCall.fulfilled.match(result);
  }

  return (
    <div className={embedded ? 'flex flex-col bg-surface' : 'flex-1 flex flex-col overflow-hidden bg-surface'}>
      {parent && <LogCallForm onLog={onLog} saving={saving} error={saveError} contacts={contacts} />}
      {items.length > 0 && (
        <div className="px-6 py-2.5 border-b border-line-subtle flex items-center gap-5 text-[13px] text-ink-muted shrink-0 flex-wrap" aria-label="Call stats">
          <span><strong className="text-ink">{stats.count}</strong> {stats.count === 1 ? 'call' : 'calls'}</span>
          {stats.minutes > 0 && <span><strong className="text-ink">{durationLabel(stats.minutes)}</strong> on calls</span>}
          <span className="text-success"><strong>{stats.positive}</strong> positive</span>
          <span><strong className="text-ink">{stats.neutral}</strong> neutral</span>
          <span className="text-danger"><strong>{stats.negative}</strong> negative</span>
        </div>
      )}
      <div data-calls-list="" className={`${embedded ? '' : 'flex-1 overflow-y-auto custom-scrollbar '}relative px-8 py-6 bg-subtle/40`}>
        {isLoading ? (
          <div className="py-16 text-center text-[13px] font-semibold text-ink-faint opacity-60">Loading calls…</div>
        ) : error ? (
          <div className="py-16 text-center text-[13px] font-semibold text-danger">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 opacity-40">
            <Phone className="w-10 h-10 text-ink-faint mb-2" />
            <span className="text-[13px] font-semibold text-ink-faint">No calls yet</span>
          </div>
        ) : (
          <>
            <div className="absolute left-[44px] top-6 bottom-0 w-px bg-accent-dim z-0" />
            {grouped.map(([day, calls]) => (
              <div key={day} className="relative z-10 mb-8">
                <div className="mb-6 inline-block bg-subtle rounded-full px-4 py-1.5 text-[11px] font-bold text-ink-muted border border-line/50 shadow-sm relative z-10">
                  {formatDate(day)}
                </div>
                <div className="flex flex-col gap-6">
                  {calls.map((call) => <CallCard key={call.id} call={call} />)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
