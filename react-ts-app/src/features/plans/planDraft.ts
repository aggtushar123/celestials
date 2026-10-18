// The New plan modal's review (spec §2.2) as plain data: copied from a
// template, its dates computed from the start date, each task's role
// resolved to a person, checked before it is sent.
import type { NestedErrors, PlanErrors } from './planErrors';
import { CHECK, MILESTONES_MAX, TASKS_MAX } from './planOptions';
import { addDays, dateCheck, daysBetween, defaultPlanName } from './planText';
import type { AssigneeRole, PlanStart, PlanTemplate, Priority, RecordRef } from './planTypes';

export interface DraftTask {
  key: string;
  title: string;
  priority: Priority;
  due_date: string;
  /** The template's role; null once a person is picked by hand. */
  role: AssigneeRole | null;
  /** A hand-picked person, else null (the role decides). */
  assignee: number | null;
}

export interface DraftMilestone {
  key: string;
  name: string;
  due_date: string;
  tasks: DraftTask[];
}

export interface StartDraft {
  name: string;
  owner: number;
  start_date: string;
  milestones: DraftMilestone[];
}

let sequence = 0;
const key = (prefix: string) => `${prefix}${++sequence}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function startDraft(template: PlanTemplate, record: RecordRef, owner: number, start: string): StartDraft {
  return {
    name: defaultPlanName(template.name, record.name),
    owner,
    start_date: start,
    milestones: template.milestones.map((milestone) => ({
      key: key('m'),
      name: milestone.name,
      due_date: addDays(start, milestone.offset_days),
      tasks: milestone.tasks.map((task) => ({
        key: key('t'),
        title: task.title,
        priority: task.priority,
        due_date: addDays(start, task.offset_days),
        role: task.assignee_role,
        assignee: null,
      })),
    })),
  };
}

/** A new start date moves every date by the same days, so a date changed
 *  by hand keeps its place relative to the rest. A half-typed date moves
 *  nothing. */
export function withStart(draft: StartDraft, start: string): StartDraft {
  if (!DATE.test(start) || !DATE.test(draft.start_date)) return { ...draft, start_date: start };
  const shift = daysBetween(draft.start_date, start);
  const move = (iso: string) => (DATE.test(iso) ? addDays(iso, shift) : iso);
  return {
    ...draft,
    start_date: start,
    milestones: draft.milestones.map((milestone) => ({
      ...milestone,
      due_date: move(milestone.due_date),
      tasks: milestone.tasks.map((task) => ({ ...task, due_date: move(task.due_date) })),
    })),
  };
}

/** A hand-picked person; else the record's owner for `record_owner` (when
 *  there is an active one); else the plan's owner. */
export function assigneeOf(task: DraftTask, owner: number, recordOwner: number | null): number {
  if (task.assignee !== null) return task.assignee;
  if (task.role === 'record_owner' && recordOwner !== null) return recordOwner;
  return owner;
}

export function newTask(milestone: DraftMilestone): DraftTask {
  return { key: key('t'), title: '', priority: 'medium', due_date: milestone.due_date, role: 'plan_owner', assignee: null };
}

export function taskCount(draft: StartDraft): number {
  return draft.milestones.reduce((n, milestone) => n + milestone.tasks.length, 0);
}

/** POST plans/ (spec §4; Contract note 10). */
export function toStart(draft: StartDraft, templateId: number, record: RecordRef, recordOwner: number | null): PlanStart {
  return {
    template: templateId,
    ...(record.kind === 'organization' ? { customer: record.id } : { account: record.id }),
    name: draft.name.trim(),
    owner: draft.owner,
    start_date: draft.start_date,
    milestones: draft.milestones.map((milestone) => ({
      name: milestone.name.trim(),
      due_date: milestone.due_date,
      tasks: milestone.tasks.map((task) => ({
        title: task.title.trim(),
        priority: task.priority,
        due_date: task.due_date,
        assignee: assigneeOf(task, draft.owner, recordOwner),
      })),
    })),
  };
}

/** What the server would refuse, said first, at the same places. */
export function checkStart(draft: StartDraft): PlanErrors {
  const field: Record<string, string> = {};
  if (!draft.name.trim()) field.name = CHECK.PLAN_NAME;
  if (!DATE.test(draft.start_date)) field.start_date = CHECK.DATE;
  if (draft.milestones.length === 0) field.milestones = CHECK.NO_MILESTONES;
  else if (draft.milestones.length > MILESTONES_MAX) field.milestones = CHECK.TOO_MANY_MILESTONES;
  else if (taskCount(draft) > TASKS_MAX) field.milestones = CHECK.TOO_MANY_TASKS;
  const milestones: NestedErrors[] = draft.milestones.map((milestone) => {
    const own: Record<string, string> = {};
    if (!milestone.name.trim()) own.name = CHECK.MILESTONE_NAME;
    const due = dateCheck(milestone.due_date, draft.start_date);
    if (due) own.due_date = due;
    const tasks = milestone.tasks.map((task) => {
      const one: Record<string, string> = {};
      if (!task.title.trim()) one.title = CHECK.TASK_TITLE;
      const taskDue = dateCheck(task.due_date, draft.start_date);
      if (taskDue) one.due_date = taskDue;
      return one;
    });
    return { field: own, tasks };
  });
  return { field, milestones };
}
