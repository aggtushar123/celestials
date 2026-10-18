// The rule builder's state, as plain data: made new or from a saved rule,
// turned into the write and test bodies, and checked before it is sent in
// the backend's own sentences (plan Decision 8).
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import { DEFAULT_ROLES } from '../surveys/questions';
import type { RuleErrors } from './ruleErrors';
import {
  actionsFor,
  COOLDOWN_DEFAULT,
  COOLDOWN_MAX,
  COOLDOWN_MIN,
  COOLDOWN_RANGE,
  DUE_DEFAULT,
  DUE_MAX,
  MAX_ACTIONS,
  MESSAGE_MAX,
  MIN_ACTIONS,
  NAME_NEEDED,
  SAY,
  SCORE_RANGES,
  thresholdRange,
  TITLE_MAX,
} from './ruleOptions';
import type {
  ActionType,
  Cadence,
  CampaignAction,
  Direction,
  LifecycleAction,
  LifecycleStage,
  NotifyAction,
  PlanAction,
  Rule,
  RuleActionWrite,
  RuleTestRequest,
  RuleWrite,
  Score,
  SurveyAction,
  TaskAction,
  Trigger,
  TriggerFields,
} from './ruleTypes';

/** A lifecycle action before its stage is chosen (plan Decision 10). */
export type LifecycleDraft = Omit<LifecycleAction, 'stage'> & { stage: LifecycleStage | '' };
export type ActionDraft = NotifyAction | TaskAction | LifecycleDraft | SurveyAction | PlanAction | CampaignAction;

export interface RuleDraft {
  name: string;
  segment: number | null;
  trigger: Trigger;
  score: Score | '';
  direction: Direction;
  /** As typed: an empty or partial number is the user's to finish. */
  threshold: string;
  cadence: Cadence;
  weekday: number;
  actions: ActionDraft[];
  cooldown: string;
  isActive: boolean;
  sharing: Sharing;
  sharedWith: PersonRef[];
}

export const NOTIFY_ME: NotifyAction = { action: 'notify', to: 'me', people: [], message: '' };

/** Off, on entries, notifying me, every 30 days, private (spec §2.2). */
export function emptyDraft(segment: number | null): RuleDraft {
  return {
    name: '',
    segment,
    trigger: 'entered',
    score: '',
    direction: 'below',
    threshold: '',
    cadence: 'weekly',
    weekday: 0,
    actions: [{ ...NOTIFY_ME }],
    cooldown: String(COOLDOWN_DEFAULT),
    isActive: false,
    sharing: 'private',
    sharedWith: [],
  };
}

export function fromRule(rule: Rule): RuleDraft {
  return {
    name: rule.name,
    segment: rule.segment?.id ?? null,
    trigger: rule.trigger,
    score: rule.score,
    direction: rule.direction || 'below',
    threshold: rule.threshold === null ? '' : String(rule.threshold),
    cadence: rule.cadence || 'weekly',
    weekday: rule.weekday ?? 0,
    actions: rule.actions.map((action) => ({ ...action })),
    cooldown: String(rule.cooldown_days),
    isActive: rule.is_active,
    sharing: rule.sharing,
    sharedWith: rule.shared_with,
  };
}

/** Each action's defaults; the survey's are Surveys' own (plan Decision 11).
 *  Overloaded so a literal `type` narrows the return (lets a caller spread
 *  a known action, e.g. a survey's `roles`, without the whole union). */
export function newAction(type: 'notify', kind: SegmentKind | null, workspace: string): NotifyAction;
export function newAction(type: 'task', kind: SegmentKind | null, workspace: string): TaskAction;
export function newAction(type: 'lifecycle', kind: SegmentKind | null, workspace: string): LifecycleDraft;
export function newAction(type: 'survey', kind: SegmentKind | null, workspace: string): SurveyAction;
export function newAction(type: 'plan', kind: SegmentKind | null, workspace: string): PlanAction;
export function newAction(type: 'campaign', kind: SegmentKind | null, workspace: string): CampaignAction;
export function newAction(type: ActionType, kind: SegmentKind | null, workspace: string): ActionDraft {
  switch (type) {
    case 'notify':
      return { ...NOTIFY_ME };
    case 'task':
      return { action: 'task', title: '', assignee: 'record_owner', due_in_days: DUE_DEFAULT };
    case 'lifecycle':
      return { action: 'lifecycle', stage: '' };
    case 'survey':
      return {
        action: 'survey',
        survey_type: 'nps',
        subject: `A quick question from ${workspace}`,
        intro: '',
        roles: kind === 'contact' ? [] : [...DEFAULT_ROLES],
        without_review: false,
      };
    case 'plan':
      return { action: 'plan', template: null };
    case 'campaign':
      return { action: 'campaign', campaign: null, without_review: false };
  }
}

