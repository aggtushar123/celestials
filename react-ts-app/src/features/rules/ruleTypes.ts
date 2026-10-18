// The Rules contract (revenact-backend feat/rules, docs/API_CONTRACTS.md
// `rules`; backend plan 2026-10-04-rules-backend.md), field for field.
// Every read is computed for the reader over what they may open now.
import type { MadeBy } from '../agents/agentTypes';
import type { SkipReason } from '../campaigns/campaignTypes';
import type { LifecycleValue } from '../organizations/portfolioTypes';
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import type { ContactRole, SegmentRef, SurveyType } from '../surveys/surveyTypes';

export type Trigger = 'entered' | 'left' | 'crossed' | 'schedule';
export type Score = 'csat' | 'nps' | 'ces' | 'health';
export type Direction = 'below' | 'above';
export type Cadence = 'weekly' | 'monthly';
export type PausedReason = '' | 'segment_gone' | 'segment_not_owned' | 'owner_inactive' | 'template_gone' | 'campaign_gone';
export type LifecycleStage = LifecycleValue;
export type NotifyTo = 'me' | 'record_owner' | 'people';
export type Assignee = 'record_owner' | 'me';
export type RuleScope = 'all' | 'mine' | 'shared';

/** Backend Decision 8: `people` is `[]` unless `to` is `people`. */
export interface NotifyAction {
  action: 'notify';
  to: NotifyTo;
  people: number[];
  message: string;
}

export interface TaskAction {
  action: 'task';
  title: string;
  assignee: Assignee;
  due_in_days: number;
}

export interface LifecycleAction {
  action: 'lifecycle';
  stage: LifecycleStage;
}

/** Surveys' fields; `roles` is `[]` for a contact segment. */
export interface SurveyAction {
  action: 'survey';
  survey_type: SurveyType;
  subject: string;
  intro: string;
  roles: ContactRole[];
  without_review: boolean;
}

/** Start a plan (plans spec §4 "Rules additions"), as read: the template a
 *  ref, null once deleted. The builder's draft holds this shape too. */
export interface PlanAction {
  action: 'plan';
  template: { id: number; name: string } | null;
}

/** Start a plan as written: the template's id (Contract note 1). Null only
 *  before one is chosen; the client check stops it. */
export interface PlanActionWrite {
  action: 'plan';
  template: number | null;
}

/** Send a campaign (campaigns spec §4 "Rules additions"), as read: the
 *  campaign a ref, null once deleted. The builder's draft holds this shape. */
export interface CampaignAction {
  action: 'campaign';
  campaign: { id: number; name: string } | null;
  without_review: boolean;
}

/** Send a campaign as written: the campaign's id. */
export interface CampaignActionWrite {
  action: 'campaign';
  campaign: number | null;
  without_review: boolean;
}

export type RuleAction = NotifyAction | TaskAction | LifecycleAction | SurveyAction | PlanAction | CampaignAction;
/** What POST/PATCH rules/ and POST rules/test/ send. */
export type RuleActionWrite = NotifyAction | TaskAction | LifecycleAction | SurveyAction | PlanActionWrite | CampaignActionWrite;
export type ActionType = RuleAction['action'];

/** The six trigger fields; the ones the trigger does not use are blank. */
export interface TriggerFields {
  trigger: Trigger;
  score: Score | '';
  direction: Direction | '';
  threshold: number | null;
  cadence: Cadence | '';
  weekday: number | null;
}

/** `null` before the first night. `fired` is null and `waiting` false for
 *  anyone but the owner (backend Decision 28). */
export interface LastRun {
  run_on: string;
  fired: number | null;
  waiting: boolean;
}

/** GET /rules/: a row. `segment.id` is null for a reader who may not read
 *  the segment; `segment` is null once it is deleted. */
