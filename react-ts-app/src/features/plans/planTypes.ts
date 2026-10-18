// The Plans contract (spec 2026-10-04-plans-design.md §4), field for field.
// Every read is computed for the reader: plans only on records they may
// open, tasks only those they may see, the rest as counts.
import type { AgentKind, MadeBy } from '../agents/agentTypes';
import type { PersonRef, Sharing } from '../segments/segmentTypes';

export type { PersonRef, Sharing };

export type PlanKind = 'onboarding' | 'success' | 'save' | 'qbr' | 'other';
/** `draft` (Agents delivery 2) is never open: it is edited, started or deleted. */
export type PlanStatus = 'draft' | 'not_started' | 'on_track' | 'at_risk' | 'done' | 'cancelled';
/** customers.Task.Priority */
export type Priority = 'high' | 'medium' | 'low';
/** customers.Task.Status */
export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type AssigneeRole = 'plan_owner' | 'record_owner';
export type RecordKind = 'organization' | 'account';

export interface RecordRef {
  kind: RecordKind;
  id: number;
  name: string;
}

export interface TemplateTask {
  title: string;
  priority: Priority;
  offset_days: number;
  assignee_role: AssigneeRole;
}

export interface TemplateMilestone {
  name: string;
  offset_days: number;
  tasks: TemplateTask[];
}

export interface PlanTemplate {
  id: number;
  name: string;
  kind: PlanKind;
  description: string;
  is_builtin: boolean;
  is_owner: boolean;
  owner: PersonRef | null;
  sharing: Sharing;
  shared_with: PersonRef[];
  milestones: TemplateMilestone[];
  milestone_count: number;
  task_count: number;
  /** The largest offset over milestones and tasks. */
  length_days: number;
  updated_at: string;
  /** The agent action that wrote it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
}

/** GET plans/templates/ */
export interface TemplateLists {
  builtin: PlanTemplate[];
  mine: PlanTemplate[];
  shared: PlanTemplate[];
}

/** The list, the board and a record's section. */
export interface PlanRow {
  id: number;
  name: string;
  kind: PlanKind;
  status: PlanStatus;
  record: RecordRef;
  owner: PersonRef;
  start_date: string;
  target_date: string;
  milestones_done: number;
  milestones_total: number;
  /** Tasks the reader can see. */
  tasks_done: number;
  tasks_total: number;
  /** The earliest due date of a milestone not done. */
  next_due: string | null;
  /** `next_due` is before today. */
  is_overdue: boolean;
  can_edit: boolean;
  /** The tasks Start plan will create: 0 unless the plan is a Draft (contract question 1). */
  pending_tasks: number;
  /** The agent whose action started the plan (Agents delivery 2). */
  started_by_agent: AgentKind | null;
}

export interface PlanTask {
  id: number;
  title: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string;
  assignee: PersonRef | null;
  can_check: boolean;
}

export interface Milestone {
  id: number;
  name: string;
  position: number;
  due_date: string;
  done_at: string | null;
  is_overdue: boolean;
  tasks: PlanTask[];
  hidden_tasks: number;
  /** Visible tasks. */
  tasks_done: number;
  tasks_total: number;
}

export interface Plan extends PlanRow {
  template: { id: number; name: string } | null;
  started_by: PersonRef | null;
  /** `id` is null when the reader can't read the rule (Contract note 18). */
  started_by_rule: { id: number | null; name: string } | null;
  status_set_by: 'person' | 'system';
  done_at: string | null;
  created_at: string;
  milestones: Milestone[];
  hidden_tasks: number;
  /** can_edit and no completed task. */
  can_delete: boolean;
}

/** Every status's count; `draft` only when the server sends it (contract question 2). */
export type PlanCounts = Record<Exclude<PlanStatus, 'draft'>, number> & { draft?: number };

/** GET plans/: `counts` covers the same filters ignoring `status`. */
export interface PlansPage {
  results: PlanRow[];
  next: string | null;
  counts: PlanCounts;
}

export interface StartTask {
  title: string;
  priority: Priority;
  due_date: string;
  assignee: number;
}

export interface StartMilestone {
  name: string;
  due_date: string;
  tasks: StartTask[];
}

/** POST plans/: exactly one of `customer` and `account`. */
export interface PlanStart {
  template: number;
  customer?: number;
  account?: number;
  name?: string;
  owner?: number;
  start_date?: string;
  milestones?: StartMilestone[];
}

export type SettableStatus = 'on_track' | 'at_risk' | 'cancelled' | 'done';

export interface PlanPatch {
  name?: string;
  owner?: number;
  status?: SettableStatus;
}

export interface MilestoneWrite {
  name: string;
  due_date: string;
}

export interface MilestonePatch {
  name?: string;
  due_date?: string;
  done?: boolean;
}

export interface TaskWrite {
  milestone: number;
  title: string;
  priority: Priority;
  due_date: string;
  assignee: number;
}

export type TaskPatch = Partial<TaskWrite> & { status?: TaskStatus };

export interface TemplateWrite {
  name: string;
  kind: PlanKind;
  description: string;
  milestones: TemplateMilestone[];
  sharing: Sharing;
  shared_with: number[];
}

export interface SaveAsTemplate {
  name: string;
  sharing?: Sharing;
  shared_with?: number[];
}

/** 409 on POST plans/. */
export interface PlanOpenBody {
  code: 'PLAN_OPEN';
  plan_id: number;
  detail: string;
}

/** 409 on POST plans/<id>/start/ when the plan is not a Draft. */
export interface NotDraftBody {
  code: 'NOT_DRAFT';
  detail: string;
}

/** GET customers/:id/ or accounts/:id/, as far as Plans reads it (Contract note 9). */
export interface PlanRecord extends RecordRef {
  owner: PersonRef | null;
}