/** The types still to add: each once, at most three, no lifecycle for contacts. */
export function availableActions(actions: readonly ActionDraft[], kind: SegmentKind | null): ActionType[] {
  if (actions.length >= MAX_ACTIONS) return [];
  return actionsFor(kind).filter((type) => !actions.some((action) => action.action === type));
}

/** The actions follow the segment: a contact segment drops a lifecycle
 *  action (contacts have no stage) and a survey's roles; Surveys' defaults
 *  come back from contacts, a choice is kept otherwise. */
export function withKind(actions: readonly ActionDraft[], kind: SegmentKind | null): ActionDraft[] {
  const kept = kind === 'contact' ? actions.filter((action) => action.action !== 'lifecycle') : actions;
  return kept.map((action) => {
    if (action.action !== 'survey') return action;
    if (kind === 'contact') return { ...action, roles: [] };
    if (action.roles.length === 0) return { ...action, roles: [...DEFAULT_ROLES] };
    return action;
  });
}

export function toTrigger(draft: RuleDraft): TriggerFields {
  const blank: TriggerFields = { trigger: draft.trigger, score: '', direction: '', threshold: null, cadence: '', weekday: null };
  if (draft.trigger === 'crossed') {
    const typed = draft.threshold.trim();
    const value = Number(typed);
    return { ...blank, score: draft.score, direction: draft.direction, threshold: typed === '' || Number.isNaN(value) ? null : value };
  }
  if (draft.trigger === 'schedule') return { ...blank, cadence: draft.cadence, weekday: draft.cadence === 'weekly' ? draft.weekday : null };
  return blank;
}

/** The actions as sent: trimmed, people only for "Chosen teammates", no
 *  roles for a contact segment, a plan's template as its id. An unchosen
 *  stage or template goes as "" or null and the server answers at the
 *  field (the client check stops it first). */
export function toActions(draft: RuleDraft, kind: SegmentKind | null): RuleActionWrite[] {
  return draft.actions.map((action): RuleActionWrite => {
    if (action.action === 'notify') return { ...action, people: action.to === 'people' ? action.people : [], message: action.message.trim() };
    if (action.action === 'task') return { ...action, title: action.title.trim() };
    if (action.action === 'survey') return { ...action, subject: action.subject.trim(), intro: action.intro.trim(), roles: kind === 'contact' ? [] : action.roles };
    if (action.action === 'plan') return { action: 'plan', template: action.template?.id ?? null };
    if (action.action === 'campaign') return { action: 'campaign', campaign: action.campaign?.id ?? null, without_review: action.without_review };
    return action as LifecycleAction;
  });
}

export function toWrite(draft: RuleDraft, kind: SegmentKind | null): RuleWrite {
  return {
    name: draft.name.trim(),
    segment: draft.segment,
    ...toTrigger(draft),
    actions: toActions(draft, kind),
    cooldown_days: Number(draft.cooldown),
    is_active: draft.isActive,
    sharing: draft.sharing,
    ...(draft.sharing === 'people' ? { shared_with: draft.sharedWith.map((person) => person.id) } : {}),
  };
}

/** Backend RuleWriteSerializer.validate: a rule whose segment was deleted
 *  may still be renamed, re-shared or switched off. A segment is needed only
 *  to change its segment or trigger, or to turn it on. */
export function keepsNoSegment(draft: RuleDraft, initial: Rule | null): boolean {
  if (!initial || initial.segment !== null || draft.segment !== null) return false;
  const was = toTrigger(fromRule(initial));
  const now = toTrigger(draft);
  const sameTrigger = (Object.keys(was) as (keyof TriggerFields)[]).every((key) => was[key] === now[key]);
  return sameTrigger && !(draft.isActive && !initial.is_active);
}

