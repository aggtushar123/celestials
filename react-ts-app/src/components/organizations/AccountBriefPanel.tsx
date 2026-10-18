// The standing brief on one account, and what nobody here can answer.
//
// The brief says what they use the product for, who cares about what, and
// what is still open (see revenact-backend services/knowledge/brief.py).
// It is written when someone asks, never on a schedule, so it carries the
// date it was written and who asked for it.
//
// Under it, the gaps: questions asked of the Copilot that had nothing to
// answer from, and routed questions nobody answered. Writing the answer
// here records it as an ordinary contribution and closes the loop.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { answerGap, dismissGap, fetchBrief, generateBrief } from '../../features/knowledge/briefApi';
import type { AccountBrief, BriefGap } from '../../features/knowledge/briefApi';
import { hrefOf } from '../../pages/copilot/sourceHref';
import { ApiError } from '../../lib/apiClient';
import { BUTTON, Badge, Card, CardBody, CardHeader, CardSection, FOCUS, ICON_BUTTON, INPUT, LoadingState, NUM, PRIMARY, QUIET, TYPE } from '../ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-22T09:00:00Z" → "22 Sep 2026", read off the string so the day never shifts. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function AccountBriefPanel({ customerId, customerName }: { customerId: number; customerName: string }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; brief: AccountBrief } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [writing, setWriting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const key = `${customerId}#${attempt}`;
  // Which company the panel is on *now*, for the in-flight write below to
  // check against. Written in an effect, never during render.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);
  const brief = loaded?.key === key ? loaded.brief : null;
  const error = failed?.key === key ? failed.message : null;

  useEffect(() => {
    let cancelled = false;
    fetchBrief(customerId)
      .then((next) => {
        if (cancelled) return;
        // A wrong shape must not take the company page down with it.
        if (!next || !Array.isArray(next.use_cases)) throw new Error('unexpected response');
        setLoaded({ key, brief: next });
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorText(err, 'Could not load the brief.') });
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, key]);

  async function write() {
    setWriting(true);
    setActionError(null);
    const mine = key;
    try {
      const next = await generateBrief(customerId);
      // The panel may have moved to another company while this was in
      // flight; a brief is only ever shown under the company it is about.
      if (mine === keyRef.current) setLoaded({ key: mine, brief: next });
    } catch (err) {
      if (mine === keyRef.current) setActionError(errorText(err, 'Could not write the brief.'));
    } finally {
      if (mine === keyRef.current) setWriting(false);
    }
  }

  const written = brief !== null && brief.generated_at !== null;
  // The backend withholds the brief's own words along with the citations
  // they were written from, so a written brief with nothing in it and
  // something hidden is not empty: it is not this reader's to read.
  const withheld =
    written &&
    brief.hidden_sources > 0 &&
    brief.use_cases.length === 0 &&
    brief.stakeholders.length === 0 &&
    brief.open_threads.length === 0;

  return (
    <Card as="section" pad="none" aria-label="Account brief">
      <CardHeader
        title="Account brief"
        meta={
          written && brief.generated_at ? (
            <>
              Written by {brief.generated_by?.name ?? 'the Copilot'} on <span className={NUM}>{shortDate(brief.generated_at)}</span>
            </>
          ) : undefined
        }
        action={
          brief ? (
            <button type="button" onClick={write} disabled={writing} className={BUTTON}>
              {writing ? 'Writing…' : written ? 'Rewrite' : 'Write the brief'}
            </button>
          ) : undefined
        }
      />

      {actionError ? (
        <p className="px-4 pb-3 text-[13px] text-danger-ink" role="alert">
          {actionError}
        </p>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4" role="alert">
          <p className="text-[13px] text-danger-ink">{error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={QUIET}>
            Retry
          </button>
        </div>
      ) : brief === null ? (
        <LoadingState label="Loading the brief" variant="block" />
      ) : (
        <>
          <CardBody>
            {withheld ? (
              <p className={TYPE.bodyMuted}>
                This brief was written from {brief.hidden_sources === 1 ? '1 record' : `${brief.hidden_sources} records`} you
                cannot see, so its words are withheld too. Rewriting it reads only what you can read.
              </p>
            ) : written ? (
              <div className="flex flex-col gap-4">
                <Lines title="Use cases" items={brief.use_cases} empty="Nothing on record says what they use it for." />
                <div className="flex flex-col gap-1.5">
                  <h3 className={TYPE.label}>Stakeholders</h3>
                  {brief.stakeholders.length === 0 ? (
                    <p className={TYPE.bodyMuted}>Nobody named yet.</p>
                  ) : (
                    <ul aria-label="Stakeholders" className="flex flex-col gap-1">
                      {brief.stakeholders.map((person, index) => (
                        <li key={`${person.name}-${index}`} className={TYPE.body}>
                          <span className="font-semibold">{person.name}</span>
                          {person.cares_about ? <span className="text-ink-muted">: {person.cares_about}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Lines title="Still open" items={brief.open_threads} empty="Nothing open on record." />
                {brief.sources.length > 0 || brief.hidden_sources > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <h3 className={TYPE.label}>Written from</h3>
                    <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
                      {brief.sources.map((source) => (
                        <li key={`${source.type}:${source.id}`}>
                          <Link to={hrefOf(source)} className={`${FOCUS} inline-flex rounded-full`}>
                            <Badge truncate>
                              {source.type} · {source.label}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {brief.hidden_sources > 0 ? (
                      <p className={TYPE.meta}>
                        {brief.hidden_sources === 1 ? 'And 1 record you cannot see.' : `And ${brief.hidden_sources} records you cannot see.`}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={TYPE.bodyMuted}>
                No brief yet. The Copilot can read what the company knows about {customerName} and write one.
              </p>
            )}
          </CardBody>

          <Gaps gaps={brief.gaps} onChanged={() => setAttempt((n) => n + 1)} onError={(message) => setActionError(message)} />
        </>
      )}
    </Card>
  );
}

function Lines({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className={TYPE.label}>{title}</h3>
      {items.length === 0 ? (
        <p className={TYPE.bodyMuted}>{empty}</p>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-4">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className={TYPE.body}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Gaps({ gaps, onChanged, onError }: { gaps: BriefGap[]; onChanged: () => void; onError: (message: string) => void }) {
  const [answering, setAnswering] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(gap: BriefGap) {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await answerGap(gap.id, draft.trim());
      setAnswering(null);
      setDraft('');
      onChanged();
    } catch (err) {
      onError(errorText(err, 'Could not save the answer.'));
    } finally {
      setBusy(false);
    }
  }

  async function drop(gap: BriefGap) {
    setBusy(true);
    try {
      await dismissGap(gap.id);
      onChanged();
    } catch (err) {
      onError(errorText(err, 'Could not dismiss it.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CardSection>
      <div className="flex flex-col gap-2">
        <h3 className={TYPE.label}>What we cannot answer</h3>
        {gaps.length === 0 ? (
          <p className={TYPE.bodyMuted}>Nothing unanswered right now.</p>
        ) : (
          <ul aria-label="What we cannot answer" className="flex flex-col divide-y divide-line-subtle">
            {gaps.map((gap) => (
              <li key={gap.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={TYPE.body}>{gap.subject}</p>
                    <p className={TYPE.meta}>
                      Asked {gap.times_asked === 1 ? 'once' : `${gap.times_asked} times`}
                      {gap.function ? ` · ${gap.function}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAnswering(answering === gap.id ? null : gap.id);
                        setDraft('');
                      }}
                      disabled={busy}
                      aria-expanded={answering === gap.id}
                      aria-label={`Answer ${gap.subject}`}
                      className={QUIET}
                    >
                      Answer
                    </button>
                    <button type="button" onClick={() => drop(gap)} disabled={busy} aria-label={`Dismiss ${gap.subject}`} className={ICON_BUTTON}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {answering === gap.id ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      save(gap);
                    }}
                  >
                    <label htmlFor={`gap-answer-${gap.id}`} className={TYPE.label}>
                      Your answer
                    </label>
                    <textarea
                      id={`gap-answer-${gap.id}`}
                      rows={3}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="What you know, in your own words."
                      className={`${INPUT} min-h-20 resize-y py-2`}
                    />
                    <p className={TYPE.meta}>
                      This is recorded as your contribution on the account, so the Copilot answers from it next time.
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="submit" disabled={!draft.trim() || busy} className={PRIMARY}>
                        Save answer
                      </button>
                      <button type="button" onClick={() => setAnswering(null)} className={QUIET}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </CardSection>
  );
}
