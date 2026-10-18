// Agents, deliveries 1 to 3 (contract revenact-backend
// docs/superpowers/plans/2026-10-08-agents-actions-api.md). No em dash.
import type { AgentTone } from '../auth/authSlice';
import type { PersonRef, TaskPriority } from '../work/workTypes';
import type { Audience, SurveyStepPreview } from './bundleTypes';
import type { PlanKind } from '../plans/planTypes';
import type { SegmentKind } from '../segments/segmentTypes';

export type AgentKind = 'cs' | 'sales' | 'ops';
export const AGENT_KINDS: readonly AgentKind[] = ['cs', 'sales', 'ops'];

export type ActionKind =
  | 'record.lifecycle'
  | 'record.owner'
  | 'record.attribute'
  | 'task.create'
  | 'task.reassign'
  | 'task.redate'
  | 'task.complete'
  | 'task.snooze'
  | 'note.create'
  | 'draft.reply'
  | 'plan.start'
  | 'segment.create'
  | 'scenario.create'
  | 'campaign.create'
  | 'campaign.send'
  | 'survey.send'
  | 'mail.send_reply'
  | 'slack.reply'
  | 'jira.create'
  | 'jira.assign'
  | 'jira.comment'
  | 'canvas.create'
  | 'plan.template'
  | 'survey.record'
  | 'segment.pin'
  | 'scenario.run'
  | 'record.diagnose'
  | 'mail.compose'
  | 'mail.send_draft'
  | 'report.sales'
  | 'initiative.create';
/** The contract's order (deliveries 2 and 3 put their kinds before initiative.create). */
export const ACTION_KINDS: readonly ActionKind[] = [
  'record.lifecycle',
  'record.owner',
  'record.attribute',
  'task.create',
  'task.reassign',
  'task.redate',
  'task.complete',
  'task.snooze',
  'note.create',
  'draft.reply',
  'plan.start',
  'segment.create',
  'scenario.create',
  'campaign.create',
  'campaign.send',
  'survey.send',
  'mail.send_reply',
  'slack.reply',
  'jira.create',
  'jira.assign',
  'jira.comment',
  'canvas.create',
  'plan.template',
  'survey.record',
  'segment.pin',
  'scenario.run',
  'record.diagnose',
  'mail.compose',
  'mail.send_draft',
  'report.sales',
  'initiative.create',
];

/** Agent bundles D3: the kinds that act outside Revenact (contract §2). */
export const OUTSIDE_KINDS: readonly ActionKind[] = ['mail.send_reply', 'slack.reply', 'jira.create', 'jira.assign', 'jira.comment'];

/** contract §2.1: `from` is the reader's own mailbox while waiting, the sender once sent. */
export interface MailPreview {
  from: string | null;
  to: string[];
  cc: string[];
  subject: string;
  excerpt: string;
  threaded: boolean;
}

/** contract §2.2. */
export interface SlackPreview {
  channel: string;
  in_thread: boolean;
  as: string;
  excerpt: string;
  /** Round 2 D2: whether the channel is one Revenact syncs (optional: an older backend omits it). */
  synced?: boolean;
  /** SE4-15: the reader posts as themselves; then `as` is their name. */
  as_you?: boolean;
}

/** Round 2 D2 contract §3.4: why a Jira step acts as the connection. */
export type JiraLinkHint = 'none' | 'other_site' | 'off' | null;

/** contract §2.3: `matched_later`, the model's member, matched by email when it runs. */
export interface JiraAssignee {
  name: string;
  matched_later: boolean;
}

export interface JiraPreview {
  site: string;
  project: string;
  issue_type: string;
  summary: string;
  excerpt: string;
  priority: string | null;
  assignee: JiraAssignee | null;
  as: string;
  as_you?: boolean;
  link?: JiraLinkHint;
}

/** contract §2.4. */
export interface JiraAssignPreview {
  site: string;
  issue: string;
  assignee: JiraAssignee | null;
  as: string;
  as_you?: boolean;
  link?: JiraLinkHint;
}

/** Round 2 D1 contract §2: an internal comment on a Jira issue. */
export interface JiraCommentPreview {
  site: string;
  /** A key ("SUP-12"), or a placeholder the step's `placeholders` names. */
  issue: string;
  excerpt: string;
  as: string;
  as_you?: boolean;
  link?: JiraLinkHint;
  internal: boolean;
}

