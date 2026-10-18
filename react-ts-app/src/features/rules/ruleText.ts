// The rules' sentences, as data. A rule reads as Segments' SentencePart
// list (figures marked numeric for DM Mono, a deleted segment as `hidden`),
// so Segments' RuleSentence draws it; every other line keeps its figures
// apart from its words for the same reason.
import { formatDate, LIFECYCLE_LABELS } from '../customers/formatters';
import { planNoun } from '../plans/planText';
import type { SentencePart } from '../segments/ruleSentence';
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import type { Line } from '../surveys/surveyText';
import { NIGHTLY_CAP, SCORE_LABEL, SCORE_RANGES, SURVEY_PEOPLE_MAX, WEEKDAYS } from './ruleOptions';
import type {
  ActionResult,
  ActionStatus,
  ActionType,
  Cadence,
  CampaignAction,
  LastRun,
  LifecycleStage,
  PausedReason,
  PlanAction,
  ReviewStatus,
  RuleAction,
  RuleTestResult,
  RunRecord,
  RunRow,
  Score,
  SurveyAction,
  Trigger,
  TriggerFields,
} from './ruleTypes';

/** A segment as a sentence needs it; null once deleted. */
export type SegmentLike = { name: string; kind: SegmentKind } | null;

/** Under the survey card (controller ruling, backend gap 4). */
export const SURVEY_LIMIT_NOTE = `A night that reaches more than ${SURVEY_PEOPLE_MAX} people is refused by Surveys and waits in Waiting on you with the reason.`;
/** Under a crossing rule's test (backend Decision 19). */
export const CROSSED_NOTE = 'A score rule never acts on its first night after it is turned on or changed: that night it notes each score, and acts from the next.';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const NOUNS: Record<SegmentKind, readonly [string, string]> = {
  customer: ['organisation', 'organisations'],
  account: ['account', 'accounts'],
  contact: ['contact', 'contacts'],
};
const ARTICLE: Record<SegmentKind, string> = { customer: 'an organisation', account: 'an account', contact: 'a contact' };

export function recordNoun(n: number, kind: SegmentKind | null): string {
  const [one, many] = kind ? NOUNS[kind] : ['record', 'records'];
  return plural(n, one, many);
}

