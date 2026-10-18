import { useId } from 'react';
import { Gauge, Smile, ThumbsUp } from 'lucide-react';
import { segmentKindOf } from '../../features/campaigns/campaignText';
import { SAY } from '../../features/plans/planOptions';
import type { LifecycleDraft } from '../../features/rules/ruleDraft';
import type { ActionErrors } from '../../features/rules/ruleErrors';
import { ASSIGNEE_LABEL, DUE_MAX, MESSAGE_MAX, NOTIFY_TO_LABEL, PEOPLE_MAX, SAY as RULE_SAY, STAGES, TITLE_MAX } from '../../features/rules/ruleOptions';
import { SURVEY_LIMIT_NOTE } from '../../features/rules/ruleText';
import type { Assignee, CampaignAction, NotifyAction, NotifyTo, PlanAction, SurveyAction, TaskAction } from '../../features/rules/ruleTypes';
import type { PersonRef, SegmentKind } from '../../features/segments/segmentTypes';
import { INTRO_MAX, SUBJECT_MAX, TYPE_HINT, TYPE_LABEL } from '../../features/surveys/questions';
import { useMyCampaigns } from '../campaigns/useMyCampaigns';
import { useTemplates } from '../plans/useTemplates';
import { Chip } from '../segments/Chip';
import { RadioTile } from '../segments/RadioTile';
import { RoleFields } from '../surveys/RoleFields';
import { ConfirmedSwitch } from './ConfirmedSwitch';
import { BUTTON, FOCUS, INPUT, INVALID, NUM, Select, TYPE } from '../ui';
import { Field } from './Field';

const NOTIFY_TO: readonly NotifyTo[] = ['me', 'record_owner', 'people'];
const ASSIGNEES: readonly Assignee[] = ['record_owner', 'me'];
const TYPES = [
  { value: 'nps', icon: ThumbsUp },
  { value: 'csat', icon: Smile },
  { value: 'ces', icon: Gauge },
] as const;

function Count({ n, max }: { n: number; max: number }) {
  return (
    <>
      <span className={NUM}>{n}</span> of <span className={NUM}>{max}</span>
    </>
  );
}

/** Notify (backend Decision 8): me, each record's owner, or chosen
 *  teammates (1–50), with an optional note. Each person is told only
 *  about the records they may open (spec §3). */
export function NotifyFields({ action, teammates, errors, onChange }: { action: NotifyAction; teammates: PersonRef[]; errors: ActionErrors; onChange: (next: NotifyAction) => void }) {
  const toId = useId();
  const pickId = useId();
  const messageId = useId();
  const nameOf = (id: number) => teammates.find((person) => person.id === id)?.name ?? `Teammate ${id}`;
  const rest = teammates.filter((person) => !action.people.includes(person.id));
  return (
    <div className="flex flex-col gap-3">
      <Field id={toId} label="Who" error={errors.to}>
        {(aria) => (
          <Select
            id={toId}
            label="Who"
            labelPosition="external"
            invalid={aria['aria-invalid']}
            describedBy={aria['aria-describedby']}
            value={action.to}
            onChange={(to) => onChange({ ...action, to, people: to === 'people' ? action.people : [] })}
            options={NOTIFY_TO.map((to) => ({ value: to, label: NOTIFY_TO_LABEL[to] }))}
          />
        )}
      </Field>
      {action.to === 'people' ? (
        <Field id={pickId} label="Teammates" hint="Each is told only about the records they may open." error={errors.people}>
          {(aria) => (
            <div className="flex flex-col gap-2">
              {action.people.length > 0 ? (
                <ul aria-label="Teammates to notify" className="flex flex-wrap gap-1.5">
                  {action.people.map((id) => (
                    <Chip key={id} name={nameOf(id)} onRemove={() => onChange({ ...action, people: action.people.filter((chosen) => chosen !== id) })} />
                  ))}
                </ul>
              ) : null}
              <Select
                id={pickId}
                label="Teammates"
                labelPosition="external"
                className="self-start"
                invalid={aria['aria-invalid']}
                describedBy={aria['aria-describedby']}
                value=""
                disabled={action.people.length >= PEOPLE_MAX}
                onChange={(value) => {
                  const id = Number(value);
                  if (id) onChange({ ...action, people: [...action.people, id] });
                }}
                options={[{ value: '', label: 'Add a teammate…' }, ...rest.map((person) => ({ value: String(person.id), label: person.name }))]}
              />
            </div>
          )}
        </Field>
      ) : null}
      <Field id={messageId} label="Message (optional)" hint={<Count n={action.message.length} max={MESSAGE_MAX} />} error={errors.message}>
        {(aria) => (
          <textarea
            id={messageId}
            {...aria}
            rows={2}
            maxLength={MESSAGE_MAX}
            value={action.message}
            placeholder="A note under the digest"
            onChange={(event) => onChange({ ...action, message: event.target.value })}
            className={`${INPUT} ${INVALID} resize-none py-2`}
          />
        )}
      </Field>
    </div>
  );
}

