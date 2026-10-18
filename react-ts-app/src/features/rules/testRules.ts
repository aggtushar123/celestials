// Test-only: rules in the backend's contract shapes (revenact-backend
// feat/rules, docs/API_CONTRACTS.md `rules`) and one fetch stub for every
// endpoint the Rules pages and the Review Queue's From your rules read. It
// keeps state: saves, switches, the nightly run (`runNight`), and an
// approval that creates a survey send in the Surveys stub. Paths it does
// not own fall through to stubSurveys, then stubSegments. The viewer is ME
// (Alice, id 1) of "Acme Inc".
import { vi } from 'vitest';
import { campaignRef, campaignUsable } from '../campaigns/testCampaignFixtures';
import { NO_SKIPS } from '../campaigns/campaignText';
import { formatDate } from '../customers/formatters';
import { templateRef } from '../plans/testTemplates';
import type { PersonRef } from '../segments/segmentTypes';
import { CARL, DANA, ME, SEGMENTS, TEAM } from '../segments/testSegments';
import { NOW, stubSurveys, type StoredSend, type SurveysStub } from '../surveys/testSurveys';
import { SAY, SCORE_RANGES, thresholdRange } from './ruleOptions';
import type {
  ActionResult,
  CampaignAction,
  CampaignReview,
  NamedRecord,
  NotifyAction,
  PlanAction,
  ReviewRule,
  Rule,
  RuleAction,
  RuleActionWrite,
  RuleReview,
  RuleRow,
  RuleTestResult,
  RunDetail,
  RunRow,
  Score,
  SurveyAction,
} from './ruleTypes';

type Answer = { status: number; body: unknown };

/** A rule as the stub keeps it; `last_run` is computed on every read. */
export type StoredRule = Omit<Rule, 'last_run'>;
/** A night with the owner's own figures and what a reader may count. */
export interface StubRun extends RunRow {
  rule: number;
  reader_fired: number;
}

export const NOTIFY_ME_ACTION: NotifyAction = { action: 'notify', to: 'me', people: [], message: '' };
export const SURVEY_NPS: SurveyAction = {
  action: 'survey',
  survey_type: 'nps',
  subject: 'A quick question from Acme Inc',
  intro: '',
  roles: ['champion', 'decision_maker'],
  without_review: false,
};

const RENEWAL_RISK = { id: 7, name: 'Renewal risk', kind: 'customer' as const };
const CHAMPIONS = { id: 9, name: 'Champions', kind: 'contact' as const };
const EMEA = { id: 8, name: 'EMEA accounts', kind: 'account' as const };
const BASE = {
  paused_reason: '' as const,
  paused_message: '',
  score: '' as const,
  direction: '' as const,
  threshold: null,
  cadence: '' as const,
  weekday: null,
  cooldown_days: 30,
  shared_with: [] as PersonRef[],
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-03T09:00:00Z',
};

/** Mine, on, shared with the workspace. */
export const RENEWAL_WATCH: StoredRule = {
  ...BASE, id: 5, name: 'Renewal watch', is_active: true, segment: RENEWAL_RISK, trigger: 'crossed', score: 'csat', direction: 'below', threshold: 60,
  actions: [SURVEY_NPS, NOTIFY_ME_ACTION], sharing: 'workspace', owner: ME, is_owner: true,
};
/** Mine, off, never run. */
export const WELCOME_TASKS: StoredRule = {
  ...BASE, id: 6, name: 'Welcome tasks', is_active: false, segment: CHAMPIONS, trigger: 'entered',
  actions: [{ action: 'task', title: 'Say hello', assignee: 'record_owner', due_in_days: 3 }], sharing: 'private', owner: ME, is_owner: true,
};
/** Mine: it switched itself off when its segment was deleted. */
export const ORPHAN: StoredRule = {
  ...BASE, id: 7, name: 'Old churn watch', is_active: false, paused_reason: 'segment_gone', paused_message: 'Its segment was deleted.', segment: null,
  trigger: 'left', actions: [NOTIFY_ME_ACTION], sharing: 'private', owner: ME, is_owner: true,
};
/** Carl's, on, shared with me by name. */
export const CARL_RULE: StoredRule = {
  ...BASE, id: 8, name: 'EMEA renewals', is_active: true, segment: EMEA, trigger: 'schedule', cadence: 'weekly', weekday: 0,
  actions: [{ action: 'lifecycle', stage: 'renewal' }], sharing: 'people', shared_with: [ME], owner: CARL, is_owner: false,
};
/** Dana's, private: unreadable, so a 404 like a missing id. */
export const DANA_RULE: StoredRule = {
  ...BASE, id: 9, name: "Dana's rule", is_active: true, segment: null, trigger: 'entered', actions: [NOTIFY_ME_ACTION], sharing: 'private', owner: DANA, is_owner: false,
};
/** Start a Save plan (plans spec §1.8). */
export const SAVE_ACTION: PlanAction = { action: 'plan', template: { id: 3, name: 'Save plan' } };
/** Mine: it switched itself off when its plan template was deleted. Not in
 *  RULES, so the Rules list's tests keep their four rows. */
