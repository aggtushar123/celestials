// Plans' dates and words, as data. Figures stay apart from their words so
// a component can set them in DM Mono.
import { formatDate } from '../customers/formatters';
import type { SentencePart } from '../segments/ruleSentence';
import { CHECK, OFFSET_MAX, OPEN_STATUSES, STATUS_LABEL } from './planOptions';
import type { PlanRow, PlanStatus, PlanTemplate, RecordKind } from './planTypes';

const DAY = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const pad = (n: number) => String(n).padStart(2, '0');

export const isOpen = (status: PlanStatus) => OPEN_STATUSES.includes(status);

/** A Draft (Agents delivery 2) is not open: it is edited, started or deleted. */
export const isDraft = (status: PlanStatus) => status === 'draft';

/** Whether Edit is offered: an open plan, or a Draft. */
export const isEditable = (status: PlanStatus) => isOpen(status) || isDraft(status);

/** A Draft's banner (Decision 12). */
export function draftNotice(n: number): string {
  return `This plan is a draft: Start plan creates its ${n} ${n === 1 ? 'task' : 'tasks'}, due from today.`;
}

/** "9 tasks to start" on a Draft's row and card, the figure apart. */
export function pendingText(n: number): { n: number; text: string } {
  return { n, text: `${n === 1 ? 'task' : 'tasks'} to start` };
}

/** "2026-10-20" + 14 → "2026-11-03", in UTC so no zone shifts the day. */
export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A plan's dates lie from its start to a year after it (the server's
 *  DATE_RANGE): a date input's `min` and `max`, none while the start is unset. */
export function dateBounds(start: string): { min?: string; max?: string } {
  return ISO.test(start) ? { min: start, max: addDays(start, OFFSET_MAX) } : {};
}

/** What the server would say of a plan date, or undefined for a good one. */
export function dateCheck(value: string, start: string): string | undefined {
  if (!ISO.test(value)) return CHECK.DATE;
  const { min, max } = dateBounds(start);
  return min && max && (value < min || value > max) ? CHECK.DATE_RANGE : undefined;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY);
}

/** The browser's own date (Decision 14). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-10-04" → "4 Oct" (rows, cards, tasks). */
export function shortDay(iso: string): string {
  return formatDate(iso).replace(/ \d{4}$/, '');
}

export function dateRange(start: string, target: string): string {
  return `${formatDate(start)} → ${formatDate(target)}`;
}

export const progress = (done: number, total: number) => `${done}/${total}`;

/** "Onboarding" → "Onboarding plan"; "Save plan" stays (Contract note 13). */
export function planNoun(name: string): string {
  return /\bplan$/i.test(name.trim()) ? name.trim() : `${name.trim()} plan`;
}

/** "<Template> · <Record>" (spec §2.2). */
export function defaultPlanName(template: string, record: string): string {
  return `${template} · ${record}`;
}

const count = (n: number, one: string, many: string): SentencePart[] => [
  { text: String(n), role: 'value', numeric: true },
  { text: ` ${n === 1 ? one : many}`, role: 'join' },
];

/** "4 milestones · 7 tasks · 60 days" (spec §2.2, a template card). */
export function lengthParts(template: Pick<PlanTemplate, 'milestone_count' | 'task_count' | 'length_days'>): SentencePart[] {
  return [
    ...count(template.milestone_count, 'milestone', 'milestones'),
    { text: ' · ', role: 'join' },
    ...count(template.task_count, 'task', 'tasks'),
    { text: ' · ', role: 'join' },
    ...count(template.length_days, 'day', 'days'),
  ];
}

/** "N tasks you can't see" (spec §2.3), the figure apart. */
export function hiddenTasks(n: number): { n: number; text: string } {
  return { n, text: `${n === 1 ? 'task' : 'tasks'} you can't see` };
}

/** The 409 PLAN_OPEN sentence (spec §2.2). */
export function planOpenText(templateName: string): string {
  return `This record already has an open ${planNoun(templateName)}.`;
}

export function recordHref(record: { kind: RecordKind; id: number }): string {
  return record.kind === 'organization' ? `/organizations/${record.id}` : `/accounts/${record.id}`;
}

/** The New plan modal over a record's page (spec §2.2). */
export function newPlanPath(record: { kind: RecordKind; id: number }): string {
  return `${recordHref(record)}/plans/new`;
}

/** The notice on a done or cancelled plan (spec §2.3), or null. */
export function finishedNotice(status: PlanStatus): string | null {
  if (status === 'done') return 'This plan is done. Only its tasks can still be ticked.';
  if (status === 'cancelled') return "This plan was cancelled. Its open tasks stay on their owners' lists, and only tasks can still be ticked.";
  return null;
}

export function moveNotice(name: string, status: PlanStatus): string {
  return `Moved ${name} to ${STATUS_LABEL[status]}.`;
}

export function allMilestonesDone(row: Pick<PlanRow, 'milestones_done' | 'milestones_total'>): boolean {
  return row.milestones_total > 0 && row.milestones_done === row.milestones_total;
}

/** Why a board move can't be asked for (Decisions 6, 7; Contract note 6;
 *  Agents delivery 2: a Draft only starts with Start plan), or null. */
export function moveRefusal(row: PlanRow, to: PlanStatus): string | null {
  if (!row.can_edit) return CHECK.NOT_EDITOR;
  if (isDraft(row.status) || to === 'draft') return CHECK.START_DRAFT;
  if (!isOpen(row.status)) return CHECK.FINISHED;
  if (to === 'not_started') return CHECK.NOT_BACK;
  if (to === 'cancelled') return CHECK.CANCEL_ON_PAGE;
  if (to === 'done' && !allMilestonesDone(row)) return CHECK.ALL_MILESTONES_DONE;
  return null;
}
