// What "What's being done" says (spec 2026-10-05-brain-doing-design §2.1),
// in one place so the tests and the page share it.
import type { CurrencyCode } from '../auth/authSlice';
import { formatCompactMoney } from '../customers/formatters';
import { isOpen } from '../plans/planText';
import { dayOf, valueText } from './brainText';
import type {
  DeskMember,
  DoingInitiative,
  DoingPayload,
  DoingPlan,
  DoingRule,
  InitiativeProgress,
  InitiativeStatus,
  InitiativeTask,
  ScopeKey,
  WaitingPerson,
} from './brainTypes';

export const DO = {
  TITLE: "What's being done",
  SECTIONS: 'Sections',
  INITIATIVES: 'Initiatives',
  PLANS: 'Plans',
  RULES: 'Rules at work',
  OPEN_PLANS: 'Open plans',
  RULES_RUNNING: 'Rules running',
  LOAD: 'Could not load what is being done.',
  LOADING: 'Loading what is being done',
  NEW: 'New initiative',
  STARTED: 'Initiative started.',
  NO_PLANS: 'No open plans.',
  NO_RULES: 'No rules running.',
  BEFORE_FIGURES: 'Started before starting figures were kept',
  NO_FIGURES: 'No figures recorded',
  NOT_RECORDED: 'not recorded',
  NOT_MEASURABLE: 'Not measurable yet',
  OUTSIDE_VIEW: 'Tracks numbers outside your view.',
  NOT_RUN: 'Not run yet',
  NO_SEGMENT: 'No segment',
  WHOLE_COMPANY: 'Whole company',
  YOUR_BOOK: 'Your book',
  NO_OWNER: 'No owner',
  DETAILS: 'Details',
  HYPOTHESIS: 'Hypothesis',
  OUTCOME: 'Outcome',
  TASKS: 'Tasks',
  NO_TASKS: 'No tasks yet.',
  EDIT: 'Edit',
  EDIT_FORM: 'Edit initiative',
  MARK_DONE: 'Mark done',
  ABANDON: 'Abandon',
  REOPEN: 'Reopen',
  WHAT_HAPPENED: 'What happened?',
  CLOSE_DONE: 'Close as done',
  CLOSE_ABANDONED: 'Close as abandoned',
  SAVE: 'Save',
  SAVE_INITIATIVE: 'Save initiative',
  SAVING: 'Saving…',
  CANCEL: 'Cancel',
  SAVE_FAILED: 'Could not save the initiative.',
  FIELD_TITLE: 'Title',
  FIELD_HYPOTHESIS: 'Hypothesis',
  FIELD_METRIC: 'Metric',
  FIELD_CUT: 'Cut',
  FIELD_TARGET: 'Target value',
  FIELD_TARGET_BY: 'Target date',
  FIELD_OWNER: 'Owner',
  FIELD_WHOSE_BOOK: 'Whose book',
  OWNER_CUT_HINT: "Only numbers that can be tracked for one person's book.",
  NO_TRACKABLE: "No numbers can be tracked for one person's book yet.",
  CHOOSE: 'Choose…',
  LOADING_CHOICES: 'Loading…',
  LOAD_METRICS: 'Could not load the numbers you can track.',
} as const;

export type SectionKey = 'initiatives' | 'plans' | 'rules';
export const SECTIONS: readonly { key: SectionKey; label: string }[] = [
  { key: 'initiatives', label: DO.INITIATIVES },
  { key: 'plans', label: DO.PLANS },
  { key: 'rules', label: DO.RULES },
];

export function sectionOf(param: string | null): SectionKey | null {
  return SECTIONS.some((s) => s.key === param) ? (param as SectionKey) : null;
}

/** The page's query with `?section=` set, everything else kept. */
export function withSection(search: string, key: string): string {
  const next = new URLSearchParams(search);
  next.set('section', key);
  return `?${next.toString()}`;
}

/** Decision 3: anyone on their own book; Company for view_all_accounts. */
export function canStart(scope: ScopeKey, canSeeAll: boolean): boolean {
  return scope !== 'company' || canSeeAll;
}

const STATUS: Record<InitiativeStatus, string> = { planned: 'Planned', active: 'Active', done: 'Done', abandoned: 'Abandoned' };
export const initiativeStatusLabel = (status: InitiativeStatus): string => STATUS[status];
export const isClosed = (status: InitiativeStatus): boolean => status === 'done' || status === 'abandoned';