export const SAVE_RULE: StoredRule = {
  ...BASE, id: 10, name: 'Save at-risk renewals', is_active: false, paused_reason: 'template_gone', paused_message: 'Its plan template was deleted.',
  segment: RENEWAL_RISK, trigger: 'entered', actions: [{ action: 'plan', template: null }], sharing: 'private', owner: ME, is_owner: true,
};
/** Records that already have an open plan from any template, for a night. */
const ALREADY_OPEN = new Set(['customer:1']);
/** Email Win-back (campaigns spec §1.8), waiting for review. */
export const WIN_BACK_ACTION: CampaignAction = { action: 'campaign', campaign: { id: 11, name: 'Win-back' }, without_review: false };
/** Mine, on: Win-back to whoever enters Renewal risk. Not in RULES. */
export const WIN_BACK_RULE: StoredRule = {
  ...BASE, id: 11, name: 'Win-back watch', is_active: true, segment: RENEWAL_RISK, trigger: 'entered', actions: [WIN_BACK_ACTION], sharing: 'private', owner: ME, is_owner: true,
};
/** Mine: it switched itself off when its campaign was archived. Not in RULES. */
export const CAMPAIGN_GONE_RULE: StoredRule = {
  ...BASE, id: 12, name: 'Old win-back', is_active: false, paused_reason: 'campaign_gone', paused_message: 'Its campaign was archived or deleted.',
  segment: RENEWAL_RISK, trigger: 'entered', actions: [{ action: 'campaign', campaign: null, without_review: false }], sharing: 'private', owner: ME, is_owner: true,
};
export const RULES: StoredRule[] = [RENEWAL_WATCH, WELCOME_TASKS, ORPHAN, CARL_RULE, DANA_RULE];

const NO_RUN_SKIPS = { cooldown: 0, cap: 0, not_visible: 0, failed: 0, nobody: 0 };
const at = (day: string) => ({ started_at: `${day}T02:00:00Z`, finished_at: `${day}T02:00:05Z` });
export const RUNS: StubRun[] = [
  { id: 9, rule: 5, run_on: '2026-10-04', matched: 5, fired: 3, skipped: { ...NO_RUN_SKIPS, cooldown: 1, not_visible: 1 }, review: { id: 2, status: 'waiting' }, hidden_count: 0, reader_fired: 3, ...at('2026-10-04') },
  { id: 8, rule: 5, run_on: '2026-10-03', matched: 1, fired: 1, skipped: NO_RUN_SKIPS, review: { id: 3, status: 'waiting' }, hidden_count: 0, reader_fired: 1, ...at('2026-10-03') },
  { id: 7, rule: 5, run_on: '2026-10-02', matched: 2, fired: 1, skipped: { ...NO_RUN_SKIPS, nobody: 1 }, review: null, hidden_count: 0, reader_fired: 1, ...at('2026-10-02') },
  { id: 12, rule: 8, run_on: '2026-09-28', matched: 4, fired: 3, skipped: NO_RUN_SKIPS, review: null, hidden_count: 2, reader_fired: 1, ...at('2026-09-28') },
];

