// The AI-filled attributes of one company, under its pinned attributes.
//
// Each row is the model's latest answer to an admin's question (see
// revenact-backend services/attributes): the value, why it thinks so with
// the records it cited, the history of answers and corrections, an inline
// override, and a refresh that asks the model again for this company.
// Citations the reader may not open never arrive (the backend withholds
// them and the reasoning that quotes them); the row says how many.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, History, Info, Pencil, RefreshCw, Settings2, Sparkles, X } from 'lucide-react';
import { fetchHistory, fetchValues, fillAttribute, overrideValue } from '../../features/attributes/attributesApi';
import { displayValue } from '../../features/attributes/types';
import type { AIAttributeValue, AttributeBrief, AttributeValue, AttributeWithLatest, CompanyRef } from '../../features/attributes/types';
import { MessageSources } from '../../pages/copilot/MessageSources';
import { ApiError } from '../../lib/apiClient';

export interface AIAttributesPanelProps {
  customerId?: number;
  accountId?: number;
}

type Open = 'why' | 'history' | 'edit' | null;

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const ICON_BUTTON = `p-1 rounded-md text-ink-faint hover:text-ink hover:bg-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-[var(--dur-fast)] ${FOCUS}`;

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-22T09:00:00Z" → "22 Sep 2026", read off the string so the day never shifts with the timezone. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function withheld(count: number, alongsideVisible: boolean): string {
  const records = count === 1 ? '1 record' : `${count} records`;
  if (alongsideVisible) return `${count === 1 ? '1 more record' : `${count} more records`} you cannot see.`;
  return `Based on ${records} you cannot see. The reasoning quotes ${count === 1 ? 'it' : 'them'}, so it is withheld.`;
}

export function AIAttributesPanel({ customerId, accountId }: AIAttributesPanelProps) {
  const company: CompanyRef | null = customerId ? { customerId } : accountId ? { accountId } : null;
  const companyKey = customerId ? `c${customerId}` : `a${accountId}`;
  const [attempt, setAttempt] = useState(0);
  // Results are stamped with the company (and the retry) they belong to, so
  // another company's answers never show under this one's name while its
  // own request is in flight: a stale stamp simply reads as loading.
  const stamp = `${companyKey}#${attempt}`;
  const [loaded, setLoaded] = useState<{ stamp: string; rows: AttributeWithLatest[] } | null>(null);
  const [failed, setFailed] = useState<{ stamp: string; message: string } | null>(null);
  const rows = loaded?.stamp === stamp ? loaded.rows : null;
  const error = failed?.stamp === stamp ? failed.message : null;

  useEffect(() => {
    if (!customerId && !accountId) return;
    const target: CompanyRef = customerId ? { customerId } : { accountId: accountId as number };
    let cancelled = false;
    fetchValues(target)
      .then((next) => {
        if (cancelled) return;
        // A wrong shape must not take the company page down with it.
        if (!Array.isArray(next)) throw new Error('unexpected response');
        setLoaded({ stamp, rows: next });
      })
      .catch((err) => {
        if (!cancelled) setFailed({ stamp, message: errorText(err, 'Could not load AI attributes.') });
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, accountId, stamp]);

  if (!company) return null;

  function replace(attributeId: number, latest: AIAttributeValue) {
    setLoaded((current) =>
      current ? { ...current, rows: current.rows.map((row) => (row.attribute.id === attributeId ? { ...row, latest } : row)) } : current
    );
  }

  return (
    <section aria-label="AI attributes" className="flex flex-col gap-3 pt-2 border-t border-line-subtle">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          AI attributes
        </span>
        <Link to="/settings/ai/attributes" className={`p-1 rounded-md text-ink-faint hover:text-ink hover:bg-subtle ${FOCUS}`} aria-label="Manage AI attributes">
          <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {error}{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`underline rounded-sm ${FOCUS}`}>Retry</button>
        </p>
      ) : rows === null ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading AI attributes">
          <div className="h-3 w-24 rounded bg-subtle animate-pulse" />
          <div className="h-4 w-40 rounded bg-subtle animate-pulse" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-ink-faint">
          No AI attributes yet.{' '}
          <Link to="/settings/ai/attributes" className={`text-accent hover:underline rounded-sm ${FOCUS}`}>Define one in Settings</Link>
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <AttributeRow key={`${companyKey}:${row.attribute.id}`} row={row} company={company} onChange={(latest) => replace(row.attribute.id, latest)} />
          ))}
        </div>
      )}
    </section>
  );
}

