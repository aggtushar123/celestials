// The Work API's shapes, field for field (delivery 1 contract:
// revenact-backend docs/superpowers/plans/2026-10-07-work-tasks-api.md).
import type { AgentAction, SignalSource } from '../agents/agentTypes';
import type { UserFunction } from '../auth/authSlice';
import type { RuleReviewDetail, ScopeKey } from '../brain/brainTypes';

export type TaskStatus = 'pending' | 'in-progress' | 'blocked' | 'completed';
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskSource = 'manual' | 'plan' | 'rule' | 'recommendation' | 'agent';
export type ParentKind = 'customer' | 'account';

export const STATUSES: readonly TaskStatus[] = ['pending', 'in-progress', 'blocked', 'completed'];
export const PRIORITIES: readonly TaskPriority[] = ['high', 'medium', 'low'];

/** The record a task is on: an organisation (`customer`) or an account. */
export interface TaskParentRef {
  kind: ParentKind;
  id: number;
}

export interface TaskParent extends TaskParentRef {
  name: string;
}

/** `active: false` is a deactivated person ("Unassigned (was X)"). */
export interface TaskPerson {
  id: number;
  name: string;
  active: boolean;
}

export interface PersonRef {
  id: number;
  name: string;
}

/** One row of every Work list. `blocked_reason` is non-empty exactly when Blocked.
 *  A to-do (work in one place) has no record and may have no date. */
export interface TaskRow {
  id: number;
  title: string;
  /** Null only for a to-do with no date. */
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  blocked_reason: string;
  source: TaskSource;
  /** Null for a to-do. */
  parent: TaskParent | null;
  /** Null only for an old seeded task. */
  assignee: TaskPerson | null;
  plan: { id: number; name: string } | null;
  /** True for a to-do: only its creator sees it. */
  private: boolean;
}

export interface TeamPerson {
  person: TaskPerson;
  open: number;
  overdue: number;
  blocked: number;
  oldest_overdue: string | null;
}

/** GET /work/team/?scope= */
export interface TeamPayload {
  scope: ScopeKey;
  today: string;
  people: TeamPerson[];
  hidden: number;
}

export type DrillState = 'open' | 'overdue' | 'blocked';

/** GET /work/tasks/?assignee=&state= (at most 200 rows, no hidden count). */
export interface DrillPayload {
  tasks: TaskRow[];
}

export interface AssigneeOption {
  id: number;
  name: string;
  function: string;
  can_open: boolean;
}

/** GET /work/assignees/?customer= or ?account= : every active member, by name. */
export interface AssigneesPayload {
  people: AssigneeOption[];
}

export type EventKind = 'created' | 'recommended' | 'assigned' | 'status' | 'due_changed' | 'edited' | 'comment' | 'nudged' | 'escalated';

/** One line of the activity trail, oldest first. `actor` null: Revenact did it. */
export interface TaskEvent {
  id: number;
  kind: EventKind;
  actor: PersonRef | null;
  data: Record<string, unknown>;
  body: string;
  created_at: string;
}

export type EditableField = 'title' | 'description' | 'status' | 'due_date' | 'priority' | 'assignee' | 'record';

/** GET /tasks/<id>/ and every PATCH's answer. */
export interface TaskDetail extends TaskRow {
  description: string;
  priority_display: string;
  status_display: string;
  parent_name: string | null;
  parent_type: ParentKind | null;
  assignee_name: string;
  created_by: PersonRef | null;
  created_at: string;
  milestone: { id: number; name: string } | null;
  initiative: { id: number; title: string } | null;
  /** The fields this reader may change. */
  editable: EditableField[];
  events: TaskEvent[];
}

export interface TaskPatch {
  title?: string;
  description?: string;
  status?: TaskStatus;
  blocked_reason?: string;
  /** Null clears a to-do's date (refused on a task with a record). */
  due_date?: string | null;
  priority?: TaskPriority;
  assignee_id?: number;
  /** Attach a record to a to-do (one-way; never on a task that has one). */
  customer_id?: number;
  account_id?: number;
}

/** POST /customers/<id>/tasks/ or /accounts/<id>/tasks/. No assignee: the caller. */
export interface NewTaskBody {
  title: string;
  due_date: string;
  priority: TaskPriority;
  assignee_id?: number | null;
  description?: string;
}

// Delivery 2 ("Recommended"), contract revenact-backend
// docs/superpowers/plans/2026-10-07-work-recommended-api.md.