export type ActionLevel = 'auto' | 'ask' | 'never';
export type ActionStatus = 'proposed' | 'applied' | 'rejected' | 'expired' | 'undone' | 'failed' | 'skipped';
export const ACTION_STATUSES: readonly ActionStatus[] = ['proposed', 'applied', 'rejected', 'expired', 'undone'];
export type SkippedReason = 'ai_off' | 'disabled' | 'no_actions' | 'budget' | 'credits' | 'failed';

/** Where agents read messages from (agent bundles D2 contract §1.1). */
export type SignalSource = 'mail' | 'slack' | 'zendesk' | 'freshdesk' | 'jira' | 'webhook';
export type SignalInterval = '30m' | '1h' | '4h' | '24h';

export interface SignalSourceRow {
  key: SignalSource;
  label: string;
  enabled: boolean;
  /** The workspace has this source connected. */
  connected: boolean;
}

/** The fast lane's rules (round 2 D3 contract §5.1). */
export interface FastLaneRules {
  jira_priority: boolean;
  slack_connectors: number[];
  senders: string[];
  words: string[];
  poor_health: boolean;
}

/** GET /agents/settings/ `signals.fast_lane` (round 2 D3 contract §5.1). */
export interface FastLaneSettings {
  on: boolean;
  rules: FastLaneRules;
  per_hour: number;
  per_day: number;
  used_hour: number;
  used_day: number;
  limits: { per_hour: number; per_day: number; senders: number; words: number };
  slack_choices: { id: number; name: string }[];
}

/** GET /agents/settings/ `signals` (contract §4.8). */
export interface SignalSettings {
  interval: SignalInterval;
  intervals: { value: SignalInterval; label: string }[];
  sources: SignalSourceRow[];
  last_run_at: string | null;
  /** Absent from an older backend. */
  fast_lane?: FastLaneSettings;
}

export interface LastRun {
  at: string;
  proposed: number;
  applied: number;
  dropped: number;
  skipped_reason: SkippedReason | null;
}

export interface AgentCard {
  kind: AgentKind;
  label: string;
  enabled: boolean;
  monthly_credits: number;
  spent_this_month: number;
  /** YYYY-MM-DD, the first of next month in the workspace timezone. */
  resets_on: string;
  last_run: LastRun | null;
  /** Conversations this agent was chosen for that wait on credits (contract D2-23). */
  waiting_threads: number;
  waiting_reason: 'budget' | 'credits' | null;
}

export interface ActionKindSpec {
  kind: ActionKind;
  label: string;
  example: string;
  max_level: ActionLevel;
  agents: AgentKind[];
  /** Can't be undone once it ran (agent bundles D1 §2). */
  irreversible: boolean;
  /** Acts outside Revenact; always Ask (D21). */
  outside: boolean;
  /** The grid shows Ask, disabled (an outside kind). */
  locked: boolean;
}

/** Every agent, and every kind that agent can use. */
export type Levels = Record<AgentKind, Partial<Record<ActionKind, ActionLevel>>>;

/** GET /agents/settings/. */
export interface AgentSettings {
  ai_enabled: boolean;
  tone: AgentTone;
  agents: AgentCard[];
  kinds: ActionKindSpec[];
  levels: Levels;
  plan_monthly_credits: number;
  can_edit: boolean;
  /** manage_org_settings or view_all_accounts: the Run now rule. */
  can_run: boolean;
  signals: SignalSettings;
}

/** PATCH /agents/settings/: any subset. */
export interface AgentSettingsPatch {
  ai_enabled?: boolean;
  tone?: AgentTone;
  agents?: Partial<Record<AgentKind, { enabled?: boolean; monthly_credits?: number }>>;
  levels?: Partial<Record<AgentKind, Partial<Record<ActionKind, ActionLevel>>>>;
  signal_interval?: SignalInterval;
  signal_sources?: Partial<Record<SignalSource, boolean>>;
  fast_lane?: { on?: boolean; rules?: Partial<FastLaneRules>; per_hour?: number; per_day?: number };
}

export interface ActionRecord {
  kind: 'customer' | 'account';
  id: number;
  name: string;
}

/** draft.reply's preview (delivery 2): `excerpt` is the reply's first 280 characters. */
export type DraftPreview =
  | { channel: 'email'; to: string; subject: string; excerpt: string }
  | { channel: 'ticket'; ticket: string; subject: string; excerpt: string };