const QUEUED = { action: 'survey' as const, status: 'queued' as const, detail: '' };
const NOTIFIED = { action: 'notify' as const, status: 'done' as const, detail: '' };
const fired = (id: number, name: string) => ({ kind: 'customer' as const, id, name, outcome: 'fired' as const, reason: '' as const, actions: [QUEUED, NOTIFIED] });
export const RUN_RECORDS: Record<number, RunDetail> = {
  9: {
    id: 9, run_on: '2026-10-04', hidden_count: 0,
    records: [fired(1, 'Globex'), fired(2, 'Initech'), fired(7, 'Pizza Hut'), { kind: 'customer', id: 6, name: 'Shopify', outcome: 'skipped', reason: 'cooldown', actions: [] }],
  },
  8: { id: 8, run_on: '2026-10-03', hidden_count: 0, records: [fired(7, 'Pizza Hut')] },
  // A record deleted since (name null), and one nothing happened to: its
  // only action was skipped (backend nightly.skip_reason).
  7: {
    id: 7, run_on: '2026-10-02', hidden_count: 0,
    records: [
      { kind: 'customer', id: 3, name: null, outcome: 'fired', reason: '', actions: [NOTIFIED] },
      { kind: 'customer', id: 4, name: 'Umbrella', outcome: 'skipped', reason: 'nobody', actions: [{ action: 'notify', status: 'skipped', detail: 'nobody to notify may open it' }] },
    ],
  },
  12: {
    id: 12, run_on: '2026-09-28', hidden_count: 2,
    records: [{ kind: 'account', id: 14, name: 'Pizza EMEA', outcome: 'fired', reason: '', actions: [{ action: 'lifecycle', status: 'done', detail: 'live → renewal' }] }],
  },
};

/** Surveys' refusal over 500 people, as stored on a review. */
export const TOO_MANY = { segment: ['This survey would reach 612 people; the most is 500.'] };

function reviewRule(rule: StoredRule): ReviewRule {
  const segment = rule.segment && rule.segment.id !== null ? { id: rule.segment.id, name: rule.segment.name, kind: rule.segment.kind } : null;
  return { id: rule.id, name: rule.name, trigger: rule.trigger, score: rule.score, direction: rule.direction, threshold: rule.threshold, cadence: rule.cadence, weekday: rule.weekday, segment };
}

/** Night 9's survey, waiting. */
export const WAITING: RuleReview = {
  id: 2, kind: 'survey', rule: reviewRule(RENEWAL_WATCH), run_on: '2026-10-04', action: SURVEY_NPS, counts: { people: 6, records: 4 }, organisation_name: 'Acme Inc',
  status: 'waiting', result: {}, created_at: '2026-10-04T02:00:05Z', expires_at: '2026-10-11T12:00:05Z', decided_at: null,
};
/** Night 8's survey: approved once, refused by Surveys, still waiting. */
export const REFUSED: RuleReview = {
  ...WAITING, id: 3, run_on: '2026-10-03', counts: { people: 612, records: 204 }, result: { error: TOO_MANY },
  created_at: '2026-10-03T02:00:05Z', expires_at: '2026-10-10T12:00:05Z',
};
export const REVIEWS: RuleReview[] = [WAITING, REFUSED];

/** Win-back watch's campaign for 4 Oct, waiting. As the backend sends it:
 *  records are counted, never named (`review_payload`). */
export const CAMPAIGN_REVIEW: CampaignReview = {
  id: 4, kind: 'campaign', rule: reviewRule(WIN_BACK_RULE), run_on: '2026-10-04', campaign: { id: 11, name: 'Win-back' },
  counts: { reach: 2, skipped: { ...NO_SKIPS, recent_campaign: 1 } },
  action: { action: 'campaign', campaign: 11, without_review: false },
  status: 'waiting', result: {}, created_at: '2026-10-04T02:00:05Z', expires_at: '2026-10-11T12:00:05Z', decided_at: null,
};

/** POST /rules/test/ for each of my segments (7 Renewal risk, 9 Champions). */
export const TESTS: Record<number, RuleTestResult> = {
  7: {
    count: 3,
    records: [{ kind: 'customer', id: 1, name: 'Globex' }, { kind: 'customer', id: 2, name: 'Initech' }, { kind: 'customer', id: 7, name: 'Pizza Hut' }],
    hidden_count: 1,
    skipped: { cooldown: 1, cap: 0, not_visible: 1 },
  },
  9: { count: 2, records: [{ kind: 'contact', id: 51, name: 'Sam Patel' }, { kind: 'contact', id: 52, name: 'Lee Wong' }], hidden_count: 0, skipped: { cooldown: 0, cap: 0, not_visible: 0 } },
};

/** The night `runNight` runs, and whom it fires for each segment. */
export const NIGHT_DAY = '2026-10-05';
/** `unseen`: nobody a notify would tell may open it, so the notify is
 *  skipped; a record whose every action is skipped is skipped `nobody`. */
type NightHit = NamedRecord & { unseen?: boolean };
const NIGHT: Record<number, NightHit[]> = {
  7: [{ kind: 'customer', id: 1, name: 'Globex' }, { kind: 'customer', id: 7, name: 'Pizza Hut' }],
  9: [{ kind: 'contact', id: 51, name: 'Sam Patel' }, { kind: 'contact', id: 53, name: 'Kim Lee', unseen: true }],
};
const NOBODY_DETAIL = 'nobody to notify may open it';