/** An edit's PATCH: the whole rule (plan Decision 6), except that a rule
 *  kept without a segment sends neither segment nor trigger, which the
 *  backend would refuse without one. */
export function toEdit(draft: RuleDraft, kind: SegmentKind | null, initial: Rule): Partial<RuleWrite> {
  const body = toWrite(draft, kind);
  if (!keepsNoSegment(draft, initial)) return body;
  const { name, actions, cooldown_days, is_active, sharing, shared_with } = body;
  return { name, actions, cooldown_days, is_active, sharing, ...(shared_with ? { shared_with } : {}) };
}

export function toTestBody(draft: RuleDraft, kind: SegmentKind | null, ruleId: number | null): RuleTestRequest {
  const name = draft.name.trim();
  return {
    ...(name ? { name } : {}),
    segment: draft.segment,
    ...toTrigger(draft),
    actions: toActions(draft, kind),
    cooldown_days: Number(draft.cooldown),
    ...(ruleId !== null ? { rule: ruleId } : {}),
  };
}

function checkAction(action: ActionDraft, kind: SegmentKind | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (action.action === 'notify') {
    if (action.to === 'people' && action.people.length === 0) out.people = SAY.NO_PEOPLE;
    if (action.message.trim().length > MESSAGE_MAX) out.message = SAY.LONG_MESSAGE;
  } else if (action.action === 'task') {
    const title = action.title.trim();
    if (!title) out.title = SAY.NO_TITLE;
    else if (title.length > TITLE_MAX) out.title = SAY.LONG_TITLE;
    if (!Number.isInteger(action.due_in_days) || action.due_in_days < 0 || action.due_in_days > DUE_MAX) out.due_in_days = SAY.DUE_RANGE;
  } else if (action.action === 'lifecycle') {
    if (kind === 'contact') out.action = SAY.NO_CONTACT_LIFECYCLE;
    else if (!action.stage) out.stage = SAY.CHOOSE_STAGE;
  } else if (action.action === 'survey') {
    if (!action.subject.trim()) out.subject = SAY.NO_SUBJECT;
    if (kind !== null && kind !== 'contact' && action.roles.length === 0) out.roles = SAY.NO_ROLES;
  } else if (action.action === 'plan') {
    if (!action.template) out.template = SAY.CHOOSE_TEMPLATE;
  } else if (!action.campaign) {
    out.campaign = SAY.CHOOSE_CAMPAIGN;
  }
  return out;
}

/** What the server would refuse, said first. A test needs no name and no
 *  sharing (the test endpoint saves nothing). */
export function checkDraft(draft: RuleDraft, kind: SegmentKind | null, { forTest = false }: { forTest?: boolean } = {}): RuleErrors {
  const field: RuleErrors['field'] = {};
  if (!forTest && !draft.name.trim()) field.name = NAME_NEEDED;
  if (draft.segment === null) field.segment = SAY.CHOOSE_SEGMENT;
  if (draft.trigger === 'crossed') {
    if (kind === 'contact') {
      field.trigger = SAY.NO_CONTACT_SCORES;
    } else {
      if (!draft.score) field.score = SAY.CHOOSE_SCORE;
      else if (kind === 'account' && draft.score === 'ces') field.score = SAY.NO_ACCOUNT_CES;
      const typed = draft.threshold.trim();
      const value = Number(typed);
      if (typed === '' || Number.isNaN(value)) {
        field.threshold = SAY.CHOOSE_THRESHOLD;
      } else if (draft.score) {
        const [low, high] = SCORE_RANGES[draft.score];
        if (value < low || value > high) field.threshold = thresholdRange(draft.score);
      }
    }
  }
  const cooldown = Number(draft.cooldown);
  if (draft.cooldown.trim() === '' || !Number.isInteger(cooldown) || cooldown < COOLDOWN_MIN || cooldown > COOLDOWN_MAX) field.cooldown_days = COOLDOWN_RANGE;
  if (!forTest && draft.sharing === 'people' && draft.sharedWith.length === 0) field.shared_with = SAY.NO_PEOPLE;
  if (draft.actions.length < MIN_ACTIONS || draft.actions.length > MAX_ACTIONS) field.actions = SAY.ACTION_COUNT;
  return { field, action: draft.actions.map((action) => checkAction(action, kind)) };
}