/** Delivery 3 previews (contract "Previews (per reader)"). `members` and
 *  `people` count only what this reader may open; `trigger` and `steps` are
 *  the server's display sentences, shown as they come. */
export interface SegmentPreview {
  kind: SegmentKind;
  name: string;
  conditions: number;
  members: number;
}
export interface ScenarioPreview {
  name: string;
  segment: string;
  trigger: string;
  steps: string[];
}
export interface CampaignPreview {
  name: string;
  segment: string;
  roles: string[];
  subject: string;
  /** The body's first 280 characters. */
  excerpt: string;
  /** Null once the step leaves proposed (contract §7.2). */
  audience?: Audience | null;
  /** `campaign.send` only: always null, a campaign has no audience cap (contract §7.2). */
  limit?: number | null;
}
export interface CanvasPreview {
  name: string;
  people: number;
}
export interface TemplatePreview {
  kind: PlanKind;
  name: string;
  milestones: number;
  tasks: number;
}

/** Slack bundles (2026-10-17): a survey to one record's contacts, now or once a Jira issue is resolved. */
export type SurveyTiming = 'now' | 'after_jira';
export type SurveyWaitStatus = 'waiting' | 'due' | 'sent' | 'refused' | 'cancelled' | 'expired';
export interface RecordSurveyPreview {
  survey_type: 'nps' | 'csat' | 'ces';
  question: string;
  subject: string;
  intro: string;
  roles: string[];
  record: string;
  timing: SurveyTiming;
  /** A key ("KAN-12"), a placeholder the step's `placeholders` names, or null. */
  issue: string | null;
  /** Null once the step leaves proposed. */
  audience: Audience | null;
  /** A held survey's state after the run; null before it or for one sent now. */
  wait: { status: SurveyWaitStatus; label: string } | null;
}
/** Slack bundles: pin a record into a segment; `from` and `to` are display strings. */
export interface SegmentPinPreview {
  segment: { id: number | null; name: string; members: number };
  record: string;
  from: string;
  to: string;
}
/** Slack bundles: run one scenario on a record; `run` is null until it ran. */
export interface ScenarioRunPreview {
  scenario: { id: number; name: string };
  record: string;
  run: { id: number; status: 'success' | 'failed'; note: string } | null;
}

/** Guided agent (2026-10-18): where a diagnosis finding came from. `url` is
 *  the tool's own https page, the record's app path, or null. */
export type FindingSourceKind = 'ticket' | 'call' | 'email' | 'slack' | 'health' | 'contact';
export interface DiagnoseFinding {
  text: string;
  source: { kind: FindingSourceKind; label: string; url: string | null };
}
/** `record.diagnose`: `summary` is null before it runs; `""` with
 *  `summary_hidden` when it rests on mail only its runner may read. */
export interface DiagnosePreview {
  record: string;
  reads: string[];
  counts: Record<string, number>;
  summary: string | null;
  summary_hidden: boolean;
  findings: DiagnoseFinding[];
}
/** A guided email's person: `address` is null for anyone but the draft's owner. */
export interface MailPerson {
  name: string;
  address: string | null;
}
/** `mail.compose`: only the draft's owner reads its address, subject and body. */
export interface ComposePreview {
  record: string;
  to: MailPerson | null;
  from: string | null;
  subject: string | null;
  body: string | null;
  draft_id: number | null;
  private: boolean;
  owner: string | null;
}
/** `mail.send_draft`: `to` is null until the draft is written. */
export interface SendPreview {
  to: MailPerson | null;
  from: string | null;
  subject: string | null;
  excerpt: string | null;
  draft_id: number | null;
  sent: boolean;
  shared: boolean;
  private: boolean;
}

/** Sales review report (2026-10-18): a deal in a report list. `record` is
 *  the organisation (`customer`) or account it sits on. */