const TRIGGER_FIELDS = ['trigger', 'score', 'direction', 'threshold', 'cadence', 'weekday'];
const NOT_FOUND = { status: 404, body: { detail: 'Not found.' } };
const bad = (body: unknown): Answer => ({ status: 400, body });
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) });
const readable = (rule: StoredRule) => rule.is_owner || rule.sharing === 'workspace' || (rule.sharing === 'people' && rule.shared_with.some((person) => person.id === ME.id));
const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((person) => person.id === id && person.is_active).map(({ id: pk, name }) => ({ id: pk, name })));

export interface RulesStub {
  rules?: StoredRule[];
  nights?: StubRun[];
  records?: Record<number, RunDetail>;
  reviews?: RuleReview[];
  /** 429 once ME owns this many (default 50, the backend's MAX_OWNED). */
  limit?: number;
  /** Nights a page holds (default 20, the backend's PAGE_SIZE). */
  pageSize?: number;
  list?: () => Answer;
  /** GET /rules/<id>/: an answer overrides the default; undefined falls through. */
  read?: (id: number) => Answer | undefined;
  create?: (body: Record<string, unknown>) => Answer;
  patch?: (id: number, body: Record<string, unknown>) => Answer;
  test?: (body: Record<string, unknown>) => Answer;
  /** GET runs/: undefined falls through. */
  runsPage?: (id: number, cursor: string | null) => Answer | undefined;
  /** GET runs/<run_id>/: undefined falls through. */
  run?: (id: number, runId: number) => Answer | undefined;
  reviewList?: () => Answer;
  /** POST approve/: undefined falls through. */
  approve?: (id: number) => Answer | undefined;
  /** Every approval is refused with this Surveys body (400), stored on the review. */
  refuse?: Record<string, unknown>;
  /** An approved campaign review sends through the Campaigns stub; it answers the send's id. */
  onCampaignApproved?: (review: CampaignReview, by: PersonRef | null) => number;
  /** Passed to stubSurveys for everything this stub does not own. */
  surveys?: SurveysStub;
}

