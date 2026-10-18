// The rules' choices, labels and limits, and the backend's own sentences,
// mirrored from services/rules/models.py and validation.py (backend plan
// Tasks 1 and 3), so a client check and a server refusal read the same.
import { LIFECYCLE_LABELS } from '../customers/formatters';
import type { SegmentKind } from '../segments/segmentTypes';
import type { ActionType, Assignee, Cadence, Direction, LifecycleStage, NotifyTo, Score, Trigger } from './ruleTypes';

export const NAME_MAX = 120;
export const MIN_ACTIONS = 1;
export const MAX_ACTIONS = 3;
export const COOLDOWN_MIN = 1;
export const COOLDOWN_MAX = 365;
export const COOLDOWN_DEFAULT = 30;
export const NIGHTLY_CAP = 200;
export const MESSAGE_MAX = 280;
export const TITLE_MAX = 200;
export const DUE_MAX = 90;
export const DUE_DEFAULT = 7;
/** Notify's chosen teammates, and a rule's sharing (backend MAX_SHARED). */
export const PEOPLE_MAX = 50;
/** Surveys refuses a send that reaches more people (surveys MAX_PEOPLE). */
export const SURVEY_PEOPLE_MAX = 500;
export const REVIEW_DAYS = 7;
export const OWNED_MAX = 50;

export const SCORE_RANGES: Record<Score, readonly [number, number]> = {
  csat: [0, 100],
  nps: [-100, 100],
  ces: [0, 100],
  health: [0, 10],
};
export const SCORE_LABEL: Record<Score, string> = { csat: 'CSAT', nps: 'NPS', ces: 'CES', health: 'Health' };
export const DIRECTION_LABEL: Record<Direction, string> = { below: 'Falls below', above: 'Rises above' };
export const CADENCE_LABEL: Record<Cadence, string> = { weekly: 'Weekly', monthly: 'Monthly, on the 1st' };
/** Monday = 0, as the backend's `weekday`. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const NOTIFY_TO_LABEL: Record<NotifyTo, string> = { me: 'Me', record_owner: "Each record's owner", people: 'Chosen teammates' };
export const ASSIGNEE_LABEL: Record<Assignee, string> = { record_owner: "The record's owner", me: 'Me' };
export const ACTION_LABEL: Record<ActionType, string> = {
  notify: 'Notify',
  task: 'Create a task',
  lifecycle: 'Change lifecycle',
  survey: 'Send a survey',
  plan: 'Start a plan',
  campaign: 'Send a campaign',
};
export const ACTION_ORDER: readonly ActionType[] = ['notify', 'task', 'lifecycle', 'survey', 'plan', 'campaign'];
export const STAGES = (Object.keys(LIFECYCLE_LABELS) as LifecycleStage[]).map((value) => ({ value, label: LIFECYCLE_LABELS[value] }));

/** The backend's sentences (services/rules/validation.py, views.py,
 *  reviews.py; surveys' NO_ROLES). */
export const SAY = {
  CHOOSE_SEGMENT: 'Choose a segment.',
  CHOOSE_TRIGGER: 'Choose when the rule runs.',
  CHOOSE_SCORE: 'Choose a score.',
  CHOOSE_DIRECTION: 'Choose below or above.',
  CHOOSE_THRESHOLD: 'Choose a value.',
  CHOOSE_CADENCE: 'Choose weekly or monthly.',
  CHOOSE_WEEKDAY: 'Choose a day of the week.',
  NO_CONTACT_SCORES: 'Contacts have no scores; choose an organisation or account segment.',
  NO_ACCOUNT_CES: 'Accounts have no CES; choose another score.',
  ACTION_COUNT: 'Choose 1 to 3 actions.',
  ONE_OF_EACH: 'Each action can be used once per rule.',
  NO_PEOPLE: 'Choose at least one teammate.',
  LONG_MESSAGE: 'Keep the message to 280 characters.',
  NO_TITLE: 'Give the task a title.',
  LONG_TITLE: 'Keep the title to 200 characters.',
  DUE_RANGE: 'Choose 0 to 90 days.',
  NO_CONTACT_LIFECYCLE: 'Contacts have no lifecycle stage; choose an organisation or account segment.',
  CHOOSE_STAGE: 'Choose a lifecycle stage.',
  NO_SUBJECT: 'Write a subject.',
  NO_ROLES: 'Choose at least one role.',
  CHOOSE_TEMPLATE: 'Choose a template you can use.',
  CHOOSE_CAMPAIGN: 'Choose one of your active campaigns for these records.',
  NOT_SEGMENT_OWNER: 'A rule can only use your own segments.',
  NOT_OWNER: "Only the rule's owner can change it.",
  LIMIT_REACHED: 'You can own at most 50 rules.',
  ALREADY_DECIDED: 'This review has already been decided.',
} as const;

/** The client's own words where DRF would word it (plan Decision 8). */
export const NAME_NEEDED = 'Give the rule a name.';
export const COOLDOWN_RANGE = 'Choose 1 to 365 days.';

/** The backend's `threshold_range(score)`, character for character. */
export function thresholdRange(score: Score): string {
  const [low, high] = SCORE_RANGES[score];
  return `Choose a value from ${low} to ${high}.`;
}

const NOUN: Record<SegmentKind, string> = { customer: 'An organisation', account: 'An account', contact: 'A contact' };

/** The Trigger select's words for the segment's kind. */
export function triggerOption(trigger: Trigger, kind: SegmentKind | null): string {
  const noun = kind ? NOUN[kind] : 'A record';
  if (trigger === 'entered') return `${noun} enters`;
  if (trigger === 'left') return `${noun} leaves`;
  if (trigger === 'crossed') return 'A score crosses a line';
  return 'On a schedule';
}

/** Contacts have no scores; accounts have no CES. */
export function scoresFor(kind: SegmentKind | null): Score[] {
  if (kind === 'contact') return [];
  if (kind === 'account') return ['csat', 'nps', 'health'];
  return ['csat', 'nps', 'ces', 'health'];
}

/** Contacts have no lifecycle stage. */
export function actionsFor(kind: SegmentKind | null): ActionType[] {
  return ACTION_ORDER.filter((type) => !(kind === 'contact' && type === 'lifecycle'));
}