export interface RuleRow extends TriggerFields {
  id: number;
  name: string;
  is_active: boolean;
  paused_reason: PausedReason;
  paused_message: string;
  segment: SegmentRef | null;
  actions: RuleAction[];
  cooldown_days: number;
  sharing: Sharing;
  owner: PersonRef;
  is_owner: boolean;
  last_run: LastRun | null;
  updated_at: string;
  /** The agent action that made it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
}

/** GET/PATCH /rules/<id>/ and POST's 201. */
export interface Rule extends RuleRow {
  shared_with: PersonRef[];
  created_at: string;
}

/** POST /rules/ and PATCH (the builder sends it whole, plan Decision 6). */
export interface RuleWrite extends TriggerFields {
  name: string;
  segment: number | null;
  actions: RuleActionWrite[];
  cooldown_days: number;
  is_active: boolean;
  sharing: Sharing;
  shared_with?: number[];
}

/** POST /rules/test/: a rule body (`name` optional), plus a rule the
 *  caller owns that lends its stored scores and cooldowns. */
export interface RuleTestRequest extends TriggerFields {
  name?: string;
  segment: number | null;
  actions: RuleActionWrite[];
  cooldown_days: number;
  rule?: number;
}

export interface NamedRecord {
  kind: SegmentKind;
  id: number;
  name: string;
}

export interface TestSkips {
  cooldown: number;
  cap: number;
  not_visible: number;
}

export interface RuleTestResult {
  count: number;
  records: NamedRecord[];
  hidden_count: number;
  skipped: TestSkips;
  /** With a plan action only. */
  plans?: { would_start: number; already_open: number };
  /** With a campaign action only. */
  campaigns?: { would_email: number; skipped: number };
}

/** A night's skips; `failed` and `nobody` count records no action acted on
 *  (every action failed, or every one was skipped). */
export interface RunSkips extends TestSkips {
  failed: number;
  nobody: number;
}

export type ReviewStatus = 'waiting' | 'approved' | 'skipped' | 'expired';

/** GET /rules/<id>/runs/: for anyone but the owner, `matched`, `skipped`
 *  and `review` are null and `fired` counts only what they may open now. */
export interface RunRow {
  id: number;
  run_on: string;
  matched: number | null;
  fired: number;
  skipped: RunSkips | null;
  review: { id: number; status: ReviewStatus } | null;
  /** Every review of the night, a survey's and a campaign's (Contract note 12). */
  reviews?: { id: number; kind: 'survey' | 'campaign'; status: ReviewStatus }[];
  hidden_count: number;
  started_at: string | null;
  finished_at: string | null;
}

/** 20 a page, newest first; `next` is opaque. */
export interface RunsPage {
  results: RunRow[];
  next: string | null;
}

export type ActionStatus = 'done' | 'unchanged' | 'queued' | 'skipped' | 'failed';

/** `detail` never holds personal data (backend contract). */
export interface ActionResult {
  action: ActionType;
  status: ActionStatus;
  detail: string;
}

/** `name` is null for a record gone since (contract gap 4). */
export interface RunRecord {
  kind: SegmentKind;
  id: number;
  name: string | null;
  outcome: 'fired' | 'skipped';
  reason: '' | 'cooldown' | 'failed' | 'nobody';
  actions: ActionResult[];
}

/** GET /rules/<id>/runs/<run_id>/: only the records the reader may open
 *  now, fired first, unpaginated (at most 400); the rest a count. */
export interface RunDetail {
  id: number;
  run_on: string;
  hidden_count: number;
  records: RunRecord[];
}

export interface ReviewRule extends TriggerFields {
  id: number;
  name: string;
  segment: { id: number; name: string; kind: SegmentKind } | null;
}

/** `{}` while waiting; `{survey_send_id}` or `{campaign_send_id}` once
 *  approved; `{error}` after a refused approval (the review stays waiting). */
export interface ReviewResult {
  survey_send_id?: number;
  campaign_send_id?: number;
  error?: Record<string, unknown>;
}

interface ReviewBase {
  id: number;
  rule: ReviewRule;
  run_on: string;
  status: ReviewStatus;
  result: ReviewResult;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

/** A night's survey. `kind` is absent from an older backend (Contract note 11). */
export interface SurveyReview extends ReviewBase {
  kind?: 'survey';
  action: SurveyAction;
  counts: { people: number; records: number };
  organisation_name: string;
  /** Not sent: the backend counts records, never names them
   *  (`review_payload`). Optional so a future named list cannot crash. */
  records?: NamedRecord[];
  hidden_count?: number;
}

/** A night's campaign (campaigns spec §4): the campaign and the dry
 *  claim's counts. The backend counts records, never names them
 *  (`review_payload`), so `records` and `hidden_count` are absent today;
 *  they are read only when present (Contract note 11). */
export interface CampaignReview extends ReviewBase {
  kind: 'campaign';
  campaign: { id: number; name: string } | null;
  counts: { reach: number; skipped: Record<SkipReason, number> };
  records?: NamedRecord[];
  hidden_count?: number;
  /** The rule's action, frozen at the night it ran (controller ruling F1). */
  action?: { action: 'campaign'; campaign: number; without_review: boolean };
}

/** GET /rules/reviews/: the caller's own, newest first, at most 100. */
export type RuleReview = SurveyReview | CampaignReview;

export type ApproveAnswer = { survey_send_id: number } | { campaign_send_id: number };