export function stubRules(stub: RulesStub = {}) {
  const rules: StoredRule[] = (stub.rules ?? RULES).map((rule) => ({ ...rule, actions: rule.actions.map((action) => ({ ...action })) }));
  const runs: StubRun[] = (stub.nights ?? RUNS).map((run) => ({ ...run }));
  const records: Record<number, RunDetail> = { ...(stub.records ?? RUN_RECORDS) };
  const reviews: RuleReview[] = (stub.reviews ?? REVIEWS).map((review) => ({ ...review, result: { ...review.result } }));
  const limit = stub.limit ?? 50;
  const pageSize = stub.pageSize ?? 20;
  const surveys = stubSurveys(stub.surveys);
  let nextRule = 100;
  let nextRun = 200;
  let nextReview = 300;
  let nextSend = 31;

  const lastRun = (rule: StoredRule) => {
    const latest = runs.filter((run) => run.rule === rule.id).sort((a, b) => b.run_on.localeCompare(a.run_on) || b.id - a.id)[0];
    if (!latest) return null;
    if (!rule.is_owner) return { run_on: latest.run_on, fired: null, waiting: false };
    return { run_on: latest.run_on, fired: latest.fired, waiting: latest.review?.status === 'waiting' };
  };
  const detail = (rule: StoredRule): Rule => ({ ...rule, shared_with: rule.sharing === 'people' ? rule.shared_with : [], last_run: lastRun(rule) });
  const row = (rule: StoredRule): RuleRow => {
    const full = detail(rule);
    return {
      id: full.id, name: full.name, is_active: full.is_active, paused_reason: full.paused_reason, paused_message: full.paused_message, segment: full.segment,
      trigger: full.trigger, score: full.score, direction: full.direction, threshold: full.threshold, cadence: full.cadence, weekday: full.weekday,
      actions: full.actions, cooldown_days: full.cooldown_days, sharing: full.sharing, owner: full.owner, is_owner: full.is_owner, last_run: full.last_run,
      updated_at: full.updated_at,
    };
  };

  /** RuleWriteSerializer, in brief: the merged rule checked against its
   *  segment's kind, 400 at the field named. Returns the fields to store. */
  const check = (data: Record<string, unknown>, current: StoredRule | null): Answer | Partial<StoredRule> => {
    const merged = { ...(current ?? { cooldown_days: 30, is_active: false, sharing: 'private' }), ...data } as Record<string, unknown>;
    if ((!current || 'name' in data) && !String(data.name ?? '').trim()) return bad({ name: ['This field may not be blank.'] });
    let segment = current?.segment ?? null;
    if ('segment' in data) {
      if (data.segment === null || data.segment === undefined) {
        segment = null;
      } else {
        const found = SEGMENTS.find((candidate) => candidate.id === data.segment);
        if (!found) return NOT_FOUND;
        if (!found.is_owner) return { status: 403, body: { detail: SAY.NOT_SEGMENT_OWNER } };
        segment = { id: found.id, name: found.name, kind: found.kind };
      }
    }
    // serializers.validate: a segment-less rule (still on until tonight
    // pauses it) may be renamed, re-shared or switched off, not re-pointed,
    // re-triggered or turned on.
    const turningOn = data.is_active === true && !current?.is_active;
    const retriggered = TRIGGER_FIELDS.some((name) => name in data);
    if (segment === null && (!current || 'segment' in data || retriggered || turningOn)) return bad({ segment: [SAY.CHOOSE_SEGMENT] });
    const kind = segment?.kind ?? null;
    if (merged.trigger === 'crossed') {
      if (kind === 'contact') return bad({ trigger: [SAY.NO_CONTACT_SCORES] });
      const score = merged.score as Score | '';
      if (!score) return bad({ score: [SAY.CHOOSE_SCORE] });
      if (kind === 'account' && score === 'ces') return bad({ score: [SAY.NO_ACCOUNT_CES] });
      const threshold = merged.threshold as number | null;
      if (threshold === null || threshold === undefined) return bad({ threshold: [SAY.CHOOSE_THRESHOLD] });
      const [low, high] = SCORE_RANGES[score];
      if (threshold < low || threshold > high) return bad({ threshold: [thresholdRange(score)] });
    }
    const sent = merged.actions as (RuleAction | RuleActionWrite)[];
    if (!Array.isArray(sent) || sent.length < 1 || sent.length > 3) return bad({ actions: [SAY.ACTION_COUNT] });
    // A plan's template and a campaign are written as ids and kept as refs.
    const actions: RuleAction[] = sent.map((action) => {
      if (action.action === 'plan') return { action: 'plan', template: typeof action.template === 'number' ? templateRef(action.template) : action.template };
      if (action.action === 'campaign') {
        return { action: 'campaign', campaign: typeof action.campaign === 'number' ? campaignRef(action.campaign) : action.campaign, without_review: Boolean(action.without_review) };
      }
      return action;
    });
    // validation.clean_actions: a repeat is refused on its own item.
    const seen = new Set<string>();
    const errors = actions.map((action): Record<string, string[]> => {
      if (seen.has(action.action)) return { action: [SAY.ONE_OF_EACH] };
      seen.add(action.action);
      if (action.action === 'task' && !action.title.trim()) return { title: [SAY.NO_TITLE] };
      if (action.action === 'lifecycle' && kind === 'contact') return { action: [SAY.NO_CONTACT_LIFECYCLE] };
      if (action.action === 'lifecycle' && !action.stage) return { stage: [SAY.CHOOSE_STAGE] };
      if (action.action === 'survey' && kind !== 'contact' && action.roles.length === 0) return { roles: [SAY.NO_ROLES] };
      if (action.action === 'notify' && action.to === 'people' && action.people.length === 0) return { people: [SAY.NO_PEOPLE] };
      if (action.action === 'plan' && !action.template) return { template: [SAY.CHOOSE_TEMPLATE] };
      if (action.action === 'campaign' && (!action.campaign || !campaignUsable(action.campaign.id, kind))) return { campaign: [SAY.CHOOSE_CAMPAIGN] };
      return {};
    });
    if (errors.some((one) => Object.keys(one).length > 0)) return bad({ actions: errors });
    const cooldown = merged.cooldown_days as number;
    if (!Number.isInteger(cooldown) || cooldown < 1) return bad({ cooldown_days: ['Ensure this value is greater than or equal to 1.'] });
    if (cooldown > 365) return bad({ cooldown_days: ['Ensure this value is less than or equal to 365.'] });
    const people = 'shared_with' in data ? teammates(data.shared_with) : (current?.shared_with ?? []);
    if (merged.sharing === 'people' && people.length === 0) return bad({ shared_with: [SAY.NO_PEOPLE] });
    const blank = { score: '' as const, direction: '' as const, threshold: null, cadence: '' as const, weekday: null };
    const trigger =
      merged.trigger === 'crossed'
        ? { ...blank, score: merged.score as Score, direction: merged.direction as 'below' | 'above', threshold: merged.threshold as number }
        : merged.trigger === 'schedule'
          ? { ...blank, cadence: merged.cadence as 'weekly' | 'monthly', weekday: merged.cadence === 'weekly' ? (merged.weekday as number) : null }
          : blank;
    return {
      name: String(merged.name).trim(),
      segment,
      trigger: merged.trigger as StoredRule['trigger'],
      ...trigger,
      actions,
      cooldown_days: cooldown,
      is_active: Boolean(merged.is_active),
      sharing: merged.sharing as StoredRule['sharing'],
      shared_with: merged.sharing === 'people' ? people : [],
    };
  };
  const refused = (value: Answer | Partial<StoredRule>): value is Answer => 'status' in value && 'body' in value;

  /** reviews.send_review: a survey send in the Surveys stub, or a campaign
   *  send through `onCampaignApproved`. `by` is null for a night without review. */
  let nextCampaignSend = 900;
  const approve = (review: RuleReview, by: PersonRef | null = ME): Answer => {
    if (stub.refuse) {
      review.result = { error: stub.refuse };
      return { status: 400, body: stub.refuse };
    }
    const run = runs.find((candidate) => candidate.review?.id === review.id || candidate.reviews?.some((one) => one.id === review.id));
    const markApproved = () => {
      if (!run) return;
      if (run.review?.id === review.id) run.review = { id: review.id, status: 'approved' };
      run.reviews = run.reviews?.map((one) => (one.id === review.id ? { ...one, status: 'approved' } : one));
    };
    if (review.kind === 'campaign') {
      const sendId = stub.onCampaignApproved?.(review, by) ?? nextCampaignSend++;
      Object.assign(review, { status: 'approved', result: { campaign_send_id: sendId }, decided_at: NOW });
      markApproved();
      return { status: 200, body: { campaign_send_id: sendId } };
    }
    const id = nextSend++;
    const send: StoredSend = {
      id, name: `${review.rule.name} · ${formatDate(review.run_on)}`, survey_type: review.action.survey_type, subject: review.action.subject,
      intro: review.action.intro, segment: review.rule.segment, roles: review.action.roles, status: 'sent', sharing: 'private', shared_with: [],
      owner: ME, is_owner: true, started_at: NOW, sent_at: NOW,
      counts: { audience: review.counts.people, sent: review.counts.people, failed: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0 },
      created_at: NOW, updated_at: NOW,
    };
    surveys.addSend(send);
    Object.assign(review, { status: 'approved', result: { survey_send_id: id }, decided_at: NOW });
    markApproved();
    return { status: 200, body: { survey_send_id: id } };
  };

  /** One night of an active rule (nightly.run_rule, in brief): the
   *  segment's NIGHT records fire, a survey becomes a waiting review (or is
   *  approved at once without review). Returns the night, or null when
   *  nothing runs. */
  const runNight = (ruleId: number): StubRun | null => {
    const rule = rules.find((candidate) => candidate.id === ruleId);
    if (!rule || !rule.is_active || !rule.segment || rule.segment.id === null) return null;
    const outcomes = (NIGHT[rule.segment.id] ?? []).map(({ unseen, ...hit }) => {
      const actions = rule.actions.map((action): ActionResult => {
        if (action.action === 'notify' && unseen) return { action: 'notify', status: 'skipped', detail: NOBODY_DETAIL };
        if (action.action === 'plan') {
          // An open plan already there is `unchanged`, which counts as acted (Contract note 2).
          return ALREADY_OPEN.has(`${hit.kind}:${hit.id}`) ? { action: 'plan', status: 'unchanged', detail: 'already had one' } : { action: 'plan', status: 'done', detail: 'started' };
        }
        if (action.action === 'campaign') {
          return action.without_review ? { action: 'campaign', status: 'done', detail: 'emailed' } : { action: 'campaign', status: 'queued', detail: 'waiting for your review' };
        }
        return { action: action.action, status: action.action === 'survey' ? 'queued' : 'done', detail: '' };
      });
      // nightly.skip_reason: acted if any action was done, unchanged or queued.
      const acted = actions.some((result) => result.status === 'done' || result.status === 'unchanged' || result.status === 'queued');
      return { ...hit, outcome: acted ? ('fired' as const) : ('skipped' as const), reason: acted ? ('' as const) : ('nobody' as const), actions };
    });
    const hits = outcomes.filter((record) => record.outcome === 'fired');
    const nobody = outcomes.length - hits.length;
    const run: StubRun = {
      id: nextRun++, rule: rule.id, run_on: NIGHT_DAY, matched: outcomes.length, fired: hits.length, skipped: { ...NO_RUN_SKIPS, nobody }, review: null,
      hidden_count: 0, reader_fired: hits.length, ...at(NIGHT_DAY),
    };
    records[run.id] = { id: run.id, run_on: NIGHT_DAY, hidden_count: 0, records: [...hits, ...outcomes.filter((record) => record.outcome === 'skipped')] };
    const survey = rule.actions.find((action): action is SurveyAction => action.action === 'survey');
    runs.unshift(run);
    if (survey && hits.length > 0) {
      const review: RuleReview = {
        id: nextReview++, kind: 'survey', rule: reviewRule(rule), run_on: NIGHT_DAY, action: { ...survey }, counts: { people: hits.length + 1, records: hits.length },
        organisation_name: 'Acme Inc', status: 'waiting', result: {}, created_at: `${NIGHT_DAY}T02:00:05Z`, expires_at: '2026-10-12T12:00:05Z', decided_at: null,
      };
      reviews.unshift(review);
      run.review = { id: review.id, status: 'waiting' };
      run.reviews = [...(run.reviews ?? []), { id: review.id, kind: 'survey', status: 'waiting' }];
      if (survey.without_review) approve(review);
    }
    const campaign = rule.actions.find((action): action is CampaignAction => action.action === 'campaign');
    if (campaign?.campaign && hits.length > 0) {
      const review: CampaignReview = {
        id: nextReview++, kind: 'campaign', rule: reviewRule(rule), run_on: NIGHT_DAY, campaign: { ...campaign.campaign },
        counts: { reach: hits.length, skipped: { ...NO_SKIPS } },
        action: { action: 'campaign', campaign: campaign.campaign.id, without_review: campaign.without_review },
        status: 'waiting', result: {}, created_at: `${NIGHT_DAY}T02:00:05Z`, expires_at: '2026-10-12T12:00:05Z', decided_at: null,
      };
      reviews.unshift(review);
      run.review ??= { id: review.id, status: 'waiting' };
      run.reviews = [...(run.reviews ?? []), { id: review.id, kind: 'campaign', status: 'waiting' }];
      if (campaign.without_review) approve(review, null);
    }
    return run;
  };

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    if (path === '/rules/' && method === 'GET') {
      if (stub.list) return reply(stub.list());
      const scope = url.searchParams.get('scope');
      const rows = rules
        .filter(readable)
        .filter((rule) => (scope === 'mine' ? rule.is_owner : scope === 'shared' ? !rule.is_owner : true))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
        .map(row);
      return json(200, rows);
    }
    if (path === '/rules/' && method === 'POST') {
      if (stub.create) return reply(stub.create(body));
      const checked = check(body, null);
      if (refused(checked)) return reply(checked);
      if (rules.filter((rule) => rule.is_owner).length >= limit) return json(429, { detail: SAY.LIMIT_REACHED });
      const made = { ...BASE, ...checked, id: nextRule++, owner: ME, is_owner: true, created_at: NOW, updated_at: NOW } as StoredRule;
      rules.push(made);
      return json(201, detail(made));
    }
    if (path === '/rules/test/' && method === 'POST') {
      if (stub.test) return reply(stub.test(body));
      const { rule: lent, ...rest } = body;
      const checked = check({ name: 'Test', ...rest }, null);
      if (refused(checked)) return reply(checked);
      void lent;
      const segmentId = (checked.segment as { id: number }).id;
      const result = TESTS[segmentId] ?? { count: 0, records: [], hidden_count: 0, skipped: { cooldown: 0, cap: 0, not_visible: 0 } };
      const planned = (checked.actions ?? []).some((action) => action.action === 'plan');
      const emailing = (checked.actions ?? []).some((action) => action.action === 'campaign');
      return json(200, {
        ...result,
        ...(planned ? { plans: { would_start: Math.max(0, result.count - 1), already_open: Math.min(1, result.count) } } : {}),
        ...(emailing ? { campaigns: { would_email: result.count, skipped: 1 } } : {}),
      });
    }
    if (path === '/rules/reviews/' && method === 'GET') {
      if (stub.reviewList) return reply(stub.reviewList());
      const wanted = url.searchParams.get('status') ?? 'waiting';
      const mine = reviews.filter((review) => review.status === wanted && rules.some((rule) => rule.id === review.rule.id && rule.is_owner));
      return json(200, mine);
    }
    const decide = /^\/rules\/reviews\/(\d+)\/(approve|skip)\/$/.exec(path);
    if (decide && method === 'POST') {
      const id = Number(decide[1]);
      if (decide[2] === 'approve') {
        const override = stub.approve?.(id);
        if (override) return reply(override);
      }
      const review = reviews.find((candidate) => candidate.id === id && rules.some((rule) => rule.id === candidate.rule.id && rule.is_owner));
      if (!review) return reply(NOT_FOUND);
      if (review.status !== 'waiting') return json(409, { detail: SAY.ALREADY_DECIDED });
      if (decide[2] === 'approve') return reply(approve(review));
      Object.assign(review, { status: 'skipped', decided_at: NOW });
      const run = runs.find((candidate) => candidate.review?.id === review.id);
      if (run) run.review = { id: review.id, status: 'skipped' };
      return json(200, review);
    }

    const found = /^\/rules\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const rule = rules.find((candidate) => candidate.id === id);
      // Unreadable reads the same as missing, on every sub-path.
      if (!rule || !readable(rule)) return reply(NOT_FOUND);
      if (rest === '' && method === 'GET') {
        const override = stub.read?.(id);
        return override ? reply(override) : json(200, detail(rule));
      }
      if (rest === '' && method === 'PATCH') {
        if (stub.patch) return reply(stub.patch(id, body));
        if (!rule.is_owner) return json(403, { detail: SAY.NOT_OWNER });
        const checked = check(body, rule);
        if (refused(checked)) return reply(checked);
        const turnedOn = checked.is_active === true && !rule.is_active;
        // views.RESET_FIELDS: a new segment or trigger expires the waiting
        // surveys, fired on the old one (reviews.expire_for_rule).
        const reset = (checked.segment?.id ?? null) !== (rule.segment?.id ?? null) || checked.trigger !== rule.trigger;
        Object.assign(rule, checked, { updated_at: NOW });
        if (reset) {
          for (const review of reviews.filter((candidate) => candidate.rule.id === rule.id && candidate.status === 'waiting')) {
            Object.assign(review, { status: 'expired', decided_at: NOW });
            const run = runs.find((candidate) => candidate.review?.id === review.id);
            if (run) run.review = { id: review.id, status: 'expired' };
          }
        }
        if (turnedOn) Object.assign(rule, { paused_reason: '', paused_message: '' });
        return json(200, detail(rule));
      }
      if (rest === '' && method === 'DELETE') {
        if (!rule.is_owner) return json(403, { detail: SAY.NOT_OWNER });
        rules.splice(rules.indexOf(rule), 1);
        return json(204, null);
      }
      if (rest === 'runs/' && method === 'GET') {
        const cursor = url.searchParams.get('cursor');
        const override = stub.runsPage?.(id, cursor);
        if (override) return reply(override);
        const nights = runs.filter((run) => run.rule === id).sort((a, b) => b.run_on.localeCompare(a.run_on) || b.id - a.id);
        // An opaque cursor: the stub's is base64 of the start index.
        const start = cursor ? Number(atob(cursor)) || 0 : 0;
        const page = nights.slice(start, start + pageSize).map(({ rule: owner, reader_fired: readerFired, ...run }) => {
          void owner;
          return rule.is_owner ? run : { ...run, matched: null, skipped: null, review: null, fired: readerFired };
        });
        return json(200, { results: page, next: start + pageSize < nights.length ? btoa(String(start + pageSize)) : null });
      }
      const night = /^runs\/(\d+)\/$/.exec(rest);
      if (night && method === 'GET') {
        const runId = Number(night[1]);
        const override = stub.run?.(id, runId);
        if (override) return reply(override);
        const run = runs.find((candidate) => candidate.id === runId && candidate.rule === id);
        return run && records[runId] ? json(200, records[runId]) : reply(NOT_FOUND);
      }
    }

    if (path === '/scenarios/' && method === 'GET') return json(200, []);
    if (path === '/metrics/proposals/' && method === 'GET') return json(200, { pending: 0, proposals: [] });
    return surveys.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, runNight, tokensOf: surveys.tokensOf };
}

export type RulesSpy = ReturnType<typeof stubRules>['spy'];
