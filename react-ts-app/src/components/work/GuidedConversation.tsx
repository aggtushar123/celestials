import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { BUNDLE, OUTSIDE, isAppPath } from '../../features/agents/bundleText';
import type { Bundle, BundleStep } from '../../features/agents/bundleTypes';
import { GUIDED, doneText, onTimelineText, onlyOwnerText, questionOf, readsText, sentText, summaryHiddenText, threadOf, type ThreadEntry } from '../../features/agents/guidedText';
import { onlyRunnerText, salesReadsText } from '../../features/agents/salesReport';
import { recordPath } from '../../features/brain/deskText';
import { LINK } from '../brain/styles';
import { BUTTON, Badge, Card, FIELD_ERROR, FORM_ALERT, INPUT, INVALID, NUM, PRIMARY, QUIET, TYPE } from '../ui';
import { AgentBubble, Finding, TypingDots, YouBubble } from './GuidedParts';
import { BundleSource } from './BundleSource';
import { SalesReportResult } from './SalesReport';
import { StepLinks } from './StepLinks';
import type { Guided } from './useGuided';

/** The guided bundle as a conversation (guided agent, 2026-10-18): where
 *  it came from, then the agent's questions and results and the reader's
 *  answers, one step at a time. Drawn in place of the checklist at every
 *  width; the answers are in GuidedAnswerBar, pinned under it. */
