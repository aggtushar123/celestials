import { useState } from 'react';
import { CheckCircle2, Flag, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDate } from '../../features/customers/formatters';
import { deleteTask, updateMilestone, updateTask } from '../../features/plans/planApi';
import { firstError, planErrors } from '../../features/plans/planErrors';
import { PRIORITY_LABEL, TASKS_MAX } from '../../features/plans/planOptions';
import { hiddenTasks, isDraft, isOpen, progress, shortDay } from '../../features/plans/planText';
import type { Milestone, Plan, PlanTask } from '../../features/plans/planTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { Badge, Card, EmptyState, ICON_BUTTON, NUM, QUIET, ROW_ACTIONS, TYPE } from '../ui';
import { AddMilestone, MilestoneEditor } from './MilestoneEditor';
import { TaskEditor } from './TaskEditor';
import { useSubmitOnce } from './useSubmitOnce';

/** A task (spec §2.3): its checkbox for the assignee, the creator or an
 *  editor (`can_check`), even on a finished plan; title, assignee, due date, priority as a word and a flag. In Edit, Edit and Remove. */
function TaskRow({ plan, milestone, task, editing, onReplace }: { plan: Plan; milestone: Milestone; task: PlanTask; editing: boolean; onReplace: (plan: Plan) => void }) {
  const { busy, run } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Done editing closes an open task form: the next Edit starts on the list.
  const [wasEditing, setWasEditing] = useState(editing);
  if (wasEditing !== editing) {
    setWasEditing(editing);
    if (!editing) setChanging(false);
  }
  const done = task.status === 'completed';
  async function toggle() {
    setError(null);
    const outcome = await run(() => updateTask(plan.id, task.id, { status: done ? 'pending' : 'completed' }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setError(firstError(planErrors(outcome.error, [], 'Could not update this task.')));
  }
  if (editing && changing) {
    return (
      <li data-task={task.id}>
        <TaskEditor plan={plan} milestoneId={milestone.id} task={task} onDone={() => setChanging(false)} onReplace={onReplace} />
      </li>
    );
  }
  return (
    <li data-task={task.id} className="group relative flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <label className="flex min-h-11 min-w-0 flex-1 basis-56 cursor-pointer items-center gap-2 sm:min-h-9">
        <input type="checkbox" checked={done} disabled={!task.can_check || busy} onChange={() => void toggle()} />
        <span className={`min-w-0 ${done ? TYPE.bodyMuted : TYPE.body}`}>{task.title}</span>
      </label>
      <span className={TYPE.meta}>{task.assignee?.name ?? 'Unassigned'}</span>
      <span className={`${TYPE.meta} ${NUM}`}>{shortDay(task.due_date)}</span>
      <span className={`inline-flex items-center gap-1 ${TYPE.meta}`}>
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {PRIORITY_LABEL[task.priority]}
      </span>
      {editing ? (
        <span className={`flex items-center gap-1 ${ROW_ACTIONS}`}>
          <button type="button" aria-label={`Edit ${task.title}`} onClick={() => setChanging(true)} className={ICON_BUTTON}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Remove ${task.title}`} onClick={() => setRemoving(true)} className={ICON_BUTTON}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-[11px] leading-4 text-danger-ink">
          {error}
        </p>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={`Remove ${task.title}?`}
          message="It is deleted from the plan and from its owner's list."
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            try {
              onReplace(await deleteTask(plan.id, task.id));
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not remove this task.'));
            }
          }}
          onClose={() => setRemoving(false)}
        />
      ) : null}
    </li>
  );
}

/** A milestone (spec §2.3): name, due date, Overdue as a badge,
 *  its progress, the editors' done check, its tasks and the hidden count;
 *  Add task for editors; in Edit, its inline form (Decision 8). */
function MilestoneItem({ plan, milestone, index, editing, onReplace }: { plan: Plan; milestone: Milestone; index: number; editing: boolean; onReplace: (plan: Plan) => void }) {
  const { busy, run } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const done = milestone.done_at !== null;
  const editable = plan.can_edit && isOpen(plan.status);
  const hidden = hiddenTasks(milestone.hidden_tasks);
  const planTasks = plan.milestones.reduce((n, one) => n + one.tasks_total + one.hidden_tasks, 0);
  // Anything drawn under the header (editor, error, tasks, empty line, count, Add task)?
  const below = editing || error !== null || milestone.tasks.length > 0 || (milestone.hidden_tasks === 0 && !isDraft(plan.status)) || hidden.n > 0 || editable;
  async function mark(next: boolean) {
    setError(null);
    const outcome = await run(() => updateMilestone(plan.id, milestone.id, { done: next }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setError(firstError(planErrors(outcome.error, [], 'Could not update this milestone.')));
  }
  return (
    <Card as="li" pad="none" data-milestone={milestone.id}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4 ${below ? 'pb-2' : 'pb-4'}`}>
        <h2 className={`min-w-0 flex-1 basis-40 ${TYPE.title}`}>{milestone.name}</h2>
        <span className={`${TYPE.bodyMuted} ${NUM}`}>{formatDate(milestone.due_date)}</span>
        {milestone.is_overdue ? (
          <span data-part="overdue" className="inline-flex">
            <Badge tone="danger">Overdue</Badge>
          </span>
        ) : null}
        <span className={TYPE.meta}>
          <span className={NUM}>{progress(milestone.tasks_done, milestone.tasks_total)}</span> tasks done
        </span>
        {editable ? (
          <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-9 ${TYPE.body}`}>
            <input type="checkbox" aria-label={`${milestone.name} done`} checked={done} disabled={busy} onChange={(event) => void mark(event.target.checked)} />
            Done
          </label>
        ) : done ? (
          <span className={`inline-flex items-center gap-1 ${TYPE.body}`}>
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            Done
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="px-4 pb-3">
          <MilestoneEditor plan={plan} milestone={milestone} index={index} onReplace={onReplace} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="px-4 pb-3 text-[11px] leading-4 text-danger-ink">
          {error}
        </p>
      ) : null}
      {milestone.tasks.length > 0 ? (
        <ul aria-label={`Tasks in ${milestone.name}`} className="divide-y divide-line-subtle border-t border-line-subtle">
          {milestone.tasks.map((task) => (
            <TaskRow key={task.id} plan={plan} milestone={milestone} task={task} editing={editing} onReplace={onReplace} />
          ))}
        </ul>
      ) : milestone.hidden_tasks === 0 && !isDraft(plan.status) ? (
        // A Draft has no tasks yet: its banner says how many Start plan creates.
        <EmptyState size="inline" title="No tasks." />
      ) : null}
      {hidden.n > 0 ? (
        <p data-part="hidden" className={`px-4 pb-3 ${TYPE.meta}`}>
          <span className={NUM}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
      {editable && adding ? (
        <div className="border-t border-line-subtle">
          <TaskEditor plan={plan} milestoneId={milestone.id} task={null} onDone={() => setAdding(false)} onReplace={onReplace} />
        </div>
      ) : null}
      {editable && !adding ? (
        <div className="border-t border-line-subtle px-4 py-2">
          <button type="button" onClick={() => setAdding(true)} disabled={planTasks >= TASKS_MAX} className={QUIET}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add task
          </button>
        </div>
      ) : null}
    </Card>
  );
}

/** The milestones in order down the page, each a card; in
 *  Edit, Add milestone after the last. */
export function Timeline({ plan, editing, onReplace }: { plan: Plan; editing: boolean; onReplace: (plan: Plan) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Milestones" className="flex flex-col gap-4">
        {plan.milestones.map((milestone, index) => (
          <MilestoneItem key={milestone.id} plan={plan} milestone={milestone} index={index} editing={editing} onReplace={onReplace} />
        ))}
      </ol>
      {editing ? <AddMilestone plan={plan} onReplace={onReplace} /> : null}
    </div>
  );
}
