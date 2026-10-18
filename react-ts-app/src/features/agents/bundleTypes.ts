// Agent bundles, delivery 1 (contract revenact-backend
// docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md §1, §4, §5, §10). No em dash.
import type { FeedRecord, PersonRef } from '../work/workTypes';
import type { UserFunction } from '../auth/authSlice';
import type { ActionKind, ActionPreview, AgentKind, SignalSource, UndoState } from './agentTypes';

export type BundleStatus = 'waiting' | 'running' | 'done' | 'partly_done' | 'rejected' | 'expired' | 'superseded';
export type FinishedStatus = Exclude<BundleStatus, 'waiting' | 'running'>;
export const FINISHED_STATUSES: readonly FinishedStatus[] = ['done', 'partly_done', 'rejected', 'expired', 'superseded'];
export type StepStatus = 'proposed' | 'applied' | 'failed' | 'skipped' | 'rejected' | 'expired' | 'undone';
export type RejectReason = 'already_handled' | 'not_relevant' | 'wrong_person' | 'other';

/** A value picked from a tool's list (contract §2.3). */
export interface PickValue {
  id: string;
  name: string;
}

export type StepFieldValue = string | number | boolean | string[] | PickValue | null;

/** A step's result link (contract §4.1, D3-16): an app path, or the tool's own https page. */
export interface StepLink {
  label: string;
  url: string;
  external: boolean;
}

export type PickListName = 'jira_projects' | 'jira_issue_types' | 'jira_priorities' | 'jira_assignees' | 'slack_channels';

export interface PickOption {
  id: string;
  name: string;
  detail: string;
}

/** GET /agents/bundles/<id>/steps/<step>/options/<list>/ (contract §5.2). */
export interface PickListPayload {
  options: PickOption[];
  more: boolean;
  note?: string | null;
}
/** A step's editable payload keys (contract §4.2 `fields`). */
export type StepFields = Record<string, StepFieldValue>;

/** One `{{step N.key}}` in a step's text (contract §4.2). */
export interface Placeholder {
  field: string;
  step: number;
  key: string;
  label: string;
}

/** A department queue's key part: a `User.Function` code (contract D2-5). */
export type Department = UserFunction;

/** Where a bundle came from (contract §3.1). */
export type BundleSource = MessageSource | SlackMessageSource | MeetingSource;

/** The nightly review, or a filed thread or ticket. */
export interface MessageSource {
  kind: 'nightly' | 'thread';
  label: string;
  /** Null for the nightly review. */
  channel: SignalSource | null;
  /** The newest sender's address, or a ticket's requester; '' when unknown. */
  from: string;
  /** Filed emails in the thread; 1 for a ticket; 0 for nightly. */
  messages: number;
  last_message_at: string | null;
  /** A ticket's number, else null. */
  ticket: string | null;
  /** The ticket in its own tool (opens in a new tab), else null. */
  link: string | null;
}

/** Slack bundles (2026-10-17): a Slack message its sender sent to Work.
 *  Once the message is dismissed or purged, sender, excerpt and text are ''
 *  and link and at null. */
export interface SlackMessageSource {
  kind: 'slack_message';
  label: string;
  sender: string;
  /** The message's first 280 characters. */
  excerpt: string;
  text: string;
  link: string | null;
  at: string | null;
  /** Only its sender ever sees it. */
  private: boolean;
  /** No signal channel: kept so `source.channel` reads on any source. */
  channel?: null;
}

/** Sales review report (2026-10-18): the meeting a sales report is for.
 *  The bundle is its organiser's alone. */
export interface MeetingSource {
  kind: 'meeting';
  label: string;
  title: string;
  starts_at: string;
  ends_at: string;
  meeting_id: number;
  /** Only its organiser ever sees it. */
  private: boolean;
  /** No signal channel: kept so `source.channel` reads on any source. */
  channel?: null;
}

/** PATCH /agents/bundles/<id>/steps/<step id>/ (contract §4.1). */
export interface StepSave {
  fields?: StepFields;
  selected?: boolean;
}

export interface BundleStep {
  id: number;
  position: number;
  kind: ActionKind;
  label: string;
  status: StepStatus;
  selected: boolean;
  title: string;
  rationale: string;
  /** Contract §2.1 (SE4-11): why it ended as it did; absent from an older backend. */
  note?: string;
  fields: StepFields;
  editable: string[];
  placeholders: Placeholder[];
  preview: ActionPreview;
  irreversible: boolean;
  outside: boolean;
  can_run: boolean;
  disabled_reason: string | null;
  /** Where the blocked tool is set up (contract §4.1): "/settings/connections", else null. */
  disabled_link: string | null;
  /** The server's result links for this reader (contract §4.1). */
  links: StepLink[];
  /** Ids and app paths a run made (contract §6.2). */
  outputs: Record<string, string | number>;
  error: string;
  expired_reason: string;
  undo: UndoState | null;
  evidence: { label: string; link: string | null }[];
  /** A person saved an edit to it (contract §3.2). */
  edited: boolean;
  /** Guided agent (2026-10-18): what the agent asks before this step, the
   *  server's own words; null (or absent, an older backend) when not guided. */
  question?: string | null;
}