export type RecKind = 'renewal_due' | 'health_drop' | 'urgent_tickets' | 'anomaly';
/** In the contract's order, which the settings page follows (delivery 2: the
 *  overdue-tasks, open-questions and AI agent signals were retired). */
export const REC_KINDS: readonly RecKind[] = ['renewal_due', 'health_drop', 'urgent_tickets', 'anomaly'];
/** A row's kind: the live kinds, and the retired ones old rows still carry. */
export type RecRowKind = RecKind | 'overdue_tasks' | 'open_questions' | 'agent_action';
export type RecScope = 'me' | 'team';
export type RecStatus = 'open' | 'assigned' | 'dismissed' | 'expired';
export type DismissReason = 'already_handled' | 'not_relevant' | 'wrong_person' | 'other';

/** A link inside the app: `/organizations/<id>`, `/accounts/<id>`, `/brain/anomalies`. */
export interface RecEvidence {
  label: string;
  link: string;
}

/** `active: false` or `can_open: false`: that person can no longer take it. */
export interface RecSuggested extends PersonRef {
  active: boolean;
  can_open: boolean;
}

/** What Assign prefills. */
export interface RecDefaults {
  title: string;
  due_date: string;
  priority: TaskPriority;
}

/** One item of GET /work/recommendations/. */
export interface RecommendationRow {
  id: number;
  kind: RecRowKind;
  title: string;
  why: { facts: string[]; evidence: RecEvidence[] };
  /** Null only for an agent action with no record (Agents delivery 3): the
   *  contract keeps those out of Recommended, but the card must hold one. */
  record: TaskParent | null;
  /** Null when nobody could be suggested (a fallback recipient has it). */
  suggested_assignee: RecSuggested | null;
  recipient: PersonRef;
  /** Null for an agent action that is not `task.create` (nothing to prefill). */
  defaults: RecDefaults | null;
  /** The agent action, written for the reader, for `kind: 'agent_action'`. */
  agent_action: AgentAction | null;
  created_at: string;
}

/** A recommendation on a record: what Assign needs to choose people. */
export type RecordedRecommendation = RecommendationRow & { record: TaskParent };

/** At most 100 `items`, newest first; `count` is the full total; `hidden`
 *  counts those about records the reader cannot open. */
export interface RecommendationsPayload {
  scope: RecScope;
  items: RecommendationRow[];
  count: number;
  hidden: number;
}

export interface DecidedRecommendation {
  id: number;
  status: RecStatus;
  decided_by: PersonRef | null;
  decided_at: string | null;
  task_id: number | null;
  /** 'retired': closed by the delivery 2 migration, never chosen by a person. */
  dismiss_reason: DismissReason | 'retired' | '';
  dismiss_note: string;
}

export interface AssignBody {
  assignee_id: number;
  due_date?: string;
  title?: string;
  priority?: TaskPriority;
}

export interface AssignAnswer {
  recommendation: DecidedRecommendation;
  task: TaskRow;
}

export interface DismissBody {
  reason: DismissReason;
  /** Required with `other`, ignored otherwise. */
  note?: string;
}

export interface DismissAnswer {
  recommendation: DecidedRecommendation;
}

/** POST /work/recommendations/refresh/ ("Run now"). */
export interface RefreshResult {
  created: number;
  updated: number;
  expired: number;
  unrouted: number;
  notified: number;
  /** The sources that failed this run, by kind (each fails on its own; the
   *  others still ran), plus `"recommendations_waiting"` when the notice
   *  failed (the recommendations stand). */
  failed: string[];
}

export type RecommendTo = 'manager' | 'owner';
export type SourceField = 'days' | 'drop' | 'window_days' | 'min';

export interface SourceSettings {
  enabled: boolean;
  days?: number;
  drop?: number;
  window_days?: number;
  min?: number;
}

/** GET /work/settings/. Delivery 3 adds fields; unknown keys are ignored. */
export interface WorkSettings {
  recommend_to: RecommendTo;
  sources: Record<RecKind, SourceSettings>;
  dismiss_cooldown_days: number;
  /** An IANA name; Work's "today" is the date there (delivery 3). */
  timezone: string;
  /** Monday 0 to Sunday 6, ascending, at least one. */
  working_days: number[];
  /** Working days overdue before the manager is told, 1 to 30. */
  escalate_after_days: number;
  digest_enabled: boolean;
  /** Local hour in `timezone`, 0 to 23. */
  digest_hour: number;
  /** Read only: false when this server cannot send email, so digests are skipped. */
  email_ready: boolean;
  can_edit: boolean;
}

