import { useId } from 'react';
import { Plus, X } from 'lucide-react';
import type { NestedErrors } from '../../features/plans/planErrors';
import { MILESTONES_MAX, NAME_MAX, OFFSET_MAX, ROLE_LABEL, TASK_TITLE_MAX, TASKS_MAX } from '../../features/plans/planOptions';
import type { AssigneeRole } from '../../features/plans/planTypes';
import { newTemplateMilestone, newTemplateTask, type TemplateMilestoneDraft, type TemplateTaskDraft } from '../../features/plans/templateDraft';
import { Field } from '../rules/Field';
import { BUTTON, ICON_BUTTON, INPUT, INVALID, NUM, QUIET, Select } from '../ui';
import { PrioritySelect } from './fields';

const ROLES: readonly AssigneeRole[] = ['record_owner', 'plan_owner'];
const NONE: NestedErrors = { field: {}, tasks: [] };

function TaskFields({ task, errors, onChange, onRemove }: { task: TemplateTaskDraft; errors: Record<string, string>; onChange: (next: TemplateTaskDraft) => void; onRemove: () => void }) {
  const titleId = useId();
  const priorityId = useId();
  const dayId = useId();
  const roleId = useId();
  return (
    <li className="grid items-start gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_11rem_auto]">
      <Field id={titleId} label="Task" error={errors.title}>
        {(aria) => <input id={titleId} {...aria} value={task.title} maxLength={TASK_TITLE_MAX} onChange={(event) => onChange({ ...task, title: event.target.value })} className={`${INPUT} ${INVALID}`} />}
      </Field>
      <Field id={priorityId} label="Priority" error={errors.priority}>
        {(aria) => <PrioritySelect id={priorityId} aria={aria} value={task.priority} onChange={(priority) => onChange({ ...task, priority })} />}
      </Field>
      <Field id={dayId} label="Task day" error={errors.offset_days}>
        {(aria) => (
          <input
            id={dayId}
            {...aria}
            type="number"
            inputMode="numeric"
            min={0}
            max={OFFSET_MAX}
            step={1}
            value={task.offset}
            onChange={(event) => onChange({ ...task, offset: event.target.value })}
            className={`${INPUT} ${INVALID} ${NUM}`}
          />
        )}
      </Field>
      <Field id={roleId} label="Assignee role" error={errors.assignee_role}>
        {(aria) => (
          <Select
            id={roleId}
            label="Assignee role"
            labelPosition="external"
            invalid={aria['aria-invalid']}
            describedBy={aria['aria-describedby']}
            value={task.role}
            onChange={(role) => onChange({ ...task, role })}
            options={ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
          />
        )}
      </Field>
      <button type="button" onClick={onRemove} aria-label={`Remove ${task.title.trim() || 'this task'}`} className={`${ICON_BUTTON} self-end`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function MilestoneFields({ index, milestone, canRemove, canAddTask, errors, onChange, onRemove }: {
  index: number;
  milestone: TemplateMilestoneDraft;
  canRemove: boolean;
  canAddTask: boolean;
  errors: NestedErrors;
  onChange: (next: TemplateMilestoneDraft) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const dayId = useId();
  const setTask = (at: number, next: TemplateTaskDraft) => onChange({ ...milestone, tasks: milestone.tasks.map((task, i) => (i === at ? next : task)) });
  return (
    <li data-template-milestone={index} className="flex flex-col gap-2 py-4 first:pt-0">
      <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
        <Field id={nameId} label="Milestone" error={errors.field.name}>
          {(aria) => <input id={nameId} {...aria} value={milestone.name} maxLength={NAME_MAX} onChange={(event) => onChange({ ...milestone, name: event.target.value })} className={`${INPUT} ${INVALID}`} />}
        </Field>
        <Field id={dayId} label="Day" error={errors.field.offset_days}>
          {(aria) => (
            <input
              id={dayId}
              {...aria}
              type="number"
              inputMode="numeric"
              min={0}
              max={OFFSET_MAX}
              step={1}
              value={milestone.offset}
              onChange={(event) => onChange({ ...milestone, offset: event.target.value })}
              className={`${INPUT} ${INVALID} ${NUM}`}
            />
          )}
        </Field>
        <button type="button" onClick={onRemove} disabled={!canRemove} aria-label={`Remove ${milestone.name.trim() || 'this milestone'}`} className={`${ICON_BUTTON} self-end`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {milestone.tasks.length > 0 ? (
        <ul aria-label={`Tasks in ${milestone.name.trim() || 'this milestone'}`} className="flex flex-col divide-y divide-line-subtle border-l-2 border-line-subtle pl-3">
          {milestone.tasks.map((task, at) => (
            <TaskFields
              key={task.key}
              task={task}
              errors={errors.tasks[at] ?? {}}
              onChange={(next) => setTask(at, next)}
              onRemove={() => onChange({ ...milestone, tasks: milestone.tasks.filter((_, i) => i !== at) })}
            />
          ))}
        </ul>
      ) : null}
      <button type="button" onClick={() => onChange({ ...milestone, tasks: [...milestone.tasks, newTemplateTask(Number(milestone.offset) || 0)] })} disabled={!canAddTask} className={`${QUIET} self-start`}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add task
      </button>
    </li>
  );
}

/** The template editor's milestones (spec §2.4): each a name and a day
 *  from the start, with its tasks; at least one milestone, at most 12, and
 *  at most 50 tasks in all. */
export function TemplateMilestones({ milestones, errors, onChange }: { milestones: TemplateMilestoneDraft[]; errors: NestedErrors[]; onChange: (next: TemplateMilestoneDraft[]) => void }) {
  const tasks = milestones.reduce((n, milestone) => n + milestone.tasks.length, 0);
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Template milestones" className="flex flex-col divide-y divide-line-subtle">
        {milestones.map((milestone, at) => (
          <MilestoneFields
            key={milestone.key}
            index={at}
            milestone={milestone}
            canRemove={milestones.length > 1}
            canAddTask={tasks < TASKS_MAX}
            errors={errors[at] ?? NONE}
            onChange={(next) => onChange(milestones.map((one, i) => (i === at ? next : one)))}
            onRemove={() => onChange(milestones.filter((_, i) => i !== at))}
          />
        ))}
      </ol>
      <button
        type="button"
        onClick={() => onChange([...milestones, newTemplateMilestone(Number(milestones[milestones.length - 1]?.offset) || 0)])}
        disabled={milestones.length >= MILESTONES_MAX}
        className={`${BUTTON} self-start`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add milestone
      </button>
    </div>
  );
}