function AttributeRow({ row, company, onChange }: { row: AttributeWithLatest; company: CompanyRef; onChange: (latest: AIAttributeValue) => void }) {
  const { attribute, latest } = row;
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [history, setHistory] = useState<AIAttributeValue[] | null>(null);
  const historyRequest = useRef(0);

  const answered = latest !== null && latest.value !== null;
  const shown = answered ? displayValue(attribute.value_type, latest.value) : '';
  const empty = !latest ? 'Not filled yet' : latest.status === 'insufficient' ? 'Not enough evidence' : latest.status === 'failed' ? 'Could not answer' : 'Empty';
  const hasWhy = latest !== null && (latest.reasoning !== '' || latest.sources.length > 0 || latest.hidden_sources > 0);

  function toggle(which: Open) {
    setRowError(null);
    setOpen((current) => (current === which ? null : which));
  }

  async function showHistory() {
    setRowError(null);
    if (open === 'history') return setOpen(null);
    setOpen('history');
    setHistory(null);
    const request = ++historyRequest.current;
    try {
      const rows = await fetchHistory(attribute.id, company);
      if (request === historyRequest.current) setHistory(rows);
    } catch (err) {
      if (request === historyRequest.current) setRowError(errorText(err, 'Could not load the history.'));
    }
  }

  async function refresh() {
    setBusy(true);
    setRowError(null);
    try {
      onChange(await fillAttribute(attribute.id, company));
      setOpen(null);
    } catch (err) {
      setRowError(errorText(err, 'Could not ask the Copilot.'));
    } finally {
      setBusy(false);
    }
  }

  async function save(value: AttributeValue) {
    setBusy(true);
    setRowError(null);
    try {
      onChange(await overrideValue(attribute.id, company, value));
      setOpen(null);
    } catch (err) {
      setRowError(errorText(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-ink-faint uppercase tracking-wider">{attribute.name}</span>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {answered ? (
            <span className={`text-[13.5px] font-semibold text-ink ${attribute.value_type === 'number' ? 'font-mono-brand tabular-nums' : ''}`}>{shown}</span>
          ) : (
            <span className="text-[13px] text-ink-faint">{empty}</span>
          )}
          {latest ? (
            <p className="text-[11px] text-ink-faint mt-0.5">
              <span>{latest.origin === 'human' ? `Set by ${latest.set_by?.name ?? 'a colleague'}` : 'AI'}</span>
              <span> · {shortDate(latest.computed_at)}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {hasWhy ? (
            <button type="button" onClick={() => toggle('why')} disabled={busy} aria-expanded={open === 'why'} aria-label={`Why ${attribute.name}: ${shown || empty}?`} className={ICON_BUTTON}>
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" onClick={showHistory} disabled={busy} aria-expanded={open === 'history'} aria-label={`History of ${attribute.name}`} className={ICON_BUTTON}>
            <History className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => toggle('edit')} disabled={busy} aria-expanded={open === 'edit'} aria-label={`Edit ${attribute.name}`} className={ICON_BUTTON}>
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={refresh} disabled={busy} aria-label={`Refresh ${attribute.name}`} className={ICON_BUTTON}>
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {rowError ? <p className="text-[12px] text-danger" role="alert">{rowError}</p> : null}

      {open === 'why' && latest ? (
        <div className="mt-1 rounded-lg bg-subtle px-3 py-2 text-[12px] text-ink leading-relaxed">
          {latest.reasoning ? <p>{latest.reasoning}</p> : null}
          <MessageSources sources={latest.sources} />
          {latest.hidden_sources > 0 ? (
            <p className="text-ink-faint mt-2">{withheld(latest.hidden_sources, latest.sources.length > 0 || latest.reasoning !== '')}</p>
          ) : null}
        </div>
      ) : null}

      {open === 'history' ? (
        history === null && !rowError ? (
          <p className="text-[12px] text-ink-faint" role="status">Loading history…</p>
        ) : history ? (
          <ul aria-label={`History of ${attribute.name}`} className="mt-1 flex flex-col divide-y divide-line-subtle rounded-lg bg-subtle px-3">
            {history.length === 0 ? <li className="py-2 text-[12px] text-ink-faint">Nothing yet.</li> : null}
            {history.map((entry) => (
              <li key={entry.id} className="py-2 flex items-center justify-between gap-2 text-[12px]">
                <span className={entry.value === null ? 'text-ink-faint' : 'text-ink font-semibold'}>
                  {entry.value === null
                    ? entry.status === 'insufficient' ? 'Not enough evidence' : 'Could not answer'
                    : displayValue(attribute.value_type, entry.value) || 'Empty'}
                </span>
                <span className="text-ink-faint whitespace-nowrap">
                  {entry.origin === 'human' ? entry.set_by?.name ?? 'Person' : 'AI'} · {shortDate(entry.computed_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : null
      ) : null}

      {open === 'edit' ? (
        <OverrideForm attribute={attribute} current={latest?.value ?? null} busy={busy} onSave={save} onCancel={() => setOpen(null)} />
      ) : null}
    </article>
  );
}

function OverrideForm({ attribute, current, busy, onSave, onCancel }: { attribute: AttributeBrief; current: AttributeValue; busy: boolean; onSave: (value: AttributeValue) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<string>(current === null ? '' : String(current));
  const id = `attr-${attribute.id}`;
  const input = `w-full px-2.5 py-1.5 bg-surface border border-line rounded-md text-[13px] text-ink focus:outline-none focus:border-accent`;

  function value(): AttributeValue {
    if (attribute.value_type === 'boolean') return draft === 'true';
    if (attribute.value_type === 'number') return draft.trim() === '' ? null : Number(draft);
    return draft.trim();
  }

  const canSave = attribute.value_type === 'boolean' ? draft !== '' : draft.trim() !== '';

  return (
    <form
      className="mt-1 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave(value());
      }}
    >
      <label htmlFor={id} className="sr-only">{attribute.name}</label>
      {attribute.value_type === 'picklist' ? (
        <select id={id} value={draft} onChange={(e) => setDraft(e.target.value)} className={input}>
          <option value="">Choose…</option>
          {attribute.picklist_options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : attribute.value_type === 'boolean' ? (
        <select id={id} value={draft} onChange={(e) => setDraft(e.target.value)} className={input}>
          <option value="">Choose…</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input id={id} type={attribute.value_type === 'number' ? 'number' : 'text'} value={draft} onChange={(e) => setDraft(e.target.value)} className={input} />
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!canSave || busy} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent text-on-accent text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}>
          <Check className="w-3 h-3" aria-hidden="true" />
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold text-ink-muted hover:text-ink disabled:opacity-50 ${FOCUS}`}>
          <X className="w-3 h-3" aria-hidden="true" />
          Cancel
        </button>
      </div>
    </form>
  );
}
