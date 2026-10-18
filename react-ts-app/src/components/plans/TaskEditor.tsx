import { useId, useMemo, useState, type FormEvent } from 'react';
import { useMembers } from '../../features/knowledge/useMembers';
import { addTask, updateTask } from '../../features/plans/planApi';
import { NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK, TASK_TITLE_MAX } from '../../features/plans/planOptions';
import { dateBounds, dateCheck } from '../../features/plans/planText';
import type { PersonRef, Plan, PlanTask, Priority } from '../../features/plans/planTypes';
import { Field } from '../rules/Field';
import { BUTTON, FOCUS, INPUT, INVALID, NUM, QUIET, Select } from '../ui';
import { PersonSelect, PrioritySelect } from './fields';
import { FORM_REFUSAL, useRefusalFocus } from './useRefusalFocus';
import { useSubmitOnce } from './useSubmitOnce';

const FIELDS = ['title', 'assignee', 'due_date', 'priority', 'milestone'] as const;

/** A plan task's inline form: a new one under a milestone (`task` null; the
 *  plan's owner and the milestone's date to start), or an existing one,
 *  which can also move to another milestone. */
export function TaskEditor({ plan, milestoneId, task, onDone, onReplace }: {
  plan: Plan;
  milestoneId: number;
  task: PlanTask | null;
  onDone: () => void;
  onReplace: (plan: Plan) => void;
}) {
  const members = useMembers();
  const people = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active).map(({ id, name }) => ({ id, name })), [members]);
  const milestone = plan.milestones.find((one) => one.id === milestoneId);
  // Named even when no longer active: the task's assignee, the plan's owner.
  const known = useMemo(() => (task?.assignee ? [task.assignee, plan.owner] : [plan.owner]), [task, plan.owner]);
  const [title, setTitle] = useState(task?.title ?? '');
  const [assignee, setAssignee] = useState<number>(task?.assignee?.id ?? plan.owner.id);
  const [due, setDue] = useState(task?.due_date ?? milestone?.due_date ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [target, setTarget] = useState(milestoneId);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce();
  const titleId = useId();
  const assigneeId = useId();
  const dueId = useId();
  const priorityId = useId();
  const milestoneSelectId = useId();
  // A refusal with no field takes focus (spec §2.2/§2.3).
  const { ref: formRef, focusRefusal } = useRefusalFocus<HTMLFormElement>(FORM_REFUSAL);
  const refuse = (next: PlanErrors) => {
    setErrors(next);
    if (next.form) focusRefusal();
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!title.trim()) field.title = CHECK.TASK_TITLE;
    const late = dateCheck(due, plan.start_date);
    if (late) field.due_date = late;
    if (Object.keys(field).length > 0) {
      setErrors({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const body = { milestone: target, title: title.trim(), priority, due_date: due, assignee };
    const outcome = await run(() => (task ? updateTask(plan.id, task.id, body) : addTask(plan.id, body)));
    if (!outcome) return;
    if (outcome.ok) {
      onReplace(outcome.value);
      onDone();
    } else {
      refuse(planErrors(outcome.error, FIELDS, 'Could not save this task.'));
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => void save(event)}
      aria-label={task ? `Edit ${task.title}` : `New task in ${milestone?.name ?? 'this milestone'}`}
      noValidate
      className="grid items-start gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_7rem]"
    >
      {errors.form ? (
        <p role="alert" data-error tabIndex={-1} className={`text-[13px] leading-5 text-danger-ink sm:col-span-4 ${FOCUS}`}>
          {errors.form}
        </p>
      ) : null}
      <Field id={titleId} label="Task" error={errors.field.title}>
        {(aria) => <input id={titleId} {...aria} value={title} maxLength={TASK_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} className={`${INPUT} ${INVALID}`} />}
      </Field>
      <Field id={assigneeId} label="Assignee" error={errors.field.assignee}>
        {(aria) => <PersonSelect id={assigneeId} aria={aria} value={assignee} people={people} known={known} onChange={setAssignee} />}
      </Field>
      <Field id={dueId} label="Due" error={errors.field.due_date}>
        {(aria) => <input id={dueId} {...aria} type="date" {...dateBounds(plan.start_date)} value={due} onChange={(event) => setDue(event.target.value)} className={`${INPUT} ${INVALID} ${NUM}`} />}
      </Field>
      <Field id={priorityId} label="Priority" error={errors.field.priority}>
        {(aria) => <PrioritySelect id={priorityId} aria={aria} value={priority} onChange={setPriority} />}
      </Field>
      {task ? (
        <div className="sm:col-span-2">
          <Field id={milestoneSelectId} label="Milestone" error={errors.field.milestone}>
            {(aria) => (
              <Select
                id={milestoneSelectId}
                label="Milestone"
                labelPosition="external"
                invalid={aria['aria-invalid']}
                describedBy={aria['aria-describedby']}
                value={String(target)}
                onChange={(next) => setTarget(Number(next))}
                options={plan.milestones.map((one) => ({ value: String(one.id), label: one.name }))}
              />
            )}
          </Field>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? 'Saving…' : task ? 'Save task' : 'Add task'}
        </button>
        <button type="button" onClick={onDone} className={QUIET}>
          Cancel
        </button>
      </div>
    </form>
  );
}
