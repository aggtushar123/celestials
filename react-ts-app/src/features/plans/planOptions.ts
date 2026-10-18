// Plans' choices, labels, limits and sentences (spec §1.1, §2, §4).
import type { PortfolioNoun } from '../organizations/portfolioLabels';
import type { AssigneeRole, PlanKind, PlanStatus, Priority } from './planTypes';

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 500;
export const TASK_TITLE_MAX = 255;
export const OFFSET_MAX = 365;
export const MILESTONES_MAX = 12;
export const TASKS_MAX = 50;

export const STATUSES: readonly PlanStatus[] = ['draft', 'not_started', 'on_track', 'at_risk', 'done', 'cancelled'];
/** "Open means one of the first three" (spec §1.1). */
export const OPEN_STATUSES: readonly PlanStatus[] = ['not_started', 'on_track', 'at_risk'];
/** Cancelled is hidden until Show cancelled (spec Decisions, Board). */
export const BOARD_COLUMNS: readonly PlanStatus[] = ['not_started', 'on_track', 'at_risk', 'done'];

export const STATUS_LABEL: Record<PlanStatus, string> = {
  draft: 'Draft',
  not_started: 'Not started',
  on_track: 'On track',
  at_risk: 'At risk',
  done: 'Done',
  cancelled: 'Cancelled',
};
export const KIND_LABEL: Record<PlanKind, string> = { onboarding: 'Onboarding', success: 'Success', save: 'Save', qbr: 'QBR', other: 'Other' };
export const KINDS = Object.keys(KIND_LABEL) as PlanKind[];
export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const ROLE_LABEL: Record<AssigneeRole, string> = { record_owner: "The record's owner", plan_owner: "The plan's owner" };

/** The spec's own sentences (§1.3, §1.8, §2.3). */
export const SAY = {
  CANT_OPEN: "They can't open this record.",
  HAS_DONE_WORK: 'Cancel it instead: some of its work is done.',
  MILESTONE_HAS_DONE_WORK: 'Some of its work is done; mark it done instead.',
  CHOOSE_TEMPLATE: 'Choose a template you can use.',
  NOT_FOUND: "This plan doesn't exist or you can't open its record.",
  TEMPLATE_GONE: 'Its plan template was deleted.',
} as const;

/** The client's own words, for what it checks before asking: the server's
 *  words wherever it says the same thing (validation.py), so a refusal reads
 *  the same from either side. */
export const CHECK = {
  PLAN_NAME: 'Give the plan a name.',
  MILESTONE_NAME: 'Give the milestone a name.',
  TASK_TITLE: 'Give the task a title.',
  TEMPLATE_NAME: 'Give the template a name.',
  DATE: 'Choose a date.',
  DATE_RANGE: 'Choose a date from the start date to a year after it.',
  OFFSET: 'Choose 0 to 365 days.',
  RECORD: 'Choose an organisation or an account.',
  TEMPLATE: 'Choose a template.',
  NO_MILESTONES: 'Choose 1 to 12 milestones.',
  TOO_MANY_MILESTONES: 'Choose 1 to 12 milestones.',
  TOO_MANY_TASKS: 'Keep it to 50 tasks in all.',
  NO_PEOPLE: 'Choose at least one teammate.',
  ALL_MILESTONES_DONE: 'Mark every milestone done first.',
  NOT_BACK: "A plan can't go back to Not started.",
  CANCEL_ON_PAGE: 'Cancel a plan from its own page.',
  NOT_EDITOR: "Only the plan's owner or their managers can move it.",
  FINISHED: 'A finished plan stays where it is.',
  START_DRAFT: 'Start a draft plan with Start plan.',
} as const;

export const PLAN_NOUN: PortfolioNoun = { one: 'plan', many: 'plans' };
