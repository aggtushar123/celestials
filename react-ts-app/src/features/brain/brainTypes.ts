// The /api/v1/brain/ contract (spec 2026-10-05 §4), field for field. Contract
// notes 4 and 5 widen `generated_by` and `improved` to allow null.
import type { AnomalyStatus } from '../anomalies/anomaliesApi';
import type { CurrencyCode } from '../auth/authSlice';
import type { Skipped } from '../campaigns/campaignTypes';
import type { MetricUnit } from '../metrics/metricsSlice';
import type { PlanStatus } from '../plans/planTypes';
import type { RequestStatus } from '../requests/types';
import type { PausedReason, RuleReview } from '../rules/ruleTypes';
import type { SurveyType } from '../surveys/surveyTypes';

export type { MetricUnit };
export type ScopeKey = 'me' | 'team' | 'company';
export const SCOPE_KEYS: readonly ScopeKey[] = ['me', 'team', 'company'];
/** Which direction is good news; 'none' is context. */
export type Better = 'up' | 'down' | 'none';

export interface ScopeOption {
  key: ScopeKey;
  label: string;
}

/** GET scopes/: only the scopes the reader may use, narrowest first. */
export interface ScopesPayload {
  scopes: ScopeOption[];
  default: ScopeKey;
}

export interface ChangedMetric {
  key: string;
  label: string;
  unit: MetricUnit;
  better: Better;
  now: number | null;
  then: number | null;
  change: number | null;
  material: boolean;
}

export interface Driver {
  dimension: string;
  member: string;
  label: string;
  change: number;
}

/** Present only on money metrics in Me and My team, when a customer moved. */
export interface Handover {
  in: number;
  out: number;
  people: string[];
}

export interface ChangedSignal {
  key: string;
  label: string;
  unit: MetricUnit;
  better: Better;
  now: number;
  then: number;
  change: number;
  improved: boolean | null;
  drivers: Driver[];
  handover?: Handover;
}

/** GET changed/?scope= */
export interface ChangedPayload {
  scope: ScopeKey;
  as_of: string;
  /** Null only when Company has no month-end yet. */
  since: string | null;
  since_kind: 'month_end' | 'baseline';
  team_changed_on: string | null;
  currency: CurrencyCode;
  /** A Me or My team scope that covers no customers. */
  empty: boolean;
  metrics: ChangedMetric[];
  signals: ChangedSignal[];
}

export interface ScopeBrief {
  id: number;
  scope: ScopeKey;
  as_of: string;
  baseline: string | null;
  headline: string;
  /** Paragraphs separated by blank lines. */
  body: string;
  watch: string[];
  generated_at: string;
  generated_by: string | null;
  stale: boolean;
}

export interface BriefPayload {
  brief: ScopeBrief | null;
}

/** POST brief/?scope= (201 written, 200 written by another request). */
export interface WrittenBrief {
  brief: ScopeBrief;
}

export interface ScopeExplanation {
  id: number;
  metric: string;
  scope: ScopeKey;
  as_of: string;
  text: string;
  evidence: string[];
  /** Organizations in the scope the reader can't open. */
  hidden: number;
  generated_at: string;
  generated_by: string | null;
  stale: boolean;
}

export interface ExplanationPayload {
  explanation: ScopeExplanation | null;
}

export interface WrittenExplanation {
  explanation: ScopeExplanation;
}

// Records and people Brain's pages name. Controller override: a rule
// review's `detail.counts` is the review's own stored counts, shaped per
// `review_kind`; `detail.review` is the full review payload for the rule's
// owner, otherwise null.

export interface WaitingPerson {
  id: number;
  name: string;
}

export interface WaitingRecord {
  type: 'customer' | 'account';
  id: number;
  name: string;
}

interface RuleReviewDetailBase {
  rule_id: number;
  rule_name: string;
  /** The full review, only for the rule's owner; null otherwise
   *  (controller override). */
  review: RuleReview | null;
}

