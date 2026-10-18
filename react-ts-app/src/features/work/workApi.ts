// Thin wrappers over apiFetch for the Work routes (delivery 1 contract).
import { ApiError, apiFetch } from '../../lib/apiClient';
import type { QueuesPayload } from '../agents/bundleTypes';
import type { ScopeKey } from '../brain/brainTypes';
import type {
  AssignAnswer,
  AssignBody,
  AssigneesPayload,
  DismissAnswer,
  DismissBody,
  DrillPayload,
  DrillState,
  FeedCount,
  FeedGroupKey,
  FeedKind,
  FeedPage,
  FeedPayload,
  NewTaskBody,
  RecScope,
  RecommendationsPayload,
  RefreshResult,
  TaskDetail,
  TaskEvent,
  TaskParentRef,
  TaskPatch,
  TeamPayload,
  TeamQueuePage,
  TeamQueuePayload,
  QueueScope,
  TodoAnswer,
  TodoBody,
  WorkSettings,
  WorkSettingsPatch,
} from './workTypes';

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const fetchTeam = (scope: ScopeKey) => apiFetch<TeamPayload>(`/work/team/?${query({ scope })}`);
export const fetchDrill = (assignee: number, state: DrillState = 'open') =>
  apiFetch<DrillPayload>(`/work/tasks/?${query({ assignee: String(assignee), state })}`);
export const fetchAssignees = (parent: TaskParentRef) => apiFetch<AssigneesPayload>(`/work/assignees/?${query({ [parent.kind]: String(parent.id) })}`);
export const fetchTask = (id: number) => apiFetch<TaskDetail>(`/tasks/${id}/`);
export const patchTask = (id: number, patch: TaskPatch) => apiFetch<TaskDetail>(`/tasks/${id}/`, { method: 'PATCH', body: patch });
export const postComment = (id: number, body: string) => apiFetch<TaskEvent>(`/tasks/${id}/comments/`, { method: 'POST', body: { body } });
/** Answers TaskSerializer's shape, which no caller reads. */
export const createWorkTask = (parent: TaskParentRef, body: NewTaskBody) =>
  apiFetch<unknown>(parent.kind === 'customer' ? `/customers/${parent.id}/tasks/` : `/accounts/${parent.id}/tasks/`, { method: 'POST', body });

// Delivery 2 (contract 2026-10-07-work-recommended-api.md).
/** No `scope`: the server's default (team for readers with reports or view-all, else me). */
export const fetchRecommendations = (scope: RecScope | null = null) =>
  apiFetch<RecommendationsPayload>(scope ? `/work/recommendations/?${query({ scope })}` : '/work/recommendations/');
export const assignRecommendation = (id: number, body: AssignBody) =>
  apiFetch<AssignAnswer>(`/work/recommendations/${id}/assign/`, { method: 'POST', body });
export const dismissRecommendation = (id: number, body: DismissBody) =>
  apiFetch<DismissAnswer>(`/work/recommendations/${id}/dismiss/`, { method: 'POST', body });
export const refreshRecommendations = () => apiFetch<RefreshResult>('/work/recommendations/refresh/', { method: 'POST' });
export const fetchWorkSettings = () => apiFetch<WorkSettings>('/work/settings/');
export const patchWorkSettings = (patch: WorkSettingsPatch) => apiFetch<WorkSettings>('/work/settings/', { method: 'PATCH', body: patch });

// Work in one place, delivery 1 (contract 2026-10-12-work-one-place-api.md).
const kindParam = (kinds: readonly FeedKind[] | null): Record<string, string> => (kinds ? { kind: kinds.join(',') } : {});

export function fetchFeed(kinds: readonly FeedKind[] | null) {
  const text = query(kindParam(kinds));
  return apiFetch<FeedPayload>(`/work/feed/${text ? `?${text}` : ''}`);
}
/** One group's next page; without a cursor, its first page (a failed group's Try again). */
export const fetchFeedGroup = (group: FeedGroupKey, kinds: readonly FeedKind[] | null, cursor: string | null = null) =>
  apiFetch<FeedPage>(`/work/feed/?${query({ group, ...(cursor ? { cursor } : {}), ...kindParam(kinds) })}`);
export const fetchFeedCount = () => apiFetch<FeedCount>('/work/feed/count/');
export const createTodo = (body: TodoBody) => apiFetch<TodoAnswer>('/work/todos/', { method: 'POST', body });

// Agent bundles D1 (contract 2026-10-13-agent-bundles-d1-api.md §10.2, §10.3).
export const fetchQueues = () => apiFetch<QueuesPayload>('/work/queues/');
export const fetchTeamQueue = (scope: QueueScope, kinds: readonly FeedKind[] | null) =>
  apiFetch<TeamQueuePayload>(`/work/feed/team/?${query({ scope, ...kindParam(kinds) })}`);
