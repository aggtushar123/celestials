import { useId, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { addMilestone, deleteMilestone, reorderMilestones, updateMilestone } from '../../features/plans/planApi';
import { firstError, NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK, MILESTONES_MAX, NAME_MAX, SAY } from '../../features/plans/planOptions';
import { dateBounds, dateCheck } from '../../features/plans/planText';
import type { Milestone, Plan } from '../../features/plans/planTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { Field } from '../rules/Field';
import { BUTTON, Card, DANGER, FOCUS, ICON_BUTTON, INPUT, INVALID, NUM, TYPE } from '../ui';
import { FORM_REFUSAL, useRefusalFocus } from './useRefusalFocus';
import { useSubmitOnce } from './useSubmitOnce';

const ICON = `${ICON_BUTTON} border border-line`;
const FIELDS = ['name', 'due_date'] as const;

/** A milestone's inline form (Decision 8): rename, re-date, move up or
 *  down (no drag), remove after asking. A plan keeps at least one
 *  milestone (Contract note 19), so the only one can't be removed. */
export function MilestoneEditor({ plan, milestone, index, onReplace }: { plan: Plan; milestone: Milestone; index: number; onReplace: (plan: Plan) => void }) {
  const nameId = useId();
  const dueId = useId();
  const keepId = useId();
  // Work done is never deleted with a milestone (the server refuses it, hidden
  // tasks included); the visible part is known here, so say so up front.
  const workDone = milestone.tasks_done > 0;
  const [name, setName] = useState(milestone.name);
  const [due, setDue] = useState(milestone.due_date);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const [removing, setRemoving] = useState(false);
  const { busy, run } = useSubmitOnce();
  const last = plan.milestones.length - 1;
  // A refusal with no field takes focus (spec §2.2/§2.3).
  const { ref: formRef, focusRefusal } = useRefusalFocus<HTMLFormElement>(FORM_REFUSAL);
  const refuse = (next: PlanErrors) => {
    setErrors(next);
    if (next.form) focusRefusal();
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!name.trim()) field.name = CHECK.MILESTONE_NAME;
    const late = dateCheck(due, plan.start_date);
    if (late) field.due_date = late;
    if (Object.keys(field).length > 0) {
      setErrors({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => updateMilestone(plan.id, milestone.id, { name: name.trim(), due_date: due }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else refuse(planErrors(outcome.error, FIELDS, 'Could not save this milestone.'));
  }

  async function move(by: -1 | 1) {
    const order = plan.milestones.map((one) => one.id);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    const outcome = await run(() => reorderMilestones(plan.id, order));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else refuse({ form: firstError(planErrors(outcome.error, [], 'Could not move this milestone.')), field: {}, milestones: [] });
  }

  return (
    <>
    <form ref={formRef} onSubmit={(event) => void save(event)} aria-label={`Edit ${milestone.name}`} noValidate className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-48">
        <Field id={nameId} label="Milestone name" error={errors.field.name}>
          {(aria) => <input id={nameId} {...aria} value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} className={`${INPUT} ${INVALID}`} />}
        </Field>
      </div>
      <div className="w-full sm:w-40">
        <Field id={dueId} label="Milestone due" error={errors.field.due_date}>
          {(aria) => (
            <input id={dueId} {...aria} type="date" {...dateBounds(plan.start_date)} value={due} onChange={(event) => setDue(event.target.value)} className={`${INPUT} ${INVALID} ${NUM}`} />
          )}
        </Field>
      </div>
      <button type="submit" disabled={busy} className={BUTTON}>
        Save
      </button>
      <button type="button" aria-label={`Move ${milestone.name} up`} disabled={busy || index === 0} onClick={() => void move(-1)} className={ICON}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" aria-label={`Move ${milestone.name} down`} disabled={busy || index === last} onClick={() => void move(1)} className={ICON}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${milestone.name}`}
        aria-describedby={workDone ? keepId : undefined}
        disabled={busy || plan.milestones.length === 1 || workDone}
        onClick={() => setRemoving(true)}
        className={DANGER}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Remove
      </button>
      {workDone ? (
        <p id={keepId} className={`basis-full ${TYPE.meta}`}>
          {SAY.MILESTONE_HAS_DONE_WORK}
        </p>
      ) : null}
      {errors.form ? (
        <p role="alert" data-error tabIndex={-1} className={`basis-full text-[11px] leading-4 text-danger-ink ${FOCUS}`}>
          {errors.form}
        </p>
      ) : null}
    </form>
      {removing ? (
        <ConfirmDialog
          title={`Remove ${milestone.name}?`}
          message={milestone.tasks_total + milestone.hidden_tasks > 0 ? 'Its tasks are deleted with it.' : 'It has no tasks.'}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            try {
              onReplace(await deleteMilestone(plan.id, milestone.id));
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not remove this milestone.'));
            }
          }}
          onClose={() => setRemoving(false)}
        />
      ) : null}
    </>
  );
}

/** "Add milestone" at the end of the timeline in Edit, up to 12. */
export function AddMilestone({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  const nameId = useId();
  const dueId = useId();
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce();
  const full = plan.milestones.length >= MILESTONES_MAX;
  // A refusal with no field takes focus (spec §2.2/§2.3).
  const { ref: formRef, focusRefusal } = useRefusalFocus<HTMLFormElement>(FORM_REFUSAL);
  const refuse = (next: PlanErrors) => {
    setErrors(next);
    if (next.form) focusRefusal();
  };

  async function add(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!name.trim()) field.name = CHECK.MILESTONE_NAME;
    const late = dateCheck(due, plan.start_date);
    if (late) field.due_date = late;
    if (Object.keys(field).length > 0) {
      setErrors({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => addMilestone(plan.id, { name: name.trim(), due_date: due }));
    if (!outcome) return;
    if (outcome.ok) {
      onReplace(outcome.value);
      setName('');
      setDue('');
    } else {
      refuse(planErrors(outcome.error, FIELDS, 'Could not add this milestone.'));
    }
  }

  return (
    <Card as="div">
      <form ref={formRef} onSubmit={(event) => void add(event)} aria-label="New milestone" noValidate className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <Field id={nameId} label="New milestone" error={errors.field.name}>
            {(aria) => <input id={nameId} {...aria} value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} className={`${INPUT} ${INVALID}`} />}
          </Field>
        </div>
        <div className="w-full sm:w-40">
          <Field id={dueId} label="New milestone due" error={errors.field.due_date}>
            {(aria) => (
              <input id={dueId} {...aria} type="date" {...dateBounds(plan.start_date)} value={due} onChange={(event) => setDue(event.target.value)} className={`${INPUT} ${INVALID} ${NUM}`} />
            )}
          </Field>
        </div>
        <button type="submit" disabled={busy || full} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add milestone
        </button>
        <p className={`basis-full ${TYPE.meta}`}>
          <span className={NUM}>
            {plan.milestones.length}/{MILESTONES_MAX}
          </span>{' '}
          milestones
        </p>
        {errors.form ? (
          <p role="alert" data-error tabIndex={-1} className={`basis-full text-[11px] leading-4 text-danger-ink ${FOCUS}`}>
            {errors.form}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