export interface SurveyReviewDetail extends RuleReviewDetailBase {
  review_kind: 'survey';
  counts: { people: number; records: number };
}

export interface CampaignReviewDetail extends RuleReviewDetailBase {
  review_kind: 'campaign';
  /** `skipped` is a tally by reason, as the backend stores it on the review
   *  (controller fix round 1: `services/rules/reviews.py` counts
   *  `{"reach": …, "skipped": reach.tally()}`), not a single number. */
  counts: { reach: number; skipped: Skipped };
}

export type RuleReviewDetail = SurveyReviewDetail | CampaignReviewDetail;

// What's being done (spec 2026-10-05-brain-doing-design §3). The initiative
// types moved here from features/initiatives/initiativesSlice (deleted in
// Task 7). Contract notes 5, 6, 10 and 11: optional hypothesis, outcome and
// tasks; a nullable initiative owner, plan target date and rule segment;
// `paused_reason` is the rule's own code.

export type InitiativeStatus = 'planned' | 'active' | 'done' | 'abandoned';

export interface InitiativeProgress {
  /** The starting line, captured when the initiative was written. */
  baseline: number | null;
  current: number | null;
  target: number;
  /** 0–100; null when either end is unmeasured. */
  progress_pct: number | null;
  /** Negative once the target date has passed. */
  days_left: number;
  direction: 'up' | 'down';
  unit: MetricUnit | null;
  better: Better | null;
}

/** A task under an initiative (Contract note 5: the serializer's rows). */
export interface InitiativeTask {
  id: number;
  title: string;
  parent_name: string;
  parent_type: 'customer' | 'account';
  parent_id: number;
  assignee_name: string;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed';
}

/** The cut an initiative tracks: a person's book when `dimension` is "owner". */
export interface InitiativeBook {
  dimension: string;
  member: string;
  label: string;
}

export interface DoingInitiative {
  id: number;
  title: string;
  metric: string;
  metric_label: string;
  /** Null: the whole company. */
  for: InitiativeBook | null;
  status: InitiativeStatus;
  owner: WaitingPerson | null;
  target_by: string;
  /** Null: it tracks numbers (the whole company's, or another cut) the
   *  reader can't see in this scope (controller override: fix round 2 —
   *  a book initiative cut to something outside the reader's view). */
  progress: InitiativeProgress | null;
  work: { open: number; done: number; tasks?: InitiativeTask[] };
  can_edit: boolean;
  hypothesis?: string;
  outcome?: string;
}

export interface PlanFigures {
  health_score: number | null;
  arr: number | null;
}

export interface DoingPlan {
  id: number;
  name: string;
  status: PlanStatus;
  record: WaitingRecord;
  owner: WaitingPerson;
  /** Non-null (minor, final review): `Plan.target_date` is required and
   *  `_plan` always calls `.isoformat()` on it, same as `Plan.target_date`
   *  in `planTypes.ts`. */
  target_date: string;
  milestones: { done: number; total: number };
  /** Null: started before starting figures were kept. */
  then: (PlanFigures & { taken_on: string }) | null;
  now: PlanFigures;
}

export interface DoingRuleRun {
  run_on: string;
  fired: number;
  /** Only on the reader's own rules. */
  matched?: number;
  skipped?: number;
}

export interface DoingRule {
  id: number;
  name: string;
  segment: string | null;
  is_active: boolean;
  /** A code, or null when not paused; `paused_message` is the sentence to show. */
  paused_reason: PausedReason | null;
  /** Set only when `paused_reason` is set (controller override: fix round 2). */
  paused_message: string | null;
  mine: boolean;
  /** Whether the reader may open this rule's own page (controller override:
   *  fix round 2) — not the same as `mine`; links on `readable`, not `mine`. */
  readable: boolean;
  /** Null before a rule's first night. */
  last_run: DoingRuleRun | null;
}

/** A registry metric with an owner cut, offered for initiatives outside
 *  Company (Contract note 3). */