/** One group's next page; without a cursor, its first page (a failed group's Try again). */
export const fetchTeamQueueGroup = (scope: QueueScope, group: FeedGroupKey, kinds: readonly FeedKind[] | null, cursor: string | null = null) =>
  apiFetch<TeamQueuePage>(`/work/feed/team/?${query({ scope, group, ...(cursor ? { cursor } : {}), ...kindParam(kinds) })}`);
/** A question answered in place (My work, the Team queue, Next up): POST /questions/<id>/answer/. */
export const answerQuestion = (id: number, body: string) => apiFetch<unknown>(`/questions/${id}/answer/`, { method: 'POST', body: { body } });

export type RefusalField =
  | 'title'
  | 'description'
  | 'status'
  | 'blocked_reason'
  | 'due_date'
  | 'priority'
  | 'assignee_id'
  | 'body'
  | 'reason'
  | 'note'
  | 'timezone'
  | 'working_days'
  | 'escalate_after_days'
  | 'digest_enabled'
  | 'digest_hour'
  | 'record'
  | 'assignee'
  | 'customer_id'
  | 'account_id'
  | 'add_contact';
const FIELDS: readonly RefusalField[] = [
  'title',
  'description',
  'status',
  'blocked_reason',
  'due_date',
  'priority',
  'assignee_id',
  'body',
  'reason',
  'note',
  'timezone',
  'working_days',
  'escalate_after_days',
  'digest_enabled',
  'digest_hour',
  'record',
  'assignee',
  'customer_id',
  'account_id',
  'add_contact',
];

/** A refusal, read for the form that sent it: the field it names, or a line for the form. */
export interface Refusal {
  field: Partial<Record<RefusalField, string>>;
  form: string | null;
}

export const NO_REFUSAL: Refusal = { field: {}, form: null };

/** ASSIGNEE_CANNOT_OPEN goes under the assignee; a field's first message under
 *  that field; non_field_errors or detail (403, 404) on the form; anything
 *  else (offline, a 500 without a body) is `fallback`. */
export function readRefusal(err: unknown, fallback: string): Refusal {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null || Array.isArray(err.body)) {
    return { field: {}, form: fallback };
  }
  const body = err.body as Record<string, unknown>;
  if (body.code === 'ASSIGNEE_CANNOT_OPEN' && typeof body.detail === 'string') return { field: { assignee_id: body.detail }, form: null };
  const field: Refusal['field'] = {};
  for (const key of FIELDS) {
    const messages = body[key];
    if (Array.isArray(messages) && typeof messages[0] === 'string') field[key] = messages[0];
  }
  if (Object.keys(field).length > 0) return { field, form: null };
  const general = body.non_field_errors;
  if (Array.isArray(general) && typeof general[0] === 'string') return { field: {}, form: general[0] };
  if (typeof body.detail === 'string') return { field: {}, form: body.detail };
  return { field: {}, form: fallback };
}

/** The task is gone, or the reader may not read it (both are 404). */
export function isMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** Dismiss a Slack message the person sent to their Work (owner only; 404 otherwise). */
export const dismissSlackMessage = (id: number) => apiFetch<void>(`/work/slack-messages/${id}/`, { method: 'DELETE' });

/** Book a meeting the email agent proposed, at its time or another (2026-10-17). */
export const bookProposal = (id: number, body: { starts_at?: string; length_minutes?: number } = {}) =>
  apiFetch<{ status: 'booked'; meeting_id: number }>(`/email-agent/proposals/${id}/book/`, { method: 'POST', body });

export const dismissProposal = (id: number) => apiFetch<{ status: 'dismissed' }>(`/email-agent/proposals/${id}/dismiss/`, { method: 'POST' });

/** The sender's yes or no to what the email agent read in their own sent mail (decision B). */
export const decideEmailSuggestion = (id: number, verb: 'confirm' | 'dismiss') =>
  apiFetch<{ confirmed?: true; dismissed?: true; task_id?: number | null }>(`/email-agent/suggestions/${id}/${verb}/`, { method: 'POST' });

/** Take back a task the email agent made, within a day. */
export const undoEmailTask = (taskId: number) => apiFetch<{ undone: true }>(`/email-agent/tasks/${taskId}/undo/`, { method: 'POST' });

/** Make the Jira issue for a Slack message sent to Work, once (2026-10-16). */
export const createSlackJira = (id: number, body: { summary: string; description: string }) =>
  apiFetch<{ key: string; url: string }>(`/work/slack-messages/${id}/jira/`, { method: 'POST', body });

/** Post the person's reply to the sender, as them, once. */
export const sendSlackReply = (id: number, text: string) =>
  apiFetch<{ url: string }>(`/work/slack-messages/${id}/reply/`, { method: 'POST', body: { text } });