export interface Bundle {
  id: number;
  agent: AgentKind;
  agent_label: string;
  title: string;
  reason: string;
  source: BundleSource;
  record: FeedRecord | null;
  /** 'person': one person's own bundle (a Slack message they sent to Work). */
  routed_to: 'owner' | 'department' | 'admins' | 'person';
  /** Null: the whole company. */
  for: PersonRef | null;
  status: BundleStatus;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  edited_by: PersonRef | null;
  run_by: PersonRef | null;
  run_started_at: string | null;
  run_finished_at: string | null;
  reject_reason: RejectReason | '';
  reject_note: string;
  /** A newer message arrived after someone edited it (contract D2-17). */
  has_newer_message: boolean;
  step_count: number;
  can_run: boolean;
  can_reject: boolean;
  steps: BundleStep[];
  /** routed_to "department": which one (contract §3.1). */
  department: { key: Department; label: string } | null;
  refreshed_at: string | null;
  rejected_by: PersonRef | null;
  /** Waiting, made from a message, and the reader may run a step. */
  can_refresh: boolean;
  /** Contract §2.2: an escalation's person; null or absent for every other bundle. */
  escalation?: Escalation | null;
  /** SE4-26: the reader reads this only as a participant of its Slack thread. */
  participant_view?: boolean;
  /** Guided agent (2026-10-18): answered one question at a time. Absent from an older backend. */
  guided?: boolean;
  priority?: BundlePriority;
  /** The step asked now; null when nothing is asked (or not guided). */
  next_step?: number | null;
  /** "Not now" is offered: a waiting guided bundle whose every waiting step the reader may decide. */
  can_stop?: boolean;
}

export type BundlePriority = 'high' | 'normal';

/** Slack escalations D4 contract §2.2: who has an escalation and where that came from (SE4-12). */
export interface Escalation {
  /** '' when the agent named no department. */
  function: UserFunction | '';
  function_label: string;
  /** The person, with their own department's label ('' for none). */
  handler: { id: number; name: string; function_label: string } | null;
  via: 'thread' | 'unresolved' | 'team' | 'head' | 'nobody' | 'chosen';
  /** The thread's decision; it stays after a Change. */
  decision: { by: string; quote: string; named: string } | null;
  can_change: boolean;
}

/** PATCH /agents/bundles/<id>/handler/ (contract §4): a member, or whoever handles a department. */
export type HandlerBody = { user_id: number } | { user_id: null; function: UserFunction };

export interface BundleAnswer {
  bundle: Bundle;
}

export interface RunStep {
  id: number;
  selected: boolean;
  fields?: StepFields;
}

export interface RunBody {
  steps: RunStep[];
}

export interface HistoryFilters {
  agent: AgentKind | null;
  step_kind: ActionKind | null;
  status: FinishedStatus | null;
  page: number;
}

/** GET /agents/bundles/history/. */
export interface HistoryPayload {
  count: number;
  next: string | null;
  previous: string | null;
  results: Bundle[];
  hidden: number;
}

/** Contract §4.5: department queues are keyed by department code. */
export type QueueKey = 'mine' | 'team' | 'company' | 'history' | 'unassigned' | `department:${Department}`;

export interface QueueRow {
  key: QueueKey;
  label: string;
  /** Null for History, or when this queue's count failed. */
  count: number | null;
  /** Round 2 D3 (contract §4): messages needing a customer in a routed
   *  queue; null elsewhere or when it could not be counted; absent from an
   *  older backend. */
  needs_customer?: number | null;
}

/** GET /work/queues/. */
export interface QueuesPayload {
  queues: QueueRow[];
  failed: string[];
}

/** "42 contacts across 3 organisations" (contract §7.1). */
export interface Audience {
  contacts: number;
  records: number;
  record_noun: string;
}

export interface SurveyStepPreview {
  name: string;
  survey_type: 'nps' | 'csat' | 'ces';
  question: string;
  subject: string;
  intro: string;
  segment: string;
  roles: string[];
  /** Null once the step leaves proposed (contract §7.1). */
  audience: Audience | null;
  limit: number;
}