const TASK_STATUS: Record<InitiativeTask['status'], string> = { pending: 'To do', 'in-progress': 'In progress', completed: 'Done' };
export const taskStatusText = (status: InitiativeTask['status']): string => TASK_STATUS[status];

/** Whose book an initiative tracks: yours, a person's, a cut, or the whole
 *  company — or nothing at all once the server hides its figures (I2, final
 *  review): `for` is `null` whenever the reader can't see the cut, not only
 *  for a whole-company one, so "Whole company" would misname a hidden
 *  product/segment/other-owner cut. `progress === null` is the server's own
 *  "hidden" signal; only then is the book safe to say. */
export function bookText(initiative: Pick<DoingInitiative, 'for' | 'progress'>, readerId: number): string | null {
  if (!initiative.progress) return null;
  const book = initiative.for;
  if (!book) return DO.WHOLE_COMPANY;
  if (book.dimension !== 'owner') return book.label;
  return book.member === String(readerId) ? DO.YOUR_BOOK : `${book.label}'s book`;
}

/** Intl's compact notation keeps a trailing ".0" on a round thousand/million
 *  (e.g. "$52.0K" for 52000); trim it so a whole figure reads "$52K". Only
 *  ever matches a compact-money string, so percent/count text passes through
 *  untouched. */
function trimCompactZero(text: string): string {
  return text.replace(/\.0([A-Za-z])$/, '$1');
}

/** `baseline` is `null` when the server captured none (a reader who can't
 *  use Company reading an owner-cut initiative, final review follow-up):
 *  the row then has only now and target to show, so the caller omits it
 *  rather than printing "Not measured". */
export function progressFigures(p: InitiativeProgress, currency: CurrencyCode): { baseline: string | null; now: string; target: string } {
  const unit = p.unit ?? 'count';
  const text = (value: number | null) => trimCompactZero(valueText(unit, value, currency));
  return { baseline: p.baseline === null ? null : text(p.baseline), now: text(p.current), target: text(p.target) };
}

/** A figure and the words after it, so only the figure is set in DM Mono. */
export interface Counted {
  n: number;
  words: string;
}

export function daysLeftParts(daysLeft: number, status: InitiativeStatus): Counted | null {
  if (isClosed(status)) return null;
  const n = Math.abs(daysLeft);
  return { n, words: `${n === 1 ? 'day' : 'days'} ${daysLeft < 0 ? 'overdue' : 'left'}` };
}

export function workText(work: { open: number; done: number }): string {
  return `${work.open} open · ${work.done} done`;
}

export function milestonesText(m: { done: number; total: number }): string {
  return `${m.done} of ${m.total} milestones`;
}

export interface FigurePart {
  label: 'Health' | 'ARR';
  then: string;
  now: string;
}

/** Health and ARR then → now (Decision 4); null before figures were kept. A
 *  figure missing on one side reads "not recorded"; on both, it is left out. */
export function thenNowParts(plan: Pick<DoingPlan, 'then' | 'now'>, currency: CurrencyCode): FigurePart[] | null {
  const then = plan.then;
  if (!then) return null;
  const parts: FigurePart[] = [];
  const show = (value: number | null, money: boolean) =>
    value === null ? DO.NOT_RECORDED : money ? trimCompactZero(formatCompactMoney(value, currency)) : value.toFixed(1);
  if (then.health_score !== null || plan.now.health_score !== null) {
    parts.push({ label: 'Health', then: show(then.health_score, false), now: show(plan.now.health_score, false) });
  }
  if (then.arr !== null || plan.now.arr !== null) {
    parts.push({ label: 'ARR', then: show(then.arr, true), now: show(plan.now.arr, true) });
  }
  return parts;
}

export function thenNowText(plan: Pick<DoingPlan, 'then' | 'now'>, currency: CurrencyCode): string {
  const parts = thenNowParts(plan, currency);
  if (parts === null) return DO.BEFORE_FIGURES;
  if (parts.length === 0) return DO.NO_FIGURES;
  return parts.map((p) => `${p.label} ${p.then} → ${p.now}`).join(' · ');
}

/** The paused sentence is the server's own `paused_message` (controller
 *  override: fix round 2) — `paused_reason` is only the code behind it. */