/** A true minus for a negative NPS. */
export function thresholdText(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** "2026-10-04" → "4 Oct" (rows; headers keep the year). */
export function shortDay(iso: string): string {
  return formatDate(iso).replace(/ \d{4}$/, '');
}

/** Under the Value field: "CSAT runs from 0 to 100." */
export function rangeHint(score: Score): string {
  const [low, high] = SCORE_RANGES[score];
  return `${SCORE_LABEL[score]} runs from ${thresholdText(low)} to ${thresholdText(high)}.`;
}

/** The trigger half (plan Decision 4). */
export function triggerParts(rule: TriggerFields, segment: SegmentLike): SentencePart[] {
  const where: SentencePart = segment ? { text: segment.name, role: 'kind' } : { text: 'a deleted segment', role: 'hidden' };
  if (rule.trigger === 'crossed') {
    if (!rule.score || rule.threshold === null) {
      return [{ text: 'When ', role: 'join' }, { text: 'a score', role: 'field' }, { text: ' crosses a line in ', role: 'op' }, where];
    }
    return [
      { text: 'When ', role: 'join' },
      { text: SCORE_LABEL[rule.score], role: 'field' },
      { text: rule.direction === 'above' ? ' rises above ' : ' falls below ', role: 'op' },
      { text: thresholdText(rule.threshold), role: 'value', numeric: true },
      { text: ' in ', role: 'join' },
      where,
    ];
  }
  if (rule.trigger === 'schedule') {
    const when: SentencePart[] =
      rule.cadence === 'monthly'
        ? [{ text: 'On the ', role: 'join' }, { text: '1st', role: 'value', numeric: true }, { text: ' of each month', role: 'join' }]
        : [{ text: 'Every ', role: 'join' }, { text: WEEKDAYS[rule.weekday ?? 0], role: 'value' }];
    return [...when, { text: ', for everyone in ', role: 'join' }, where];
  }
  return [
    { text: 'When ', role: 'join' },
    { text: segment ? ARTICLE[segment.kind] : 'a record', role: 'field' },
    { text: rule.trigger === 'left' ? ' leaves ' : ' enters ', role: 'op' },
    where,
  ];
}

/** An action as a sentence reads it: a saved one, or the builder's draft
 *  (a lifecycle stage may still be unchosen). */
export type ActionLike = RuleAction | { action: 'lifecycle'; stage: LifecycleStage | '' };

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** "start a Save plan", "start an Onboarding plan" (Decision 15). */
function planWords(action: PlanAction): string {
  if (!action.template) return 'start a plan';
  const noun = planNoun(action.template.name);
  return `start ${article(noun)} ${noun}`;
}

/** "email Win-back", "email Win-back without review" (Decision 13). */
function campaignWords(action: CampaignAction): string {
  const words = `email ${action.campaign ? action.campaign.name : 'a campaign'}`;
  return action.without_review ? `${words} without review` : words;
}

function actionWords(action: ActionLike): string {
  switch (action.action) {
    case 'notify':
      if (action.to === 'me') return 'notify me';
      if (action.to === 'record_owner') return "notify each record's owner";
      return `notify ${action.people.length} ${plural(action.people.length, 'teammate', 'teammates')}`;
    case 'task':
      return 'create a task';
    case 'lifecycle':
      return action.stage ? `move to ${LIFECYCLE_LABELS[action.stage]}` : 'change lifecycle';
    case 'survey':
      return action.without_review ? 'survey without review' : 'survey';
    case 'plan':
      return planWords(action);
    case 'campaign':
      return campaignWords(action);
  }
}

export function thenText(actions: readonly ActionLike[]): string {
  return actions.map(actionWords).join(', ');
}

/** "When CSAT falls below 60 in My book → survey, notify me" (spec §2.1). */
export function ruleParts(rule: TriggerFields & { actions: readonly ActionLike[] }, segment: SegmentLike): SentencePart[] {
  return [...triggerParts(rule, segment), { text: ' → ', role: 'join' }, { text: thenText(rule.actions), role: 'value' }];
}

/** The list row's last night (spec §2.1). */
export function lastRunParts(last: LastRun | null): SentencePart[] {
  if (!last) return [{ text: 'Not run yet', role: 'join' }];
  if (last.fired === null) return [{ text: `Last ran ${shortDay(last.run_on)}`, role: 'join' }];
  return [
    { text: `${shortDay(last.run_on)} · fired `, role: 'join' },
    { text: String(last.fired), role: 'value', numeric: true },
    ...(last.waiting ? [{ text: ' · waiting for review', role: 'join' as const }] : []),
  ];
}

const REVIEW_WORDS: Record<Exclude<ReviewStatus, 'waiting'>, string> = {
  approved: 'approved',
  skipped: 'skipped',
  expired: 'review expired',
};

/** "4 Oct · fired 3 · skipped 2 · 1 waiting for review" (spec §2.3). A
 *  reader's figures cover only what they may open; the rest is a count. */
export function runParts(run: RunRow): SentencePart[] {
  const parts: SentencePart[] = [
    { text: `${shortDay(run.run_on)} · fired `, role: 'join' },
    { text: String(run.fired), role: 'value', numeric: true },
  ];
  const skipped = run.skipped ? run.skipped.cooldown + run.skipped.cap + run.skipped.not_visible + run.skipped.failed + run.skipped.nobody : 0;
  if (skipped > 0) parts.push({ text: ' · skipped ', role: 'join' }, { text: String(skipped), role: 'value', numeric: true });
  const waiting = waitingReviews(run);
  if (waiting > 0) {
    parts.push({ text: ' · ', role: 'join' }, { text: String(waiting), role: 'value', numeric: true }, { text: ' waiting for review', role: 'join' });
  }
  // Every decided review of the night by kind (Contract note 12); an older
  // row carries only `review`, a survey's.
  const reviews = run.reviews ?? (run.review ? [{ ...run.review, kind: 'survey' as const }] : []);
  for (const review of reviews) {
    if (review.status !== 'waiting') parts.push({ text: ` · ${review.kind} ${REVIEW_WORDS[review.status]}`, role: 'join' });
  }
  if (run.hidden_count > 0) {
    parts.push({ text: ' · ', role: 'join' }, { text: String(run.hidden_count), role: 'value', numeric: true }, { text: " you can't open", role: 'join' });
  }
  return parts;
}

const SHORT: Record<ActionType, string> = { notify: 'Notify', task: 'Task', lifecycle: 'Lifecycle', survey: 'Survey', plan: 'Plan', campaign: 'Campaign' };
const STATUS_WORDS: Record<ActionStatus, string> = {
  done: 'done',
  unchanged: 'already set',
  queued: 'waiting for review',
  skipped: 'skipped',
  failed: 'failed',
};

/** "Lifecycle: done (live → renewal)". `detail` is a fixed phrase or stage
 *  values, never personal data (backend contract). */
export function actionResultText(result: ActionResult): string {
  // A plan's detail is the whole story: "started", "already had one" (Contract note 2).
  if (result.action === 'plan' && result.status !== 'failed' && result.detail) return `Plan: ${result.detail}`;
  // A campaign's detail is the whole story: "waiting for your review", "emailed", "nobody it could reach".
  if (result.action === 'campaign' && result.status !== 'failed' && result.detail) return `Campaign: ${result.detail}`;
  return `${SHORT[result.action]}: ${STATUS_WORDS[result.status]}${result.detail ? ` (${result.detail})` : ''}`;
}

export function skipReasonText(record: Pick<RunRecord, 'reason'>, cooldownDays: number): string {
  if (record.reason === 'cooldown') return `Skipped: acted on in the last ${cooldownDays} days`;
  if (record.reason === 'failed') return 'Skipped: every action failed; it is tried again next time';
  // Every action was skipped, e.g. nobody it could be told to may open it.
  if (record.reason === 'nobody') return 'Skipped: nothing to do for it';
  return 'Skipped';
}

const PAUSE_FIX: Record<Exclude<PausedReason, ''>, string> = {
  segment_gone: 'Choose another of your segments in Edit, then turn it on.',
  segment_not_owned: 'Choose one of your own segments in Edit, then turn it on.',
  owner_inactive: 'It stays off until its owner is active again.',
  template_gone: 'Choose another template in Edit, then turn it on.',
  campaign_gone: 'Choose another campaign in Edit, then turn it on.',
};

/** The paused notice (spec §2.3, plan Decision 22), or null. */
export function pausedText(reason: PausedReason, message: string, isOwner: boolean): string | null {
  if (!reason) return null;
  return isOwner ? `It switched itself off. ${message} ${PAUSE_FIX[reason]}` : `It switched itself off. ${message}`;
}

/** What the confirm says before a rule is turned on (spec §2.2). */
export function turnOnText(actions: readonly ActionLike[], segment: SegmentLike): string {
  const survey = actions.find((action): action is SurveyAction => action.action === 'survey');
  const campaign = actions.find((action): action is CampaignAction => action.action === 'campaign');
  const surveyTail = !survey ? '' : survey.without_review ? ' Its surveys go out without your review.' : ' Its surveys wait for your review first.';
  const campaignTail = !campaign ? '' : campaign.without_review ? ' Its campaign emails go out without your review.' : ' Its campaign emails wait for your review first.';
  return `From tonight it runs once a night on ${segment ? segment.name : 'its segment'} and will ${thenText(actions)}.${surveyTail}${campaignTail}`;
}

/** As a segment's header words it. */
export function sharingText(sharing: Sharing, people: PersonRef[]): string {
  if (sharing === 'private') return 'Private';
  if (sharing === 'workspace') return 'Shared with the workspace';
  if (people.length <= 2) return `Shared with ${people.map((person) => person.name).join(' and ')}`;
  return `Shared with ${people[0].name}, ${people[1].name} and ${people.length - 2} more`;
}

/** Test this rule's answer, as an estimate (plan Decision 7, backend gap 5):
 *  the figure apart, then its words. */
export function testSummary(result: RuleTestResult, kind: SegmentKind | null): { n: number; text: string } {
  const lead = `${recordNoun(result.count, kind)} would match if tonight's run happened now`;
  if (result.records.length === 0) return { n: result.count, text: `${lead}.` };
  const more = result.count - result.records.length;
  return { n: result.count, text: `${lead}: ${result.records.map((record) => record.name).join(', ')}${more > 0 ? ` and ${more} more` : ''}.` };
}

/** The skips under a test, counted and never named. */
export function testLines(result: RuleTestResult, cooldownDays: number): Line[] {
  const lines: Line[] = [];
  if (result.skipped.cooldown > 0) lines.push({ n: result.skipped.cooldown, text: `skipped (acted on in the last ${cooldownDays} days)` });
  if (result.skipped.cap > 0) lines.push({ n: result.skipped.cap, text: `over the nightly limit of ${NIGHTLY_CAP}` });
  if (result.hidden_count > 0) {
    lines.push({ n: result.hidden_count, text: `in the segment you can't open ${result.hidden_count === 1 ? "isn't" : "aren't"} included` });
  }
  return lines;
}

/** A schedule that waits longer than its own rhythm (plan Decision 13). */
export function cooldownHint(trigger: Trigger, cadence: Cadence | '', days: number): string | null {
  if (trigger !== 'schedule' || !Number.isInteger(days)) return null;
  if (cadence === 'weekly' && days > 7) return `A weekly rule that waits ${days} days reaches each record about every ${Math.ceil(days / 7)} weeks.`;
  if (cadence === 'monthly' && days > 28) return `Some months are shorter than ${days} days, so a monthly rule can miss a record for a month.`;
  return null;
}

/** The first message of a Surveys refusal stored on a review (contract gap 6). */
export function refusalText(error: Record<string, unknown> | undefined): string | null {
  if (!error) return null;
  if (typeof error.detail === 'string') return error.detail;
  for (const value of Object.values(error)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return null;
}

/** reviews.send_review's RULE_CHANGED, character for character: approving a
 *  review whose rule's segment or trigger changed kind since fails with a
 *  400 and expires it (it was never a Surveys refusal, so it is never
 *  stored on the review and never stays waiting). */
export const RULE_CHANGED = "This rule's segment or trigger has changed since this review was made, so it has expired.";

/** Whether an approval's 400 body is that expiry, rather than a Surveys
 *  refusal that merely happens to be `{detail}` too (e.g. no email set up). */
export function isRuleChanged(body: unknown): body is { detail: string } {
  return typeof body === 'object' && body !== null && (body as Record<string, unknown>).detail === RULE_CHANGED;
}

/** The dry run's plans (spec §1.8): "Would start 2 plans · 1 already has one". */
export function planTestParts(plans: { would_start: number; already_open: number }): SentencePart[] {
  return [
    { text: 'Would start ', role: 'join' },
    { text: String(plans.would_start), role: 'value', numeric: true },
    { text: ` ${plural(plans.would_start, 'plan', 'plans')} · `, role: 'join' },
    { text: String(plans.already_open), role: 'value', numeric: true },
    { text: ` already ${plural(plans.already_open, 'has', 'have')} one`, role: 'join' },
  ];
}

/** The dry run's emails (campaigns spec §1.8, Decision 17): "Would email 3 people · 1 skipped". */
export function campaignTestParts(campaigns: { would_email: number; skipped: number }): SentencePart[] {
  return [
    { text: 'Would email ', role: 'join' },
    { text: String(campaigns.would_email), role: 'value', numeric: true },
    { text: ` ${plural(campaigns.would_email, 'person', 'people')} · `, role: 'join' },
    { text: String(campaigns.skipped), role: 'value', numeric: true },
    { text: ' skipped', role: 'join' },
  ];
}

/** How many of a night's reviews still wait: from `reviews`, or the single
 *  `review` of an older row (Contract note 12). */
export function waitingReviews(run: Pick<RunRow, 'review' | 'reviews'>): number {
  if (run.reviews) return run.reviews.filter((review) => review.status === 'waiting').length;
  return run.review?.status === 'waiting' ? 1 : 0;
}
