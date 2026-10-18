import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { createRule, updateRule } from '../../features/rules/ruleApi';
import { checkDraft, emptyDraft, fromRule, keepsNoSegment, toEdit, toTestBody, toTrigger, toWrite, withKind, type RuleDraft } from '../../features/rules/ruleDraft';
import { hasErrors, NO_ERRORS, ruleErrors, type RuleErrors } from '../../features/rules/ruleErrors';
import { COOLDOWN_MAX, COOLDOWN_MIN, NAME_MAX, NIGHTLY_CAP, scoresFor } from '../../features/rules/ruleOptions';
import { cooldownHint, ruleParts, turnOnText, type SegmentLike } from '../../features/rules/ruleText';
import type { Rule, SurveyAction } from '../../features/rules/ruleTypes';
import type { PersonRef, SegmentKind, Sharing } from '../../features/segments/segmentTypes';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { ActionCards } from '../../components/rules/ActionCards';
import { ConfirmedSwitch } from '../../components/rules/ConfirmedSwitch';
import { Field } from '../../components/rules/Field';
import { TestPanel } from '../../components/rules/TestPanel';
import { TriggerFields } from '../../components/rules/TriggerFields';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { RuleSentence } from '../../components/segments/RuleSentence';
import { SharingFields } from '../../components/segments/SharingFields';
import { BUTTON, FOCUS, INPUT, INVALID, NUM, PRIMARY, QUIET, TYPE } from '../../components/ui';
import { SurveyPreview } from '../../components/surveys/SurveyPreview';
import { useMySegments } from '../../components/surveys/useMySegments';
import type { SegmentOutlet } from '../segments/Builder';
import type { RuleOutlet } from './RulePage';

const SHARING_NOTE = 'Teammates see the rule and its nights, only for records they may open, and a count of the rest. Only you can change it.';