/** Create a task (backend Decision 9): one per organisation or account a
 *  night, priority medium, due N days after the night. */
export function TaskFields({ action, errors, onChange }: { action: TaskAction; errors: ActionErrors; onChange: (next: TaskAction) => void }) {
  const titleId = useId();
  const assigneeId = useId();
  const dueId = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_8rem]">
      <Field id={titleId} label="Task title" error={errors.title}>
        {(aria) => (
          <input
            id={titleId}
            {...aria}
            value={action.title}
            maxLength={TITLE_MAX}
            placeholder="Call to check in"
            onChange={(event) => onChange({ ...action, title: event.target.value })}
            className={`${INPUT} ${INVALID}`}
          />
        )}
      </Field>
      <Field id={assigneeId} label="Assign to" error={errors.assignee}>
        {(aria) => (
          <Select
            id={assigneeId}
            label="Assign to"
            labelPosition="external"
            invalid={aria['aria-invalid']}
            describedBy={aria['aria-describedby']}
            value={action.assignee}
            onChange={(assignee) => onChange({ ...action, assignee })}
            options={ASSIGNEES.map((assignee) => ({ value: assignee, label: ASSIGNEE_LABEL[assignee] }))}
          />
        )}
      </Field>
      <Field id={dueId} label="Due in (days)" error={errors.due_in_days}>
        {(aria) => (
          <input
            id={dueId}
            {...aria}
            type="number"
            inputMode="numeric"
            min={0}
            max={DUE_MAX}
            step={1}
            value={Number.isNaN(action.due_in_days) ? '' : action.due_in_days}
            onChange={(event) => onChange({ ...action, due_in_days: event.target.value === '' ? Number.NaN : Number(event.target.value) })}
            className={`${INPUT} ${INVALID} ${NUM}`}
          />
        )}
      </Field>
    </div>
  );
}

/** Change lifecycle (backend Decision 10): the stage only, chosen first
 *  (plan Decision 10). */
export function LifecycleFields({ action, errors, onChange }: { action: LifecycleDraft; errors: ActionErrors; onChange: (next: LifecycleDraft) => void }) {
  const stageId = useId();
  return (
    <Field id={stageId} label="Stage" hint={action.stage === 'churn' ? 'Churn sets the stage only; it does not record a churn date.' : null} error={errors.stage}>
      {(aria) => (
        <Select
          id={stageId}
          label="Stage"
          labelPosition="external"
          invalid={aria['aria-invalid']}
          describedBy={aria['aria-describedby']}
          value={action.stage}
          onChange={(stage) => onChange({ ...action, stage })}
          options={[{ value: '', label: 'Choose a stage…' }, ...STAGES.map((stage) => ({ value: stage.value, label: stage.label }))]}
        />
      )}
    </Field>
  );
}

/** Send a survey (spec §2.2): Surveys' type, subject, intro and roles; the
 *  500-person note; Send without review, off by default, asked first. */
/** A refusal only the server sends, for a control with no field of its own
 *  to mark; focusable, as the builder focuses the first error. */
function CardError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" data-error tabIndex={-1} className={`text-[11px] leading-4 text-danger-ink ${FOCUS}`}>
      {message}
    </p>
  );
}

