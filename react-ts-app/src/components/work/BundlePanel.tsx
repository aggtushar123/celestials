import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ESCALATION, displayOrder, readHandlerRefusal, runsLastText, type HandlerRefusal } from '../../features/agents/escalationText';
import { Link } from 'react-router-dom';
import { refreshBundle, retryStep, runBundle, saveStep, setHandler } from '../../features/agents/bundlesApi';
import {
  BUNDLE,
  BUNDLE_GONE,
  NO_REJECT,
  bundleForText,
  changedFields,
  draftOf,
  isDirty,
  readRunRefusal,
  runBody,
  runLabel,
  selectedCount,
  stepSave,
  summaryText,
  type Draft,
  type RejectDraft,
  type RunRefusal,
} from '../../features/agents/bundleText';
import type { Bundle, HandlerBody, StepSave } from '../../features/agents/bundleTypes';
import { recordPath } from '../../features/brain/deskText';
import { Sheet } from '../organizations/detail/Sheet';
import { ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, DANGER, FOCUS, FORM_ALERT, ListCard, LoadingState, PRIMARY, QUIET, TYPE } from '../ui';
import { LINK } from '../brain/styles';
import { BundleReject } from './BundleReject';
import { EscalationHandler } from './EscalationHandler';
import { BundleSource } from './BundleSource';
import { BundleStep } from './BundleStep';
import { NewerMessage } from './NewerMessage';
import { feedChanged, taskChanged } from './taskChanges';
import { useBundle } from './useBundle';
import { GuidedAnswerBar, GuidedConversation } from './GuidedConversation';
import { useGuided } from './useGuided';

const NO_REFUSAL: RunRefusal = { form: null, fields: {}, bundle: null, lost: false };

/** A refusal on show; `fromSave` when a step save was refused, so a later
 *  save that goes through takes its form alert away (Decision 6). */
type Shown = RunRefusal & { fromSave?: boolean };

/** One bundle in the wide Sheet (spec §8.2): what it is about, its steps,
 *  and Run N selected, the page's one primary. A waiting bundle's edits are
 *  saved as they are made (contract D2-18; Decision 6): a step's fields when
 *  focus leaves them, its tick at once, the rest when the panel closes. After
 *  a run the panel stays on the results; the summary line takes focus; the
 *  queue and the badge read again. */