/** PATCH /work/settings/: any field, and inside `sources` any kind and field. */
export interface WorkSettingsPatch {
  recommend_to?: RecommendTo;
  sources?: Partial<Record<RecKind, Partial<SourceSettings>>>;
  dismiss_cooldown_days?: number;
  timezone?: string;
  working_days?: number[];
  escalate_after_days?: number;
  digest_enabled?: boolean;
  digest_hour?: number;
}

// Work in one place, delivery 1 (contract revenact-backend
// docs/superpowers/plans/2026-10-12-work-one-place-api.md).

export type FeedKind = 'bundle' | 'rule_review' | 'question' | 'draft' | 'task' | 'todo' | 'suggestion' | 'slack_message' | 'meeting_proposal' | 'email_suggestion';
/** In the contract's order (`failed` lists them in it; agent bundles D1 §10.1). */
export const FEED_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'draft', 'task', 'todo', 'suggestion', 'slack_message', 'meeting_proposal', 'email_suggestion'];
/** What a Team queue may filter on (agent bundles D1 §10.2): no to-dos, no drafts. */
export const TEAM_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'task', 'suggestion'];
export type FeedGroupKey = 'decide' | 'overdue' | 'today' | 'week' | 'later' | 'no_date' | 'blocked' | 'suggested';
export type TaskGroupKey = Exclude<FeedGroupKey, 'decide' | 'suggested'>;

/** `customer` links /organizations/<id>, `account` /accounts/<id>. */
export interface FeedRecord {
  type: 'customer' | 'account';
  id: number;
  name: string;
  /** SE4-26: false when the reader may not open it (a participant); absent means they may. */
  can_open?: boolean;
}

export interface FeedFrom {
  type: 'agent' | 'rule' | 'person' | 'revenact' | 'email' | 'email_agent' | 'slack';
  label: string;
}

interface FeedItemBase {
  /** `<source>:<id>`, stable and unique across the feed. */
  key: string;
  /** The source row's id: what its action endpoint takes. */
  id: number;
  title: string;
  record: FeedRecord | null;
  from: FeedFrom;
  at: string;
  due_date: string | null;
  priority: TaskPriority | null;
  private: boolean;
  /** Team queue only (contract D6): who it waits on; null is the whole company. */
  for?: PersonRef | null;
}

/** A waiting bundle (agent bundles D1 contract §4.3): decided in the panel only. */
export interface BundleFeedItem extends FeedItemBase {
  kind: 'bundle';
  actions: 'open'[];
  detail: {
    reason: string;
    step_count: number;
    source: { kind: 'nightly' | 'thread' | 'slack_message' | 'meeting'; label: string; channel: SignalSource | null };
    routed_to: 'owner' | 'department' | 'admins' | 'person';
    department: { key: UserFunction; label: string } | null;
    kinds: string[];
    can_run: boolean;
    participant_view?: boolean;
    /** Guided agent (2026-10-18); absent from an older backend. */
    priority?: 'high' | 'normal';
    guided?: boolean;
  };
}

export interface ReviewFeedItem extends FeedItemBase {
  kind: 'rule_review';
  actions: ('approve' | 'skip')[];
  /** Brain Waiting's rule-review detail (contract §2.2). */
  detail: RuleReviewDetail;
}

export interface QuestionFeedItem extends FeedItemBase {
  kind: 'question';
  actions: 'answer'[];
  detail: { text: string; asked_by: PersonRef };
}

export interface DraftFeedItem extends FeedItemBase {
  kind: 'draft';
  actions: 'open'[];
  detail: { channel: 'email' | 'ticket' };
}

export interface TaskFeedItem extends FeedItemBase {
  kind: 'task' | 'todo';
  actions: ('done' | 'open')[];
  /** `from_email`: the email agent made it from a colleague's email, undoable until then (2026-10-17).
   *  `from_slack`: a colleague tagged the reader and sent the Slack message to Revenact (2026-10-18). */
  detail: TaskRow & { from_email?: { by: string; undo_until: string }; from_slack?: { by: string; permalink: string | null } };
}

/** A meeting a colleague's email asked for, waiting on the reader (email
 *  agent, 2026-10-17). Never the email itself: the title is the agent's topic. */
export interface MeetingProposalFeedItem extends FeedItemBase {
  kind: 'meeting_proposal';
  actions: ('book' | 'dismiss')[];
  detail: {
    requester: { id: number; name: string } | null;
    attendees: { id: number; name: string }[];
    without_calendar: { id: number; name: string }[];
    proposed_start: string | null;
    length_minutes: number;
    urgent: boolean;
  };
}