export interface SalesReportDeal {
  id: number;
  name: string;
  record: { type: 'customer' | 'account'; id: number; name: string };
  /** MRR, a decimal string in the report's currency. */
  amount: string;
  closed_on?: string;
  stage?: string;
  stage_label?: string;
  closes_on?: string;
}
export interface SalesReportStage {
  stage: string;
  label: string;
  count: number;
  amount: string;
  moved_in: number;
  /** Always null while stage history isn't recorded. */
  moved_out: number | null;
}
export interface SalesReportTotals {
  won_count: number;
  won_amount: string;
  lost_count: number;
  lost_amount: string;
  closing_count: number;
  closing_amount: string;
  open_count: number;
  open_amount: string;
  /** A whole percent; null with no closed deals. */
  win_rate: number | null;
}
/** The stored report, for the person who ran the step only. */
export interface SalesReport {
  period: { from: string; to: string };
  currency: string;
  generated_at: string;
  won: SalesReportDeal[];
  lost: SalesReportDeal[];
  closing: SalesReportDeal[];
  stages: SalesReportStage[];
  totals: SalesReportTotals;
  /** False: moves out of a stage aren't recorded yet. */
  stage_history: boolean;
  /** '' when the model failed or there were no credits. */
  summary: string;
}
/** `report.sales`: the counts before it runs; `report` and `download_url`
 *  once it ran, for its runner only (null for anyone else). */
export interface SalesReportPreview {
  meeting: { title: string; starts_at: string };
  period: { from: string; to: string };
  counts: { won: number; lost: number; closing: number; open: number };
  report: SalesReport | null;
  download_url: string | null;
}

/** Shaped by the kind (contract "preview"); `from` and `to` are display strings. */
export interface ActionPreview {
  mail?: MailPreview;
  slack?: SlackPreview;
  jira?: JiraPreview;
  jira_assign?: JiraAssignPreview;
  jira_comment?: JiraCommentPreview;
  field?: string;
  from?: string;
  to?: string;
  /** `id` is null for a task the reader can't open or one removed since (delivery 2 follow-up). */
  task?: { id?: number | null; title: string; assignee?: PersonRef | null; due_date?: string; priority?: TaskPriority };
  note?: { title: string };
  initiative?: { metric: string; target: string };
  draft?: DraftPreview;
  plan?: { template: string; milestones: number; tasks: number };
  segment?: SegmentPreview;
  scenario?: ScenarioPreview;
  campaign?: CampaignPreview;
  canvas?: CanvasPreview;
  template?: TemplatePreview;
  survey?: SurveyStepPreview;
  record_survey?: RecordSurveyPreview;
  segment_pin?: SegmentPinPreview;
  scenario_run?: ScenarioRunPreview;
  diagnose?: DiagnosePreview;
  compose?: ComposePreview;
  send?: SendPreview;
  sales_report?: SalesReportPreview;
}

export type UndoReason = 'expired' | 'cant_decide' | 'changed_since' | 'irreversible';

export interface UndoState {
  allowed: boolean;
  /** Null for an irreversible step (contract §3). */
  until: string | null;
  reason: UndoReason | null;
}

/** What an action made: each key is null unless that kind made it.
 *  `scenario.create` sets `rule_id` and `segment_id`; `campaign.create`
 *  sets `campaign_id` and `segment_id` (contract "New kinds"). */
export interface ActionResult {
  task_id: number | null;
  note_id: number | null;
  initiative_id: number | null;
  draft_id: number | null;
  plan_id: number | null;
  segment_id: number | null;
  rule_id: number | null;
  campaign_id: number | null;
  canvas_id: number | null;
  template_id: number | null;
}

/** `made_by` on a segment, rule, campaign, map or plan template an agent
 *  action made (contract "Made by the agent"). `approved_by` is the
 *  action's decider (contract question 1: typed nullable). */
export interface MadeBy {
  agent: AgentKind;
  approved_by: PersonRef | null;
}

export interface AgentAction {
  id: number;
  agent: AgentKind;
  kind: ActionKind;
  /** The bundle this action is a step of (agent bundles D1, frontend needs). */
  bundle: number;
  title: string;
  status: ActionStatus;
  /** Null for workspace-level kinds: initiative.create, and segment.create, scenario.create, campaign.create and plan.template (delivery 3). */
  record: ActionRecord | null;
  preview: ActionPreview;
  rationale: string;
  /** Empty unless the reader holds view_all_accounts; `link` is null for workspace-level actions. */
  evidence: { label: string; link: string | null }[];
  decided_by: PersonRef | null;
  decided_at: string | null;
  /** Applied with no person (Auto). */
  auto: boolean;
  applied_at: string | null;
  /** Null unless `status` is `applied`. */
  undo: UndoState | null;
  undone_by: PersonRef | null;
  undone_at: string | null;
  result: ActionResult;
  created_at: string;
}

/** POST approve/: overrides for `task.create` only. */
export interface ApproveBody {
  assignee_id?: number;
  title?: string;
  due_date?: string;
  priority?: TaskPriority;
}