export function GuidedConversation({ guided }: { guided: Guided }) {
  const bundle = guided.bundle as Bundle;
  const thread = threadOf(bundle);
  // Lines already there when the panel opened never animate; new ones fade up once.
  const [initial] = useState(() => new Set(thread.map((entry) => entry.key)));
  const pending = guided.pending;
  const workingRef = useRef<HTMLLIElement>(null);
  const running = pending && pending.what !== 'stop' ? bundle.steps.find((step) => step.id === pending.step) ?? null : null;
  useEffect(() => {
    if (pending) workingRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [pending]);
  // After each answer focus moves to the newest agent bubble (the thread is also a polite live region).
  const threadRef = useRef<HTMLOListElement>(null);
  const answered = guided.answered;
  useEffect(() => {
    if (answered === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const bubbles = threadRef.current?.querySelectorAll<HTMLElement>('[data-bubble="agent"]');
      bubbles?.[bubbles.length - 1]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answered]);
  return (
    <div className="flex flex-col gap-4">
      {bundle.priority === 'high' ? (
        <p>
          <Badge tone="warning">{GUIDED.PRIORITY}</Badge>
        </p>
      ) : null}
      <BundleSource source={bundle.source} />
      <ol ref={threadRef} aria-label={GUIDED.THREAD} aria-live="polite" className="flex flex-col gap-3">
        {thread.map((entry) => (
          <Line key={entry.key} entry={entry} bundle={bundle} guided={guided} fresh={!initial.has(entry.key)} hideFailed={running !== null} />
        ))}
        {pending?.what === 'stop' ? <YouBubble answer="not-now" fresh /> : null}
        {running && pending?.what === 'run' ? <YouBubble answer="yes" fresh /> : null}
        {running || pending?.what === 'stop' ? (
          <li ref={workingRef} className="flex items-end gap-2" data-part="working">
            <span aria-hidden="true" className="h-6 w-6 shrink-0" />
            <div role="status" className={`flex max-w-[85%] flex-col gap-1 rounded-xl rounded-tl-sm bg-subtle px-3 py-2 ${TYPE.body}`}>
              <span className="inline-flex items-center gap-2">
                <TypingDots />
                {GUIDED.WORKING}
              </span>
              {running?.kind === 'record.diagnose' && running.preview.diagnose ? <span className={TYPE.meta}>{readsText(running.preview.diagnose.reads)}</span> : null}
              {running?.kind === 'report.sales' && running.preview.sales_report ? <span className={`${TYPE.meta} ${NUM}`}>{salesReadsText(running.preview.sales_report.counts)}</span> : null}
            </div>
          </li>
        ) : null}
      </ol>
      {guided.notice ? (
        <p role="status" className={TYPE.bodyMuted}>
          {guided.notice}
        </p>
      ) : null}
      {guided.error ? (
        <p role="alert" className={FORM_ALERT}>
          {guided.error}
        </p>
      ) : null}
    </div>
  );
}

function Line({ entry, bundle, guided, fresh, hideFailed }: { entry: ThreadEntry; bundle: Bundle; guided: Guided; fresh: boolean; hideFailed: boolean }) {
  if (entry.kind === 'stopped')
    return (
      <AgentBubble fresh={fresh} part="stopped">
        <p className="text-ink-muted">{GUIDED.STOPPED}</p>
      </AgentBubble>
    );
  if (!('step' in entry)) return <Done bundle={bundle} fresh={fresh} />;
  const step = entry.step;
  if (entry.kind === 'ask')
    return (
      <AgentBubble fresh={fresh} part="question">
        <p className="break-words">{questionOf(step)}</p>
        {step.kind === 'report.sales' && step.status === 'proposed' && step.preview.sales_report ? (
          <p data-part="reads" className={`${TYPE.meta} ${NUM}`}>
            {salesReadsText(step.preview.sales_report.counts)}
          </p>
        ) : null}
      </AgentBubble>
    );
  if (entry.kind === 'yes') return <YouBubble answer="yes" fresh={fresh} />;
  if (entry.kind === 'not-now') return <YouBubble answer="not-now" fresh={fresh} />;
  if (entry.kind === 'state')
    return (
      <AgentBubble fresh={fresh} part="state">
        <p className="text-ink-muted">{step.note || stepWord(step)}</p>
      </AgentBubble>
    );
  if (entry.kind === 'failed') {
    // A retry on its way draws the working bubble in its place.
    if (hideFailed && guided.pending?.what === 'retry' && guided.pending.step === step.id) return null;
    return (
      <AgentBubble fresh={fresh} part="failed">
        <p className={FORM_ALERT}>{step.error}</p>
        <button type="button" onClick={() => guided.retry(step.id)} aria-disabled={guided.pending !== null || undefined} className={`${BUTTON} self-start`}>
          {BUNDLE.RETRY}
        </button>
      </AgentBubble>
    );
  }
  return <Result step={step} bundle={bundle} guided={guided} fresh={fresh} />;
}

function stepWord(step: BundleStep): string {
  if (step.status === 'rejected') return BUNDLE.REJECTED_STEP;
  if (step.status === 'undone') return BUNDLE.UNDONE;
  return BUNDLE.SKIPPED;
}

/** An applied step's answer, by kind. */
function Result({ step, bundle, guided, fresh }: { step: BundleStep; bundle: Bundle; guided: Guided; fresh: boolean }) {
  const p = step.preview;
  if (step.kind === 'record.diagnose' && p.diagnose) {
    const d = p.diagnose;
    return (
      <AgentBubble fresh={fresh} part="diagnosis">
        {d.summary_hidden ? <p className="text-ink-muted">{summaryHiddenText(bundle.run_by?.name ?? 'its runner')}</p> : d.summary ? <p className="max-w-[68ch] break-words">{d.summary}</p> : null}
        {d.findings.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className={TYPE.label}>{GUIDED.FINDINGS}</p>
            <ul className="flex flex-col gap-2">
              {d.findings.map((finding, index) => (
                <Finding key={`${index}-${finding.text}`} finding={finding} />
              ))}
            </ul>
          </div>
        ) : null}
      </AgentBubble>
    );
  }
  if (step.kind === 'report.sales' && p.sales_report) {
    const s = p.sales_report;
    if (!s.report)
      return (
        <AgentBubble fresh={fresh} part="report-hidden">
          <p className="text-ink-muted">{onlyRunnerText(bundle.run_by?.name ?? 'its runner')}</p>
        </AgentBubble>
      );
    // Nothing else is asked once the report is in: Download may be the panel's primary.
    return <SalesReportResult report={s.report} downloadUrl={s.download_url} fresh={fresh} primary={!guided.showsBar} />;
  }
  if (step.kind === 'mail.compose' && p.compose) {
    const c = p.compose;
    if (c.private || c.body === null)
      return (
        <AgentBubble fresh={fresh} part="draft-hidden">
          <p className="text-ink-muted">{onlyOwnerText(c.owner ?? 'its owner')}</p>
        </AgentBubble>
      );
    // The send step asked now holds the draft's editable fields: Edit turns this card into them.
    const send = guided.next?.kind === 'mail.send_draft' ? guided.next : null;
    return (
      <>
        <AgentBubble fresh={fresh} part="draft">
          <p>{GUIDED.DRAFT_IS_READY}</p>
        </AgentBubble>
        <li className={`ml-8 max-w-[calc(100%-2rem)] sm:max-w-[80%] ${fresh ? 'animate-fade-up' : ''}`.trim()}>
          {guided.editing && send ? <EmailEditor guided={guided} /> : <EmailCard to={c.to ? (c.to.address ? `${c.to.name} <${c.to.address}>` : c.to.name) : ''} from={c.from ?? ''} subject={c.subject ?? ''} body={c.body} />}
        </li>
      </>
    );
  }
  if (step.kind === 'mail.send_draft' && p.send) {
    const s = p.send;
    return (
      <AgentBubble fresh={fresh} part="sent">
        <p>{sentText(s.to?.name ?? '', s.from)}</p>
        {s.shared && bundle.record ? <p className="text-ink-muted">{onTimelineText(bundle.record.name)}</p> : null}
        <StepLinks links={step.links ?? []} />
      </AgentBubble>
    );
  }
  return (
    <AgentBubble fresh={fresh} part="applied">
      <p>{step.title}</p>
      {step.note ? <p className="text-ink-muted">{step.note}</p> : null}
      <StepLinks links={step.links ?? []} />
    </AgentBubble>
  );
}

/** The written email, as it will go: who to, from, the subject and the body with its line breaks. */
function EmailCard({ to, from, subject, body }: { to: string; from: string; subject: string; body: string }) {
  return (
    <Card as="article" pad="none" aria-label={subject || GUIDED.DRAFT_IS_READY}>
      <dl className={`flex flex-col gap-1 border-b border-line-subtle px-4 py-3 ${TYPE.meta}`}>
        {[
          [GUIDED.TO, to],
          [GUIDED.FROM, from],
        ].map(([label, value]) =>
          value ? (
            <div key={label} className="flex min-w-0 gap-2">
              <dt className="w-12 shrink-0">{label}</dt>
              <dd className="min-w-0 break-words text-ink">{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
      <div className="flex flex-col gap-2 px-4 py-3">
        {subject ? <p className={`${TYPE.body} break-words font-semibold`}>{subject}</p> : null}
        <p data-part="email-body" className={`${TYPE.body} max-w-[68ch] whitespace-pre-line break-words`}>
          {body}
        </p>
      </div>
    </Card>
  );
}

/** Edit: the send step's fields, To, Subject and Message, each with its error below it. */
function EmailEditor({ guided }: { guided: Guided }) {
  const base = useId();
  const keys = guided.next?.editable ?? [];
  const field = (key: 'to' | 'subject' | 'body', label: string) => {
    if (!keys.includes(key)) return null;
    const id = `${base}-${key}`;
    const error = guided.fieldErrors[key];
    const props = {
      id,
      value: guided.email[key],
      'aria-invalid': Boolean(error),
      'aria-describedby': error ? `${id}-error` : undefined,
      onChange: (event: { target: { value: string } }) => guided.setEmail((prev) => ({ ...prev, [key]: event.target.value })),
    };
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className={TYPE.label}>
          {label}
        </label>
        {key === 'body' ? <textarea {...props} rows={8} className={`${INPUT} ${INVALID} min-h-40 py-2`} /> : <input {...props} type={key === 'to' ? 'email' : 'text'} className={`${INPUT} ${INVALID}`} />}
        {error ? (
          <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        ) : null}
      </div>
    );
  };
  return (
    <Card as="article" aria-label={GUIDED.EDIT}>
      <div className="flex flex-col gap-3">
        <p className={TYPE.meta}>{GUIDED.EDITING}</p>
        {field('to', GUIDED.TO)}
        {field('subject', GUIDED.SUBJECT)}
        {field('body', GUIDED.BODY)}
      </div>
    </Card>
  );
}

function Done({ bundle, fresh }: { bundle: Bundle; fresh: boolean }) {
  const record = bundle.record;
  return (
    <AgentBubble fresh={fresh} part="done">
      <p>{doneText(record?.name ?? null)}</p>
      <div className="flex flex-wrap gap-x-3">
        <Link to={`/work?queue=history&bundle=${bundle.id}`} className={LINK}>
          {GUIDED.OPEN_HISTORY}
        </Link>
        {record && record.can_open !== false ? (
          <Link to={recordPath(record)} className={LINK}>
            {record.name}
          </Link>
        ) : null}
      </div>
    </AgentBubble>
  );
}

/** The answers, pinned under the thread: Yes (the panel's one primary) and
 *  Not now for the step asked now, plus Edit for the email before it goes.
 *  A step the reader may not run says why, with where to set it up. */
export function GuidedAnswerBar({ guided }: { guided: Guided }) {
  const bundle = guided.bundle;
  if (!bundle || !guided.showsBar) return null;
  const step = guided.next;
  const canStop = bundle.can_stop === true;
  const held = guided.pending !== null || undefined;
  const mayEdit = step?.kind === 'mail.send_draft' && step.can_run && step.editable.length > 0;
  const notNow = canStop ? (
    <button type="button" onClick={guided.stop} aria-disabled={held} className={`${QUIET} flex-1 sm:flex-none`}>
      {GUIDED.NOT_NOW}
    </button>
  ) : null;
  return (
    <div role="group" aria-label={GUIDED.ANSWER} className="flex flex-col gap-2">
      {step && !step.can_run && step.disabled_reason ? (
        <p className={TYPE.bodyMuted}>
          {step.disabled_reason}
          {step.disabled_link && isAppPath(step.disabled_link) ? (
            <>
              {' '}
              <Link to={step.disabled_link} className={LINK}>
                {OUTSIDE.OPEN_SETTING}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {step?.can_run && step.irreversible ? (
        <p data-part="cant-undo" className={`inline-flex items-center gap-1 self-end ${TYPE.meta}`}>
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {BUNDLE.CANT_UNDO}
        </p>
      ) : null}
      <div className="flex items-center gap-2 sm:justify-end">
        {notNow}
        {mayEdit ? (
          <button type="button" onClick={() => guided.edit(!guided.editing)} aria-disabled={held} aria-pressed={guided.editing} className={`${BUTTON} flex-1 justify-center sm:flex-none`}>
            {guided.editing ? GUIDED.CANCEL_EDIT : GUIDED.EDIT}
          </button>
        ) : null}
        {step?.can_run ? (
          <button type="button" onClick={guided.yes} aria-disabled={held} className={`${PRIMARY} flex-1 justify-center sm:flex-none sm:min-w-24`}>
            {GUIDED.YES}
          </button>
        ) : null}
      </div>
    </div>
  );
}