export interface SuggestionFeedItem extends FeedItemBase {
  kind: 'suggestion';
  actions: ('add' | 'assign' | 'dismiss')[];
  detail: RecommendationRow;
}

/** A Slack message the person sent to Revenact themselves (Send to Revenact,
 *  connections spec 2026-10-16 §3): only they ever see it. */
export interface SlackMessageFeedItem extends FeedItemBase {
  kind: 'slack_message';
  actions: ('open' | 'dismiss' | 'jira' | 'reply')[];
  detail: {
    summary: string;
    text: string;
    excerpt: string;
    /** Colleagues tagged in it who got it as a to-do from the sender (2026-10-18); empty when none. */
    handed_to?: { id: number; name: string }[];
    sender: string;
    permalink: string;
    suggested_step: { kind: string; label: string } | null;
    /** The record's numbers, only while the reader may open it (2026-10-16). */
    context?: SlackMessageContext | null;
    /** The record's newest open tickets the reader may read. */
    open_tickets?: { number: string; title: string; url: string; days_open: number | null }[];
    /** The drafted Jira issue; `key` once it was made. */
    jira?: { available: boolean; project: string; summary: string; description: string; key: string; url: string };
    /** The drafted reply to the sender; `with_issue` carries "{issue}". */
    reply?: { to: string; draft: string; with_issue: string; sent_at: string | null; url: string };
  };
}

export interface SlackMessageContext {
  health_score: number | null;
  health_category: string;
  arr: number | null;
  renewal_date: string | null;
  days_to_renewal: number | null;
  owner: string;
}

/** What the email agent read in the reader's own sent mail, waiting on
 *  their yes before anyone else hears of it (owner decision B, 2026-10-17). */
export interface EmailSuggestionFeedItem extends FeedItemBase {
  kind: 'email_suggestion';
  actions: ('confirm' | 'dismiss')[];
  detail:
    | { kind: 'task'; assignee: { id: number; name: string } | null; task_title: string; due_date: string | null; urgent: boolean }
    | ({ kind: 'meeting'; approver: { id: number; name: string } | null } & Partial<MeetingProposalFeedItem['detail']>);
}

export type FeedItem = BundleFeedItem | ReviewFeedItem | QuestionFeedItem | DraftFeedItem | TaskFeedItem | SuggestionFeedItem | SlackMessageFeedItem | MeetingProposalFeedItem | EmailSuggestionFeedItem;

/** At most 50 `items`; `count` is the group's full total; `next` an opaque cursor. */
export interface FeedGroup {
  key: FeedGroupKey;
  count: number;
  items: FeedItem[];
  next: string | null;
}

/** GET /work/feed/: always all eight groups, in order. */
export interface FeedPayload {
  groups: FeedGroup[];
  hidden: number;
  failed: FeedKind[];
}

/** GET /work/feed/?group=<key>[&cursor=]. */
export interface FeedPage {
  group: FeedGroup;
  failed: FeedKind[];
}

// Work in one place, delivery 2 (contract revenact-backend
// docs/superpowers/plans/2026-10-12-work-one-place-d2-api.md).

export type TeamScope = 'team' | 'company';
/** GET /work/feed/team/?scope=: a team scope, a department queue or Unassigned (agent bundles D2 §4.6). */
export type QueueScope = TeamScope | 'unassigned' | `department:${UserFunction}`;
export type TeamGroupKey = Extract<FeedGroupKey, 'decide' | 'overdue' | 'suggested'>;

/** GET /work/feed/team/: three groups (decide, overdue, suggested), every
 *  item with `for`. */
export interface TeamQueuePayload extends FeedPayload {
  scope: QueueScope;
}

/** GET /work/feed/team/?group=<key>[&cursor=]. */
export interface TeamQueuePage extends FeedPage {
  scope: QueueScope;
}

/** GET /work/feed/count/. */
export interface FeedCount {
  decide: number;
  overdue: number;
  badge: number;
  failed: FeedKind[];
}

/** POST /work/todos/. No record: a to-do (the caller's own). */
export interface TodoBody {
  title: string;
  due_date?: string | null;
  priority?: TaskPriority;
  customer_id?: number | null;
  account_id?: number | null;
  assignee_id?: number | null;
}

/** `item`/`group` are null when the task went to someone else. */
export interface TodoAnswer {
  task: TaskDetail;
  item: TaskFeedItem | null;
  group: TaskGroupKey | null;
}