export function SurveyFields({ action, kind, errors, onChange }: { action: SurveyAction; kind: SegmentKind | null; errors: ActionErrors; onChange: (next: SurveyAction) => void }) {
  const typeName = useId();
  const subjectId = useId();
  const introId = useId();
  const reviewId = useId();
  return (
    <div className="flex flex-col gap-3">
      <fieldset aria-describedby={`${typeName}-hint`} className="flex flex-col gap-2">
        <legend className={`mb-1 ${TYPE.label}`}>Survey type</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TYPES.map((option) => (
            <RadioTile
              key={option.value}
              name={typeName}
              label={TYPE_LABEL[option.value]}
              icon={option.icon}
              checked={action.survey_type === option.value}
              onChange={() => onChange({ ...action, survey_type: option.value })}
            />
          ))}
        </div>
        <p id={`${typeName}-hint`} className={TYPE.meta}>
          {TYPE_HINT[action.survey_type]}
        </p>
        <CardError message={errors.survey_type} />
      </fieldset>
      <Field id={subjectId} label="Email subject" error={errors.subject}>
        {(aria) => (
          <input id={subjectId} {...aria} value={action.subject} maxLength={SUBJECT_MAX} onChange={(event) => onChange({ ...action, subject: event.target.value })} className={`${INPUT} ${INVALID}`} />
        )}
      </Field>
      <Field id={introId} label="Intro line (optional)" hint={<Count n={action.intro.length} max={INTRO_MAX} />} error={errors.intro}>
        {(aria) => (
          <textarea
            id={introId}
            {...aria}
            rows={2}
            maxLength={INTRO_MAX}
            value={action.intro}
            placeholder="A line above the question, in your own words"
            onChange={(event) => onChange({ ...action, intro: event.target.value })}
            className={`${INPUT} ${INVALID} resize-none py-2`}
          />
        )}
      </Field>
      <RoleFields kind={kind} roles={action.roles} error={errors.roles} onRoles={(roles) => onChange({ ...action, roles })} />
      <p data-part="survey-limit" className={TYPE.meta}>
        {SURVEY_LIMIT_NOTE}
      </p>
      <ConfirmedSwitch
        label="Send without review"
        checked={action.without_review}
        onChange={(on) => onChange({ ...action, without_review: on })}
        describedBy={reviewId}
        confirm={{
          title: 'Send without review?',
          message: "Each night's survey goes to the matched people at once instead of waiting in Waiting on you. Every Surveys rule still holds.",
          confirmLabel: 'Send without review',
        }}
      />
      <p id={reviewId} className={action.without_review ? 'text-[11px] leading-4 text-warning-ink' : TYPE.meta}>
        {action.without_review ? 'Surveys go out at night without you seeing them first.' : "Off: each night's survey waits in Waiting on you until you approve it."}
      </p>
      <CardError message={errors.without_review} />
    </div>
  );
}

/** Start a plan (plans spec §1.8, §2.5): a template the rule's owner can
 *  use. It runs at once, as the owner; a record that already has an open
 *  plan from it is left as it is. A contact's plan goes on its organisation
 *  or account. */
export function PlanFields({ action, errors, onChange }: { action: PlanAction; errors: ActionErrors; onChange: (next: PlanAction) => void }) {
  const id = useId();
  const [load, retry] = useTemplates();
  const lists = load.status === 'ready' ? load.lists : null;
  const all = lists ? [...lists.builtin, ...lists.mine, ...lists.shared] : [];
  const template = action.template;
  // A stored template the owner can no longer use (deleted, unshared): shown
  // by name, so the rule still reads, and refused here as the server would.
  const stale = lists && template && !all.some((one) => one.id === template.id) ? template : null;
  const chosen = template && (stale || all.some((one) => one.id === template.id)) ? String(template.id) : '';
  if (load.status === 'failed') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] leading-5 text-danger-ink">
        <span>{load.message}</span>
        <button type="button" onClick={retry} className={BUTTON}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <Field
      id={id}
      label="Template"
      hint="Each record gets one open plan from it; one that already has one is left as it is. A contact's plan goes on its organisation or account."
      error={errors.template ?? (stale ? SAY.CHOOSE_TEMPLATE : undefined)}
    >
      {(aria) => (
        <Select
          id={id}
          label="Template"
          labelPosition="external"
          invalid={aria['aria-invalid']}
          describedBy={aria['aria-describedby']}
          value={chosen}
          disabled={!lists}
          onChange={(value) => {
            const picked = all.find((one) => String(one.id) === value);
            onChange({ ...action, template: picked ? { id: picked.id, name: picked.name } : null });
          }}
          options={[
            { value: '', label: lists ? 'Choose a template…' : 'Loading templates…' },
            ...(stale ? [{ value: String(stale.id), label: stale.name, disabled: true }] : []),
            ...(lists
              ? (
                  [
                    ['Built-in', lists.builtin],
                    ['Yours', lists.mine],
                    ['Shared with you', lists.shared],
                  ] as const
                )
                  .map(([label, list]) => ({ label, options: list.map((one) => ({ value: String(one.id), label: one.name })) }))
                  .filter((group) => group.options.length > 0)
              : []),
          ]}
        />
      )}
    </Field>
  );
}