export function BundlePanel({ id, isSm, onClose, fallbackFocus }: { id: number; isSm: boolean; onClose: () => void; fallbackFocus: () => HTMLElement | null | undefined }) {
  const load = useBundle(id);
  const bundle = load.bundle;
  // Guided agent (2026-10-18): a guided bundle is a conversation, not a checklist.
  const guided = useGuided(load);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refusal, setRefusal] = useState<Shown>(NO_REFUSAL);
  const [said, setSaid] = useState<{ text: string; n: number } | null>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const [mode, setMode] = useState<'run' | 'reject' | 'discard'>('run');
  // Where Keep editing goes back to: the steps, or the reject form.
  const [backTo, setBackTo] = useState<'run' | 'reject'>('run');
  const [rejecting, setRejecting] = useState<RejectDraft>(NO_REJECT);
  const [retrying, setRetrying] = useState<number | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  // Set when the footer swaps back to the steps from Cancel or Keep
  // editing, so focus lands on a footer button and not on the page.
  const refocus = useRef<'run' | 'reject' | null>(null);
  const { busy, run } = useSubmitOnce();
  const refreshing = useSubmitOnce();
  const current = draft ?? (bundle ? draftOf(bundle) : null);
  const editing = bundle?.status === 'waiting';
  const [saving, setSaving] = useState<Record<number, 'saving' | 'saved' | null>>({});
  // One "Saved." timer per step, so each clears on its own (ruling M1).
  const savedTimers = useRef(new Map<number, number>());
  // Step saves on their way; Run and Refresh wait for them (ruling X3).
  const inFlight = useRef(new Set<Promise<boolean>>());
  // The bundle as last answered, read by saves that finish between renders.
  const latest = useRef<Bundle | null>(null);
  // Bumped when Run, Refresh or Reject replaces the bundle: a save answer
  // started before it is stale and is dropped.
  const epoch = useRef(0);
  // Set while Run or Refresh waits for saves and sends: no new save starts.
  const holding = useRef(false);
  const closing = useRef(false);
  // The frame that moves focus to a retried step's line. Any later focus
  // move by the panel (the summary, an alert, the footer) or another retry
  // drops it, so a stale frame never pulls focus back to that step.
  const stepFocus = useRef(0);
  const dropStepFocus = () => {
    window.cancelAnimationFrame(stepFocus.current);
    stepFocus.current = 0;
  };

  useEffect(() => {
    latest.current = bundle;
  }, [bundle]);
  useEffect(() => {
    const timers = savedTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      window.cancelAnimationFrame(stepFocus.current);
    };
  }, []);

  useEffect(() => {
    if (!said) return;
    dropStepFocus();
    summaryRef.current?.focus();
  }, [said]);
  useEffect(() => {
    if (!refusal.form) return;
    dropStepFocus();
    alertRef.current?.focus();
  }, [refusal]);
  useEffect(() => {
    if (mode !== 'run') dropStepFocus();
    if (mode === 'discard') keepRef.current?.focus();
    if (mode !== 'run' || !refocus.current) return;
    const want = refocus.current;
    refocus.current = null;
    const target = want === 'reject' ? (rejectRef.current ?? runRef.current) : (runRef.current ?? rejectRef.current);
    (target ?? document.querySelector<HTMLElement>('[role="dialog"] h2'))?.focus();
  }, [mode]);
  // A bundle lost on open or after an action: the queue and the badge read again.
  useEffect(() => {
    if (!load.lost) return;
    feedChanged();
    taskChanged();
  }, [load.lost]);

  const say = (text: string) => setSaid((prev) => ({ text, n: (prev?.n ?? 0) + 1 }));
  const take = (next: Bundle) => {
    latest.current = next;
    load.replace(next);
    setDraft(null);
  };
  /** A Run or Reject answer: the bundle as it is now, and any save answer still on its way is stale. */
  const replaceAll = (next: Bundle) => {
    epoch.current += 1;
    take(next);
  };
  const markSaving = (stepId: number, state: 'saving' | 'saved' | null) => {
    const timers = savedTimers.current;
    const timer = timers.get(stepId);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.delete(stepId);
    setSaving((prev) => ({ ...prev, [stepId]: state }));
    if (state === 'saved')
      timers.set(
        stepId,
        window.setTimeout(() => {
          timers.delete(stepId);
          setSaving((prev) => ({ ...prev, [stepId]: null }));
        }, 4000),
      );
  };

  async function sendSave(bundleId: number, stepId: number, body: StepSave): Promise<boolean> {
    const at = epoch.current;
    markSaving(stepId, 'saving');
    try {
      const answer = await saveStep(bundleId, stepId, body);
      if (epoch.current !== at) {
        markSaving(stepId, null);
        return true;
      }
      // The draft keeps its values: they now match the saved step, so they no longer count as changes.
      latest.current = answer.bundle;
      load.replace(answer.bundle);
      setRefusal((prev) => {
        let next = prev.fields[stepId] ? { ...prev, fields: { ...prev.fields, [stepId]: {} } } : prev;
        if (prev.fromSave && prev.form) next = { ...next, form: null };
        return next;
      });
      markSaving(stepId, 'saved');
      return true;
    } catch (err) {
      markSaving(stepId, null);
      if (epoch.current !== at) return false;
      const read = readRunRefusal(err, BUNDLE.SAVE_FAILED);
      if (read.lost) {
        // Gone: nothing left to save, so Close never asks about these edits.
        setDraft(null);
        load.lose();
      } else {
        if (read.bundle) take(read.bundle);
        setRefusal({ ...read, fromSave: true });
      }
      return false;
    }
  }

  /** Save one step of a waiting bundle (Decision 6): its changed fields, or
   *  its tick when `tick`. Answers false when the server refused it. */
  function saveIt(stepId: number, tick: boolean, entry?: Draft[number]): Promise<boolean> {
    const now = latest.current;
    if (load.lost || !now || now.status !== 'waiting' || holding.current) return Promise.resolve(true);
    const step = now.steps.find((candidate) => candidate.id === stepId);
    const body = step ? stepSave(step, entry ?? current?.[stepId], { tick }) : null;
    if (!body) return Promise.resolve(true);
    const task = sendSave(now.id, stepId, body);
    inFlight.current.add(task);
    void task.finally(() => inFlight.current.delete(task));
    return task;
  }

  /** Closing with unsaved fields (Decision 7; ruling M2): the saves on their
   *  way finish, then each step with changes left is saved in turn, its
   *  fields then its tick; a tick that already saved is not sent again.
   *  Stops at the first refusal. */
  async function saveAll(edits: Draft): Promise<boolean> {
    if (!(await Promise.all([...inFlight.current])).every(Boolean)) return false;
    const steps = [...(latest.current?.steps ?? [])].sort((a, b) => a.position - b.position);
    for (const step of steps) {
      if (!(await saveIt(step.id, false, edits[step.id]))) return false;
      if (!(await saveIt(step.id, true, edits[step.id]))) return false;
    }
    return true;
  }

  /** Run and Refresh (ruling X3): no new save starts, the saves on their way
   *  finish, then `send` goes with the bundle as last answered. Null when one
   *  of those saves was refused (its refusal shows). */
  async function afterSaves<T>(send: (now: Bundle) => Promise<T>): Promise<T | null> {
    holding.current = true;
    try {
      const results = await Promise.all([...inFlight.current]);
      const now = latest.current;
      if (!now || !results.every(Boolean)) return null;
      epoch.current += 1;
      return await send(now);
    } finally {
      holding.current = false;
    }
  }
  const edit = (stepId: number, change: (entry: Draft[number]) => Draft[number]) =>
    setDraft((prev) => {
      const base = prev ?? (bundle ? draftOf(bundle) : {});
      return { ...base, [stepId]: change(base[stepId]) };
    });

  /** Escape, Close and the scrim (Decision 7): a waiting bundle's unsaved
   *  edits are saved, then it closes; ask first only while edits would be
   *  lost: a failed step's, the reject form's, or a save that was refused. */
  const rejectDirty = rejecting.reason !== '' || rejecting.note !== '';
  const requestClose = async () => {
    // A lost bundle has nothing to save or discard: it just closes.
    if (load.lost) {
      onClose();
      return;
    }
    if (mode === 'discard' || closing.current) return;
    const back = mode === 'reject' ? 'reject' : 'run';
    if (mode === 'reject' && rejectDirty) {
      setBackTo(back);
      setMode('discard');
      return;
    }
    if (bundle && current && isDirty(bundle, current)) {
      if (bundle.status === 'waiting') {
        closing.current = true;
        try {
          if (await saveAll(current)) {
            onClose();
            return;
          }
        } finally {
          closing.current = false;
        }
      }
      setBackTo(back);
      setMode('discard');
      return;
    }
    onClose();
  };
  const keepEditing = () => {
    if (backTo === 'run') refocus.current = 'run';
    setMode(backTo);
  };

  /** Retry one failed step with only its changed fields (Decision 15). */
  async function retryIt(stepId: number) {
    if (!bundle || !current || retrying !== null) return;
    const step = bundle.steps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    dropStepFocus();
    setRetrying(stepId);
    setRefusal(NO_REFUSAL);
    try {
      const answer = await retryStep(bundle.id, stepId, changedFields(step, current[stepId].fields));
      feedChanged();
      taskChanged();
      // Keep the edits to the other steps that are still failed; drop the
      // retried step's and any step that is no longer failed.
      const kept = Object.fromEntries(answer.bundle.steps.filter((s) => s.id !== stepId && s.status === 'failed' && current[s.id]).map((s) => [s.id, current[s.id]]));
      load.replace(answer.bundle);
      setDraft(Object.keys(kept).length > 0 ? { ...draftOf(answer.bundle), ...kept } : null);
      // A retry that finishes the bundle says so, and the summary keeps focus.
      if (answer.bundle.status === 'done') say(summaryText(answer.bundle));
      else {
        dropStepFocus();
        stepFocus.current = window.requestAnimationFrame(() => {
          stepFocus.current = 0;
          document.querySelector<HTMLElement>(`[data-step="${stepId}"] [data-focus]`)?.focus();
        });
      }
    } catch (err) {
      const read = readRunRefusal(err, BUNDLE.RETRY_FAILED);
      if (read.lost) load.lose();
      else {
        if (read.bundle) take(read.bundle);
        setRefusal(read);
      }
    } finally {
      setRetrying(null);
    }
  }

  /** Refresh suggestions (Decision 9; ruling X3): the saves on their way
   *  finish first, then the agent is asked again. The answer replaces the
   *  bundle and drops the local draft (the server kept every saved edit).
   *  A refresh that leaves nothing answers the bundle superseded: it says
   *  the agent no longer suggests it, never that it refreshed. */
  async function refreshIt() {
    if (!bundle || refreshing.busy || busy) return;
    setRefusal(NO_REFUSAL);
    const outcome = await refreshing.run(() => afterSaves((now) => refreshBundle(now.id)));
    if (!outcome || (outcome.ok && outcome.value === null)) return;
    // The list behind the panel reads again (its row's title, kinds and steps), and the badge.
    feedChanged();
    taskChanged();
    if (outcome.ok) {
      const answer = outcome.value;
      if (!answer) return;
      replaceAll(answer.bundle);
      say(answer.bundle.status === 'superseded' ? BUNDLE.NO_LONGER : BUNDLE.REFRESHED);
      return;
    }
    const read = readRunRefusal(outcome.error, BUNDLE.REFRESH_FAILED);
    if (read.lost) load.lose();
    else {
      if (read.bundle) take(read.bundle);
      setRefusal(read);
    }
  }

  async function runIt() {
    if (!bundle || !current || busy || refreshing.busy) return;
    if (selectedCount(bundle, current) === 0) {
      setRefusal({ ...NO_REFUSAL, form: BUNDLE.NONE_SELECTED });
      return;
    }
    setRefusal(NO_REFUSAL);
    // Saved steps already hold their fields; the body carries only what is not saved yet.
    const edits = current;
    const outcome = await run(() => afterSaves((now) => runBundle(now.id, runBody(now, edits))));
    // A save refused before the run (value null): its refusal shows and nothing ran.
    if (!outcome || (outcome.ok && outcome.value === null)) return;
    feedChanged();
    taskChanged();
    if (outcome.ok) {
      const answer = outcome.value;
      if (!answer) return;
      replaceAll(answer.bundle);
      say(summaryText(answer.bundle));
      return;
    }
    const read = readRunRefusal(outcome.error);
    if (read.lost) {
      load.lose();
      return;
    }
    if (read.bundle) take(read.bundle);
    setRefusal(read);
  }

  /** Change who handles an escalation (frontend Decision 2; contract §4): the
   *  edits so far are saved first, as Run does; the answer replaces the bundle.
   *  A 409 carries the bundle as it is now: it replaces the panel's, and the
   *  refusal shows in the form. */
  async function changeHandler(body: HandlerBody): Promise<HandlerRefusal | null> {
    if (!bundle || !current) return null;
    // A step save was refused: its alert shows; the form stays open, says nothing and keeps its choice.
    if (!(await saveAll(current))) return { field: null, message: '', lost: false };
    try {
      const answer = await setHandler(bundle.id, body);
      // A refusal from before (a run, a refresh) no longer holds.
      setRefusal(NO_REFUSAL);
      replaceAll(answer.bundle);
      feedChanged();
      taskChanged();
      const who = answer.bundle.escalation?.handler;
      say(who ? ESCALATION.nowHandledBy(who.name) : ESCALATION.CHOOSE);
      return null;
    } catch (err) {
      const read = readHandlerRefusal(err);
      if (read.lost) {
        load.lose();
        return null;
      }
      const fresh = readRunRefusal(err).bundle;
      if (fresh) {
        replaceAll(fresh);
        feedChanged();
        taskChanged();
      }
      return read;
    }
  }

  let body: ReactNode;
  if (load.lost) body = <p className={TYPE.bodyMuted}>{BUNDLE_GONE}</p>;
  else if (!bundle && load.error) body = <ErrorBlock message={load.error} onRetry={load.retry} />;
  else if (!bundle || !current) body = <LoadingState label={BUNDLE.LOADING} count={3} />;
  else if (bundle.guided) body = <GuidedConversation guided={guided} />;
  else
    body = (
      <div className="flex flex-col gap-4">
        {bundle.participant_view ? <p className={TYPE.meta}>{ESCALATION.PARTICIPANT}</p> : null}
        {said ? (
          <p ref={summaryRef} key={said.n} role="status" tabIndex={-1} className={`${TYPE.body} font-semibold ${FOCUS}`}>
            {said.text}
          </p>
        ) : null}
        {refusal.form ? (
          <p ref={alertRef} role="alert" tabIndex={-1} className={`${FORM_ALERT} ${FOCUS}`}>
            {refusal.form}
          </p>
        ) : null}
        {bundle.status === 'waiting' && bundle.has_newer_message ? <NewerMessage canRefresh={bundle.can_refresh} busy={refreshing.busy} onRefresh={() => void refreshIt()} /> : null}
        {bundle.reason ? <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>{bundle.reason}</p> : null}
        <BundleSource source={bundle.source} />
        <p className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
          {bundle.source.kind === 'nightly' ? (
            <>
              <span>{bundle.source.label}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{bundle.agent_label}</span>
          <span aria-hidden="true">·</span>
          {bundle.record ? (
            <>
              {bundle.record.can_open === false ? (
                <span>{bundle.record.name}</span>
              ) : (
                <Link to={recordPath(bundle.record)} className={LINK}>
                  {bundle.record.name}
                </Link>
              )}
              <span aria-hidden="true">·</span>
              <span>{bundleForText(bundle)}</span>
            </>
          ) : (
            <span>{bundleForText(bundle)}</span>
          )}
        </p>
        {bundle.escalation ? <EscalationHandler escalation={bundle.escalation} recordName={bundle.record?.name ?? ''} onChange={changeHandler} /> : null}
        <ListCard label={BUNDLE.STEPS}>
          {displayOrder(bundle).map((step) => (
            <BundleStep
              key={step.id}
              bundle={bundle}
              step={step}
              runsLast={bundle.escalation && step.kind === 'slack.reply' ? runsLastText(bundle) : undefined}
              entry={current[step.id]}
              errors={refusal.fields[step.id] ?? {}}
              ticking={editing}
              editing={editing || bundle.status === 'partly_done'}
              saving={saving[step.id] ?? null}
              onLeave={() => {
                if (mode !== 'discard') void saveIt(step.id, false);
              }}
              onToggle={(selected) => {
                const entry = { ...current[step.id], selected };
                edit(step.id, () => entry);
                void saveIt(step.id, true, entry);
              }}
              onField={(key, value) => edit(step.id, (entry) => ({ ...entry, fields: { ...entry.fields, [key]: value } }))}
              onUndone={(_action, text) => {
                say(text);
                load.retry();
                feedChanged();
                taskChanged();
              }}
              retry={
                step.status === 'failed' ? (
                  <button type="button" onClick={() => void retryIt(step.id)} aria-disabled={retrying === step.id || undefined} className={`${BUTTON} self-start`}>
                    {retrying === step.id ? BUNDLE.RETRYING : BUNDLE.RETRY}
                  </button>
                ) : undefined
              }
            />
          ))}
        </ListCard>
      </div>
    );

  const count = bundle && current ? selectedCount(bundle, current) : 0;
  // Held while Refresh asks the agent again: the steps are about to change.
  const openReject = () => {
    if (!refreshing.busy) setMode('reject');
  };
  // A lost bundle is never named: no footer at all (privacy).
  let footer: ReactNode | undefined;
  if (load.lost || !bundle) footer = undefined;
  else if (bundle.guided) footer = guided.showsBar ? <GuidedAnswerBar guided={guided} /> : undefined;
  else if (mode === 'discard') {
    footer = (
      <div role="group" aria-label={BUNDLE.DISCARD_TITLE} className="flex flex-wrap items-center gap-2">
        <p className={`${TYPE.body} font-semibold`}>{BUNDLE.DISCARD_TITLE}</p>
        <button type="button" onClick={onClose} className={DANGER}>
          {BUNDLE.DISCARD}
        </button>
        <button ref={keepRef} type="button" onClick={keepEditing} className={QUIET}>
          {BUNDLE.KEEP}
        </button>
      </div>
    );
  } else if (mode === 'reject') {
    footer = (
      <BundleReject
        bundle={bundle}
        value={rejecting}
        onChange={setRejecting}
        onCancel={() => {
          setRejecting(NO_REJECT);
          refocus.current = 'reject';
          setMode('run');
        }}
        onDone={(next, line) => {
          feedChanged();
          taskChanged();
          setRejecting(NO_REJECT);
          setMode('run');
          if (next === null) load.lose();
          else {
            replaceAll(next);
            if (line) setRefusal({ ...NO_REFUSAL, form: line });
            else say(BUNDLE.REJECTED);
          }
        }}
      />
    );
  } else if (editing && bundle.can_run) {
    footer = (
      <div className="flex flex-wrap items-center gap-2">
        <button ref={runRef} type="button" onClick={() => void runIt()} aria-disabled={busy || refreshing.busy || count === 0 || undefined} className={PRIMARY}>
          {busy ? BUNDLE.RUNNING : runLabel(count)}
        </button>
        {bundle.can_reject ? (
          <button ref={rejectRef} type="button" onClick={openReject} aria-disabled={refreshing.busy || undefined} className={BUTTON}>
            {BUNDLE.REJECT}
          </button>
        ) : null}
      </div>
    );
  } else if (editing && bundle.can_reject) {
    footer = (
      <button ref={rejectRef} type="button" onClick={openReject} aria-disabled={refreshing.busy || undefined} className={BUTTON}>
        {BUNDLE.REJECT}
      </button>
    );
  }

  return (
    <Sheet
      title={load.lost ? BUNDLE.LOST : bundle ? bundle.title : BUNDLE.LOADING}
      isSm={isSm}
      size="wide"
      phone="full"
      focus="heading"
      footer={footer}
      returnFocus={fallbackFocus}
      onClose={() => void requestClose()}
    >
      {body}
    </Sheet>
  );
}