export interface TrackableMetric {
  key: string;
  label: string;
  unit: MetricUnit;
  better: Better;
}

/** GET doing/?scope= */
export interface DoingPayload {
  scope: ScopeKey;
  currency: CurrencyCode;
  /** Plans in the scope the reader can't open: counted, never named. */
  hidden: number;
  /** The registry's owner-cut metrics (controller override: fix round 2) —
   *  the book-mode "New initiative" form's metric choices come from here,
   *  not a hard-coded list. */
  trackable: TrackableMetric[];
  initiatives: DoingInitiative[];
  plans: DoingPlan[];
  rules: DoingRule[];
}

/** POST initiatives/?scope=me|team (Contract note 7). */
export interface BookInitiativeWrite {
  title: string;
  hypothesis: string;
  metric: string;
  target_value: string;
  target_by: string;
  status: InitiativeStatus;
  /** My team only. */
  for_user?: number;
}

/** POST /metrics/initiatives/ (Company, unchanged; Contract note 8). */
export interface InitiativeWrite {
  title: string;
  hypothesis: string;
  metric: string;
  dimension: string;
  member: string;
  target_value: string;
  target_by: string;
  owner_id: number | null;
}

/** PATCH initiatives/<id>/ (Contract note 9). */
export type InitiativePatch = Partial<Pick<BookInitiativeWrite, 'title' | 'hypothesis' | 'target_value' | 'target_by' | 'status'>> & {
  outcome?: string;
};

/** GET /auth/members/, as far as "Whose book" reads it (Contract note 4).
 *  `is_active` (minor, final review): the endpoint lists every member of
 *  the organisation, including deactivated ones, who `book_person` refuses
 *  as a target. */
export interface DeskMember {
  id: number;
  name: string;
  reports_to: WaitingPerson | null;
  is_active: boolean;
}

// What customers are saying (spec 2026-10-05-brain-customers-design §3).
// Contract notes 2, 6 and 7: `arr` is a number here (a string on the lists),
// a comment's `record` and a change's `record` may be null.

export interface CustomerAsk {
  id: number;
  title: string;
  status: RequestStatus;
  /** The ARR behind it in this scope (Contract note 2). */
  arr: number;
  companies: number;
  last_90_days: number;
  previous_90_days: number;
}

export interface CustomerAnomaly {
  id: number;
  /** Gated for readers without view_all_accounts, as on /anomalies/. */
  title: string;
  status: AnomalyStatus;
  arr: number;
  companies: number;
  last_seen_at: string;
}

export interface Ranked<T> {
  total: number;
  top: T[];
}

/** `now`/`then` are null under 5 answers in their own window (Contract note 5). */
export interface ScoreFigure {
  now: number | null;
  then: number | null;
  responses: number;
  previous_responses: number;
}

export interface ScoreComment {
  survey_type: SurveyType;
  score: number;
  comment: string;
  record: WaitingRecord | null;
  answered_at: string;
}

export interface CustomerScores {
  nps: ScoreFigure;
  csat: ScoreFigure;
  ces: ScoreFigure;
  comments: ScoreComment[];
  /** This window's comments on records the reader can't open. */
  hidden: number;
}

export type ContactSentiment = 'positive' | 'neutral' | 'negative' | '';

export interface TurnedNegative {
  contact: WaitingPerson;
  record: WaitingRecord | null;
  previous: ContactSentiment;
  changed_at: string;
}

export interface CustomerSentiment {
  negative: number;
  /** The first recorded change among contacts the reader may open, or null. */
  tracking_since: string | null;
  turned_negative: TurnedNegative[];
}

/** GET customers/?scope= */
export interface CustomersPayload {
  scope: ScopeKey;
  currency: CurrencyCode;
  asks: Ranked<CustomerAsk>;
  anomalies: Ranked<CustomerAnomaly>;
  scores: CustomerScores;
  sentiment: CustomerSentiment;
}
