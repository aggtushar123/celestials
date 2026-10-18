// apiFetch wrappers over /api/v1/plans/… (spec 2026-10-04-plans-design.md §4).
// Every write on a plan answers with the whole Plan, read for the caller.
import { apiFetch } from '../../lib/apiClient';
import { searchRecords } from '../segments/segmentApi';
import type {
  MilestonePatch,
  MilestoneWrite,
  PersonRef,
  Plan,
  PlanPatch,
  PlanRecord,
  PlanRow,
  PlansPage,
  PlanStart,
  PlanTemplate,
  RecordKind,
  RecordRef,
  SaveAsTemplate,
  TaskPatch,
  TaskWrite,
  TemplateLists,
  TemplateWrite,
} from './planTypes';

export const PLANS_PATH = '/plans/';
export const TEMPLATES_PATH = '/plans/templates/';
const one = (id: number) => `${PLANS_PATH}${id}/`;
const template = (id: number) => `${TEMPLATES_PATH}${id}/`;

/** One page of 50 with the column counts; `query` has no leading "?". */
export function fetchPlans(query: string): Promise<PlansPage> {
  return apiFetch<PlansPage>(query ? `${PLANS_PATH}?${query}` : PLANS_PATH);
}

/** The same page, shaped for usePagedRead (`next_cursor`). */
export async function fetchPlansPaged(query: string): Promise<PlansPage & { next_cursor: string | null }> {
  const page = await fetchPlans(query);
  return { ...page, next_cursor: page.next };
}

export function fetchPlan(id: number): Promise<Plan> {
  return apiFetch<Plan>(one(id));
}

/** 201 with the plan; 409 `{code: 'PLAN_OPEN', plan_id, detail}`. */
export function startPlan(body: PlanStart): Promise<Plan> {
  return apiFetch<Plan>(PLANS_PATH, { method: 'POST', body });
}

/** A Draft's tasks made again, due from today (Agents delivery 2); 409
 *  `{code: 'NOT_DRAFT', detail}` or `{code: 'PLAN_OPEN', plan_id, detail}`. */
export function startDraftPlan(id: number): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}start/`, { method: 'POST' });
}

export function updatePlan(id: number, body: PlanPatch): Promise<Plan> {
  return apiFetch<Plan>(one(id), { method: 'PATCH', body });
}

/** 204; 409 `{code: 'PLAN_HAS_DONE_WORK', detail}`. */
export function deletePlan(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

export function addMilestone(id: number, body: MilestoneWrite): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/`, { method: 'POST', body });
}

export function updateMilestone(id: number, milestoneId: number, body: MilestonePatch): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/${milestoneId}/`, { method: 'PATCH', body });
}

/** Its tasks are deleted with it. */
export function deleteMilestone(id: number, milestoneId: number): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/${milestoneId}/`, { method: 'DELETE' });
}

/** Every milestone id, once. */
export function reorderMilestones(id: number, order: number[]): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/reorder/`, { method: 'POST', body: { order } });
}

export function addTask(id: number, body: TaskWrite): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}tasks/`, { method: 'POST', body });
}

/** Editors change anything; the assignee and the creator may change `status`. */
export function updateTask(id: number, taskId: number, body: TaskPatch): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}tasks/${taskId}/`, { method: 'PATCH', body });
}

export function deleteTask(id: number, taskId: number): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}tasks/${taskId}/`, { method: 'DELETE' });
}

export function fetchTemplates(): Promise<TemplateLists> {
  return apiFetch<TemplateLists>(TEMPLATES_PATH);
}

export function fetchTemplate(id: number): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(template(id));
}

export function createTemplate(body: TemplateWrite): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(TEMPLATES_PATH, { method: 'POST', body });
}

/** The owner's only; built-in templates answer 403. */
export function updateTemplate(id: number, body: Partial<TemplateWrite>): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(template(id), { method: 'PATCH', body });
}

export function deleteTemplate(id: number): Promise<null> {
  return apiFetch<null>(template(id), { method: 'DELETE' });
}

export function saveAsTemplate(id: number, body: SaveAsTemplate): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(`${one(id)}save-as-template/`, { method: 'POST', body });
}

/** A record's plans, open first, then newest; 404 if the reader can't open it. */
export function fetchRecordPlans(record: { kind: RecordKind; id: number }): Promise<{ results: PlanRow[] }> {
  const base = record.kind === 'organization' ? '/customers/' : '/accounts/';
  return apiFetch<{ results: PlanRow[] }>(`${base}${record.id}/plans/`);
}

/** The record's name and owner, through the record's own read (Contract note 9). */
export async function fetchPlanRecord(kind: RecordKind, id: number): Promise<PlanRecord> {
  const path = kind === 'organization' ? `/customers/${id}/` : `/accounts/${id}/`;
  const read = await apiFetch<{ id: number; name: string; owner: PersonRef | null }>(path);
  return { kind, id: read.id, name: read.name, owner: read.owner ? { id: read.owner.id, name: read.owner.name } : null };
}

/** Organisations, then accounts, the reader may open, by name. */
export async function searchPlanRecords(search: string): Promise<RecordRef[]> {
  const [organisations, accounts] = await Promise.all([searchRecords('customer', search), searchRecords('account', search)]);
  return [
    ...organisations.map((row): RecordRef => ({ kind: 'organization', id: row.id, name: row.name })),
    ...accounts.map((row): RecordRef => ({ kind: 'account', id: row.id, name: row.name })),
  ];
}