/** The rule builder (spec §2.2) for a new rule or the owner's own. */
function RuleForm({ initial, segmentId, onClose, onDone }: {
  initial: Rule | null;
  segmentId: number | null;
  onClose: () => void;
  onDone: (rule: Rule) => void;
}) {
  const workspace = useAppSelector((state) => state.auth.user?.organisation?.name ?? 'your company');
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo<PersonRef[]>(
    () => members.filter((member) => member.is_active && member.id !== me).map((member) => ({ id: member.id, name: member.name })),
    [members, me],
  );
  const segments = useMySegments();
  const [draft, setDraft] = useState<RuleDraft>(() => (initial ? fromRule(initial) : emptyDraft(segmentId)));
  const [errors, setErrors] = useState<RuleErrors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  // Set at once, before React re-renders: a second submit in the same tick
  // (Enter twice, a double click) must not POST again.
  const savingRef = useRef(false);
  const [dropped, setDropped] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const nameId = useId();
  const cooldownId = useId();
  const limitsId = useId();
  const statusId = useId();
  const statusHeadingId = useId();
  const reasonId = useId();
  const expiresId = useId();

  // After a refusal, focus goes to the first field or message in error, else the form's alert.
  useEffect(() => {
    if (focusTick === 0) return;
    // `data-error`: a refusal with no field to mark (a card's own, roles, a survey's type).
    (bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error]') ?? alertRef.current)?.focus();
  }, [focusTick]);
  const refuse = (found: RuleErrors) => {
    setErrors(found);
    setFocusTick((n) => n + 1);
  };

  const rowOf = (id: number | null) => segments.rows?.find((row) => row.id === id) ?? null;
  const kindOf = (id: number | null): SegmentKind | null => rowOf(id)?.kind ?? (initial?.segment && initial.segment.id === id ? initial.segment.kind : null);
  const kind = kindOf(draft.segment);
  const segmentName = rowOf(draft.segment)?.name ?? (initial?.segment && initial.segment.id === draft.segment ? initial.segment.name : null);
  const segment: SegmentLike = kind && segmentName ? { name: segmentName, kind } : null;
  // A new rule waits for my segments: until then a segment's kind is unknown.
  const loading = !initial && segments.rows === null;

  /** A change; a new segment carries its kind into the actions and the line. */
  const change = (patch: Partial<RuleDraft>) => {
    if ('segment' in patch) {
      // A contact segment drops a lifecycle card; say so under Then.
      setDropped(kindOf(patch.segment ?? null) === 'contact' && draft.actions.some((action) => action.action === 'lifecycle'));
    }
    setDraft((current) => {
      const next = { ...current, ...patch };
      if ('segment' in patch) {
        const nextKind = kindOf(next.segment);
        next.actions = withKind(next.actions, nextKind);
        if (next.score && !scoresFor(nextKind).includes(next.score)) next.score = '';
      }
      return next;
    });
  };

  // Sharing as Segments do it: someone deactivated since is dropped once the members load.
  const shared = members.length > 0 ? draft.sharedWith.filter((person) => teammates.some((mate) => mate.id === person.id)) : draft.sharedWith;
  const ready: RuleDraft = { ...draft, sharedWith: shared };
  const survey = draft.actions.find((action): action is SurveyAction => action.action === 'survey');
  const cooldown = Number(draft.cooldown);
  const hint = cooldownHint(draft.trigger, draft.cadence, cooldown);
  // A new segment or trigger expires the rule's waiting surveys (backend:
  // the PATCH's RESET_FIELDS), so say so before Save.
  const expires = Boolean(initial?.last_run?.waiting) && (draft.segment !== (initial?.segment?.id ?? null) || draft.trigger !== initial?.trigger);
  const saveNotes = [loading ? reasonId : null, expires ? expiresId : null].filter(Boolean).join(' ');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const found = checkDraft(ready, kind);
    // A rule whose segment was deleted may still be renamed or re-shared.
    if (keepsNoSegment(ready, initial)) delete found.field.segment;
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors(NO_ERRORS);
    savingRef.current = true;
    setSaving(true);
    try {
      onDone(initial ? await updateRule(initial.id, toEdit(ready, kind, initial)) : await createRule(toWrite(ready, kind)));
    } catch (err) {
      savingRef.current = false;
      setSaving(false);
      refuse(ruleErrors(err));
    }
  }

  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New rule'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {errors.form ? (
            <p ref={alertRef} role="alert" tabIndex={-1} className={`text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          <div data-part="rule-sentence">
            {draft.segment === null ? (
              <p className={TYPE.bodyMuted}>Choose a segment, and the rule reads here as one sentence.</p>
            ) : segment === null ? (
              <p className={TYPE.bodyMuted}>Loading your segments…</p>
            ) : (
              <RuleSentence parts={ruleParts({ ...toTrigger(draft), actions: draft.actions }, segment)} />
            )}
          </div>
          <div data-part="builder-columns" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="flex min-w-0 flex-col divide-y divide-line-subtle">
              <div className="pb-4">
                <Field id={nameId} label="Name" error={errors.field.name}>
                  {(aria) => (
                    <input
                      id={nameId}
                      {...aria}
                      value={draft.name}
                      maxLength={NAME_MAX}
                      placeholder="Unhappy renewals"
                      onChange={(event) => change({ name: event.target.value })}
                      className={`${INPUT} ${INVALID}`}
                    />
                  )}
                </Field>
              </div>
              <div className="py-4">
                <TriggerFields
                  draft={draft}
                  kind={kind}
                  segments={segments.rows}
                  segmentsError={segments.error}
                  fallback={initial?.segment ?? null}
                  errors={errors.field}
                  onChange={change}
                />
              </div>
              <div className="py-4">
                <ActionCards
                  actions={draft.actions}
                  kind={kind}
                  workspace={workspace}
                  teammates={teammates}
                  errors={errors.action}
                  listError={errors.field.actions}
                  note={dropped ? 'Change lifecycle was removed: contacts have no lifecycle stage.' : ''}
                  onChange={(next) => change({ actions: next })}
                />
              </div>
              <section aria-labelledby={limitsId} className="flex flex-col gap-2 py-4">
                <h3 id={limitsId} className={TYPE.title}>
                  Limits
                </h3>
                <Field
                  id={cooldownId}
                  label="Once per record every (days)"
                  hint={
                    <>
                      At most <span className={NUM}>{NIGHTLY_CAP}</span> records a night; any more that night are counted, not acted on.{hint ? ` ${hint}` : ''}
                    </>
                  }
                  error={errors.field.cooldown_days}
                >
                  {(aria) => (
                    <input
                      id={cooldownId}
                      {...aria}
                      type="number"
                      inputMode="numeric"
                      min={COOLDOWN_MIN}
                      max={COOLDOWN_MAX}
                      step={1}
                      value={draft.cooldown}
                      onChange={(event) => change({ cooldown: event.target.value })}
                      className={`${INPUT} ${INVALID} ${NUM} sm:w-32`}
                    />
                  )}
                </Field>
              </section>
              <div className="py-4">
                <SharingFields
                  sharing={draft.sharing}
                  sharedWith={shared}
                  teammates={teammates}
                  error={errors.field.shared_with ?? errors.field.sharing ?? null}
                  onChange={(sharing: Sharing, sharedWith: PersonRef[]) => change({ sharing, sharedWith })}
                  note={SHARING_NOTE}
                />
              </div>
              <section aria-labelledby={statusHeadingId} className="flex flex-col gap-2 pt-4">
                <h3 id={statusHeadingId} className={TYPE.title}>
                  Status
                </h3>
                <ConfirmedSwitch
                  label="Run every night"
                  checked={draft.isActive}
                  onChange={(on) => change({ isActive: on })}
                  describedBy={statusId}
                  confirm={{ title: `Turn on ${draft.name.trim() || 'this rule'}?`, message: turnOnText(draft.actions, segment), confirmLabel: 'Turn on' }}
                />
                <p id={statusId} className={TYPE.meta}>
                  {draft.isActive ? 'It runs tonight once saved.' : 'Rules are saved off. Turn it on once the test looks right.'}
                </p>
                {errors.field.is_active ? (
                  <p role="alert" className="text-[11px] leading-4 text-danger-ink">
                    {errors.field.is_active}
                  </p>
                ) : null}
              </section>
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
              <TestPanel
                request={draft.segment === null || loading ? null : toTestBody(draft, kind, initial?.id ?? null)}
                blocker={loading ? 'Loading your segments…' : draft.segment === null ? 'Choose a segment to test.' : null}
                kind={kind}
                cooldownDays={cooldown}
                crossed={draft.trigger === 'crossed'}
                onCheck={() => {
                  const found = checkDraft(ready, kind, { forTest: true });
                  if (hasErrors(found)) {
                    refuse(found);
                    return false;
                  }
                  setErrors(NO_ERRORS);
                  return true;
                }}
                onRefused={refuse}
              />
              {survey ? <SurveyPreview type={survey.survey_type} subject={survey.subject} intro={survey.intro} workspace={workspace} /> : null}
            </div>
          </div>
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          {loading ? (
            <p id={reasonId} className={`basis-full ${TYPE.meta} sm:mr-auto sm:basis-auto`}>
              Loading your segments…
            </p>
          ) : null}
          {expires ? (
            <p id={expiresId} className="basis-full text-[11px] leading-4 text-warning-ink sm:mr-auto sm:basis-auto">
              Saving this expires the survey waiting for your review.
            </p>
          ) : null}
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={saving || loading} aria-describedby={saveNotes || undefined} className={PRIMARY}>
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** A new rule over whatever page opened it (the Rules list, or a segment's
 *  Automate with `segmentId`). Saving opens it. */
export function NewRuleModal({ segmentId = null, onClose }: { segmentId?: number | null; onClose: () => void }) {
  const navigate = useNavigate();
  return <RuleForm initial={null} segmentId={segmentId} onClose={onClose} onDone={(rule) => navigate(`/scenarios/rules/${rule.id}`)} />;
}

/** /scenarios/rules/new: the modal over the Rules list (spec §2.1). */
export function NewRuleRoute() {
  const navigate = useNavigate();
  return <NewRuleModal onClose={() => navigate('/scenarios')} />;
}

/** /segments/:id/rule (spec §2.5, plan Decision 18): Automate, the builder
 *  over the segment's page with that segment chosen. The owner's only, as
 *  a rule runs on its owner's own segment. */
export function RuleSegmentRoute() {
  const navigate = useNavigate();
  const { segment } = useOutletContext<SegmentOutlet>();
  const close = () => navigate(`/segments/${segment.id}`);
  if (!segment.is_owner) {
    return (
      <BuilderDialog title="New rule" onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${segment.owner.name} can automate this segment`}
            detail="A rule runs on its owner's own segment. Duplicate it to automate your own copy."
            action={
              <Link to={`/segments/${segment.id}`} className={BUTTON}>
                Open segment
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  return <NewRuleModal segmentId={segment.id} onClose={close} />;
}

/** /scenarios/rules/:id/edit: the builder over the rule's own page, which
 *  has read the rule. Anyone but the owner reads a notice. */
export function EditRuleRoute() {
  const navigate = useNavigate();
  const { rule, onReplace } = useOutletContext<RuleOutlet>();
  const close = () => navigate(`/scenarios/rules/${rule.id}`);
  if (!rule.is_owner) {
    return (
      <BuilderDialog title={`Edit ${rule.name}`} onClose={close}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            title={`Only ${rule.owner.name} can edit this rule`}
            detail="Ask them to change it, or build your own rule on one of your segments."
            action={
              <Link to={`/scenarios/rules/${rule.id}`} className={BUTTON}>
                Open rule
              </Link>
            }
          />
        </div>
      </BuilderDialog>
    );
  }
  return (
    <RuleForm
      initial={rule}
      segmentId={rule.segment?.id ?? null}
      onClose={close}
      onDone={(saved) => {
        onReplace(saved);
        close();
      }}
    />
  );
}
