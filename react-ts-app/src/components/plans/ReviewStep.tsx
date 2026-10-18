import { useId } from 'react';
import { Plus, X } from 'lucide-react';
import { assigneeOf, newTask, taskCount, withStart, type DraftMilestone, type DraftTask, type StartDraft } from '../../features/plans/planDraft';
import type { NestedErrors, PlanErrors } from '../../features/plans/planErrors';
import { MILESTONES_MAX, NAME_MAX, TASK_TITLE_MAX, TASKS_MAX } from '../../features/plans/planOptions';
import { dateBounds } from '../../features/plans/planText';
import type { PersonRef } from '../../features/plans/planTypes';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { Field } from '../rules/Field';
import { PersonSelect, PrioritySelect } from './fields';
import { INPUT } from './styles';

const ICON_BUTTON = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');
const NONE: NestedErrors = { field: {}, tasks: [] };

function ReviewTask({ index, task, assignee, people, start, errors, onChange, onRemove }: {
  index: number;
  start: string;
  task: DraftTask;
  assignee: number;
  people: PersonRef[];
  errors: Record<string, string>;
  onChange: (next: DraftTask) => void;
  onRemove: () => void;
}) {
  const titleId = useId();
  const assigneeId = useId();
  const dueId = useId();
  const priorityId = useId();
  return (
    <li data-task-draft={index} className="grid items-start gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_7rem_auto]">
      <Field id={titleId} label="Task" error={errors.title}>
        {(aria) => (
          <input id={titleId} {...aria} value={task.title} maxLength={TASK_TITLE_MAX} onChange={(event) => onChange({ ...task, title: event.target.value })} className={`${INPUT} ${border(errors.title)}`} />
        )}
      </Field>
      <Field id={assigneeId} label="Assignee" error={errors.assignee}>
        {(aria) => <PersonSelect id={assigneeId} aria={aria} value={assignee} people={people} onChange={(id) => onChange({ ...task, assignee: id, role: null })} />}
      </Field>
      <Field id={dueId} label="Due" error={errors.due_date}>
        {(aria) => (
          <input id={dueId} {...aria} type="date" {...dateBounds(start)} value={task.due_date} onChange={(event) => onChange({ ...task, due_date: event.target.value })} className={`${INPUT} ${MONO} ${border(errors.due_date)}`} />
        )}
      </Field>
      <Field id={priorityId} label="Priority" error={errors.priority}>
        {(aria) => <PrioritySelect id={priorityId} aria={aria} value={task.priority} onChange={(priority) => onChange({ ...task, priority })} />}
      </Field>
      <button type="button" onClick={onRemove} aria-label={`Remove ${task.title.trim() || 'this task'}`} className={`${ICON_BUTTON} self-end`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function ReviewMilestone({ index, milestone, owner, people, recordOwner, start, canAdd, errors, onChange }: {
  index: number;
  start: string;
  milestone: DraftMilestone;
  owner: number;
  people: PersonRef[];
  recordOwner: number | null;
  canAdd: boolean;
  errors: NestedErrors;
  onChange: (next: DraftMilestone) => void;
}) {
  const nameId = useId();
  const dueId = useId();
  const setTask = (at: number, next: DraftTask) => onChange({ ...milestone, tasks: milestone.tasks.map((task, i) => (i === at ? next : task)) });
  return (
    <li data-milestone-draft={index} className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <Field id={nameId} label="Milestone" error={errors.field.name}>
          {(aria) => (
            <input id={nameId} {...aria} value={milestone.name} maxLength={NAME_MAX} onChange={(event) => onChange({ ...milestone, name: event.target.value })} className={`${INPUT} ${border(errors.field.name)}`} />
          )}
        </Field>
        <Field id={dueId} label="Milestone due" error={errors.field.due_date}>
          {(aria) => (
            <input
              id={dueId}
              {...aria}
              type="date"
              {...dateBounds(start)}
              value={milestone.due_date}
              onChange={(event) => onChange({ ...milestone, due_date: event.target.value })}
              className={`${INPUT} ${MONO} ${border(errors.field.due_date)}`}
            />
          )}
        </Field>
      </div>
      {milestone.tasks.length > 0 ? (
        <ul aria-label={`Tasks in ${milestone.name.trim() || 'this milestone'}`} className="flex flex-col divide-y divide-line-subtle">
          {milestone.tasks.map((task, at) => (
            <ReviewTask
              key={task.key}
              index={at}
              task={task}
              assignee={assigneeOf(task, owner, recordOwner)}
              people={people}
              start={start}
              errors={errors.tasks[at] ?? {}}
              onChange={(next) => setTask(at, next)}
              onRemove={() => onChange({ ...milestone, tasks: milestone.tasks.filter((_, i) => i !== at) })}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-ink-muted">No tasks: it is marked done by hand.</p>
      )}
      <button type="button" onClick={() => onChange({ ...milestone, tasks: [...milestone.tasks, newTask(milestone)] })} disabled={!canAdd} className={`${QUIET} self-start`}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add task
      </button>
    </li>
  );
}

/** 3. Review (spec §2.2): the name, the owner and the start date; then each
 *  milestone with its computed due date and its tasks, each role resolved
 *  to a real person, all editable before the plan starts. */
export function ReviewStep({ draft, people, recordOwner, errors, onChange }: {
  draft: StartDraft;
  people: PersonRef[];
  recordOwner: number | null;
  errors: PlanErrors;
  onChange: (next: StartDraft) => void;
}) {
  const headingId = useId();
  const nameId = useId();
  const ownerId = useId();
  const startId = useId();
  const total = taskCount(draft);
  const setMilestone = (at: number, next: DraftMilestone) => onChange({ ...draft, milestones: draft.milestones.map((milestone, i) => (i === at ? next : milestone)) });
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        3. Review
      </h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_11rem]">
        <Field id={nameId} label="Name" error={errors.field.name}>
          {(aria) => (
            <input id={nameId} {...aria} value={draft.name} maxLength={NAME_MAX} onChange={(event) => onChange({ ...draft, name: event.target.value })} className={`${INPUT} ${border(errors.field.name)}`} />
          )}
        </Field>
        <Field id={ownerId} label="Owner" error={errors.field.owner}>
          {(aria) => <PersonSelect id={ownerId} aria={aria} value={draft.owner} people={people} onChange={(owner) => onChange({ ...draft, owner })} />}
        </Field>
        <Field id={startId} label="Start date" error={errors.field.start_date}>
          {(aria) => (
            <input id={startId} {...aria} type="date" value={draft.start_date} onChange={(event) => onChange(withStart(draft, event.target.value))} className={`${INPUT} ${MONO} ${border(errors.field.start_date)}`} />
          )}
        </Field>
      </div>
      <p data-part="counts" className="text-[11px] text-ink-muted">
        <span className={MONO}>
          {draft.milestones.length}/{MILESTONES_MAX}
        </span>{' '}
        milestones · <span className={MONO}>{total}/{TASKS_MAX}</span> tasks
      </p>
      {errors.field.milestones ? (
        <p role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
          {errors.field.milestones}
        </p>
      ) : null}
      <ol aria-label="Milestones to start" className="flex flex-col gap-3">
        {draft.milestones.map((milestone, at) => (
          <ReviewMilestone
            key={milestone.key}
            index={at}
            milestone={milestone}
            owner={draft.owner}
            people={people}
            recordOwner={recordOwner}
            start={draft.start_date}
            canAdd={total < TASKS_MAX}
            errors={errors.milestones[at] ?? NONE}
            onChange={(next) => setMilestone(at, next)}
          />
        ))}
      </ol>
    </section>
  );
}