/** Send a campaign (campaigns spec §1.8, §2.5): one of my campaigns that
 *  isn't archived, on a segment of this rule's kind; it emails the people
 *  the night fired on, by the campaign's own roles. Send without review is
 *  off by default and asked first. */
export function CampaignFields({ action, kind, errors, onChange }: { action: CampaignAction; kind: SegmentKind | null; errors: ActionErrors; onChange: (next: CampaignAction) => void }) {
  const id = useId();
  const reviewId = useId();
  const [load, retry] = useMyCampaigns();
  const usable = load.status === 'ready' ? load.rows.filter((row) => row.status !== 'archived' && row.segment !== null && segmentKindOf(row.segment.kind) === kind) : [];
  const chosen = action.campaign;
  // A stored campaign I can no longer use here (archived, another kind):
  // shown by name, so the rule still reads, and refused as the server would.
  const stale = load.status === 'ready' && chosen && !usable.some((row) => row.id === chosen.id) ? chosen : null;
  if (load.status === 'failed') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] leading-5 text-danger-ink">
        <span>{load.message}</span>
        <button type="button" onClick={retry} className={BUTTON}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Field
        id={id}
        label="Campaign"
        hint={
          kind
            ? "It emails the people the rule fired on, by the campaign's own roles. Anyone it already reached, or emailed by a campaign in the last 3 days, is skipped."
            : 'Choose a segment first to see the campaigns for it.'
        }
        error={errors.campaign ?? (stale ? RULE_SAY.CHOOSE_CAMPAIGN : undefined)}
      >
        {(aria) => (
          <Select
            id={id}
            label="Campaign"
            labelPosition="external"
            invalid={aria['aria-invalid']}
            describedBy={aria['aria-describedby']}
            value={chosen ? String(chosen.id) : ''}
            disabled={load.status !== 'ready' || kind === null}
            onChange={(value) => {
              const picked = usable.find((row) => String(row.id) === value);
              onChange({ ...action, campaign: picked ? { id: picked.id, name: picked.name } : null });
            }}
            options={[
              { value: '', label: load.status === 'ready' ? (usable.length > 0 ? 'Choose a campaign…' : 'No campaigns for this segment yet') : 'Loading your campaigns…' },
              ...(stale ? [{ value: String(stale.id), label: stale.name, disabled: true }] : []),
              ...usable.map((row) => ({ value: String(row.id), label: row.name })),
            ]}
          />
        )}
      </Field>
      <ConfirmedSwitch
        label="Send without review"
        checked={action.without_review}
        onChange={(on) => onChange({ ...action, without_review: on })}
        describedBy={reviewId}
        confirm={{
          title: 'Send without review?',
          message: "Each night's campaign goes to the matched people at once instead of waiting in Waiting on you. Every campaign rule still holds.",
          confirmLabel: 'Send without review',
        }}
      />
      <p id={reviewId} className={action.without_review ? 'text-[11px] leading-4 text-warning-ink' : TYPE.meta}>
        {action.without_review ? 'Campaign emails go out at night without you seeing them first.' : "Off: each night's campaign waits in Waiting on you until you approve it."}
      </p>
      <CardError message={errors.without_review} />
    </div>
  );
}