export function ruleStatusText(rule: Pick<DoingRule, 'is_active' | 'paused_message'>): string {
  if (rule.is_active) return 'On';
  return rule.paused_message ? `Paused: ${rule.paused_message}` : 'Off';
}

export interface RunParts {
  on: string;
  parts: { label: 'fired' | 'matched' | 'skipped'; n: number }[];
}

/** The last run's counts: fired for everyone, matched and skipped for the owner (Decision 5). */
export function lastRunParts(rule: Pick<DoingRule, 'last_run'>): RunParts | null {
  const run = rule.last_run;
  if (!run) return null;
  const parts: RunParts['parts'] = [{ label: 'fired', n: run.fired }];
  if (run.matched !== undefined) parts.push({ label: 'matched', n: run.matched });
  if (run.skipped !== undefined) parts.push({ label: 'skipped', n: run.skipped });
  return { on: dayOf(run.run_on), parts };
}

export function lastRunText(rule: Pick<DoingRule, 'last_run'>): string {
  const run = lastRunParts(rule);
  if (!run) return DO.NOT_RUN;
  return `Last run ${run.on}: ${run.parts.map((p) => `${p.label} ${p.n}`).join(' · ')}`;
}

export const segmentText = (rule: Pick<DoingRule, 'segment'>): string => rule.segment ?? DO.NO_SEGMENT;
/** Contract note 11 (controller override: fix round 2): links when the
 *  server says the reader may open this rule's page, not only on `mine`. */
export const ruleHref = (rule: Pick<DoingRule, 'id' | 'readable'>): string | null =>
  rule.readable ? `/scenarios/rules/${rule.id}` : null;
/** Contract note 10: a plan's own page. */
export const planHref = (plan: Pick<DoingPlan, 'id'>): string => `/projects/${plan.id}`;

export function initiativesEmpty(scope: ScopeKey): string {
  if (scope === 'me') return 'No initiatives on your book yet.';
  return scope === 'team' ? "No initiatives on your team's book yet." : 'No initiatives yet.';
}

export function hiddenPlansText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more plan on a record you can't open" : `${n} more plans on records you can't open`;
}

/** "Whose book" (Contract note 4): the reader, then everyone active below
 *  them by name. An inactive member is never offered (`book_person` refuses
 *  them, minor fix, final review), but still carries the traversal past
 *  them to their own reports. */
export function bookPeople(members: DeskMember[], reader: WaitingPerson): DeskMember[] {
  const below: DeskMember[] = [];
  let frontier = [reader.id];
  while (frontier.length > 0) {
    const next = members.filter((m) => m.reports_to !== null && frontier.includes(m.reports_to.id) && !below.includes(m));
    below.push(...next);
    frontier = next.map((m) => m.id);
  }
  const me = members.find((m) => m.id === reader.id) ?? { ...reader, reports_to: null, is_active: true };
  const active = below.filter((m) => m.is_active);
  return [me, ...active.sort((a, b) => a.name.localeCompare(b.name))];
}

export interface DoingFigures {
  active: number;
  onTrack: number;
  openPlans: number;
  atRisk: number;
  running: number;
  fired: number;
}

/** On track (brain UI spec §2): active, with figures the reader can see and
 *  measure, and still inside its target date. The payload carries no start
 *  date, so pace can't be judged. */
export function isOnTrack(one: Pick<DoingInitiative, 'status' | 'progress'>): boolean {
  return one.status === 'active' && one.progress !== null && one.progress.progress_pct !== null && one.progress.days_left >= 0;
}

/** The three tiles' figures, from the `doing/` payload the page already reads. */
export function doingFigures(data: Pick<DoingPayload, 'initiatives' | 'plans' | 'rules'>): DoingFigures {
  const active = data.initiatives.filter((one) => one.status === 'active');
  const open = data.plans.filter((plan) => isOpen(plan.status));
  const running = data.rules.filter((rule) => rule.is_active);
  return {
    active: active.length,
    onTrack: active.filter(isOnTrack).length,
    openPlans: open.length,
    atRisk: open.filter((plan) => plan.status === 'at_risk').length,
    running: running.length,
    fired: running.reduce((sum, rule) => sum + (rule.last_run?.fired ?? 0), 0),
  };
}

export const onTrackText = (n: number): string => `${n} on track`;
export const atRiskText = (n: number): string => `${n} at risk`;
export const firedText = (n: number): string => `${n} fired last night`;
