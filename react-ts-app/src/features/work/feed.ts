// My work's words and rules (work in one place spec §5; contract
// 2026-10-12-work-one-place-api.md), kept free of React so they are
// unit-tested on their own. Sentence case, no em dash.
import { formatDate } from '../customers/formatters';
import { localDay } from '../organizations/storyDays';
import type { RecordRef } from '../plans/planTypes';
import { PRIORITY_LABEL, WORK, isDueDate } from './workText';
import type {
  DraftFeedItem,
  FeedGroup,
  FeedGroupKey,
  FeedItem,
  FeedKind,
  FeedPayload,
  PersonRef,
  QuestionFeedItem,
  TaskPatch,
  TaskPriority,
  TaskRow,
  TodoAnswer,
  TodoBody,
} from './workTypes';
import { sentence } from '../../lib/sentence';

export const FEED = {
  OPEN_IN_SLACK: 'Open in Slack',
  FOR_COMPANY: 'For the whole company',
  LOAD: 'Could not load your work.',
  LOADING: 'Loading your work',
  EMPTY_TITLE: 'Nothing waiting on you.',
  EMPTY_DETAIL: 'Add a to-do above. Bundles, approvals, questions and tasks show here when they need you.',
  SHOW_ALL: 'Show all',
  OPEN_THREAD: 'Open thread',
  QUICK_ADD: 'Add a to-do',
  /** The form's own name: not the box's label, so the box is the only "Add a to-do". */
  QUICK_ADD_FORM: 'Quick add',
  ADD: 'Add',
  ADDING: 'Adding…',
  MORE: 'More',
  CLEAR_MORE: 'Clear record, date and priority',
  RECORD: 'Organisation or account (optional)',
  DUE: 'Due date',
  PRIORITY: 'Priority',
  ASSIGNEE: 'Who does it',
  ADD_FAILED: 'Could not add that. Try again.',
  FILTER: 'Show',
  SHOW_MORE: 'Show more',
  LOADING_MORE: 'Loading…',
  MORE_FAILED: 'Could not load more. Try again.',
  TRY_AGAIN: 'Try again',
  ONLY_YOU: 'Only you',
  NO_DATE: 'No date',
  OVERDUE: 'Overdue',
  ANSWER: 'Answer',
  OPEN_DRAFT: 'Open draft',
  ADD_TO_MINE: 'Add to my work',
  ASSIGN: 'Assign',
  DISMISS: 'Dismiss',
  ROW_ACTIONS: 'More actions',
  READ_ONLY: "You can't decide this one.",
  UNDO: 'Undo',
  UNDOING: 'Undoing…',
  UNDO_FAILED: 'Could not undo that. Try again.',
  CLOSE: 'Close',
  CANCEL: 'Cancel',
  OPEN_TASK: 'Open task',
  OPEN_SURVEY: 'Open survey',
  OPEN_CAMPAIGN: 'Open campaign',
  SETTINGS: 'Work settings',
  LOST: "You can't open that any more.",
  CANT_DECIDE: "You can't decide this any more.",
  ALREADY: 'Already decided.',
  EMAIL_REPLY: 'Email reply',
  TICKET_REPLY: 'Ticket reply',
} as const;

/** A Team queue item's "for" (contract D6); null on My work's items, which carry none. */
export function forText(person: PersonRef | null | undefined): string | null {
  if (person === undefined) return null;
  return person === null ? FEED.FOR_COMPANY : `For ${person.name}`;
}

export const GROUP_ORDER: readonly FeedGroupKey[] = ['decide', 'overdue', 'today', 'week', 'later', 'no_date', 'blocked', 'suggested'];

export const FEED_GROUP_LABEL: Record<FeedGroupKey, string> = {
  decide: 'Needs your decision',
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  no_date: 'No date',
  blocked: 'Blocked',
  suggested: 'Suggested',
};

/** A chip's `?kind=` value (agent bundles D1 frontend Decision 3). No value: All. */
export type FeedChip = 'bundle' | 'approval' | 'task' | 'todo' | 'question' | 'suggestion';

export const FEED_CHIPS: readonly { key: FeedChip | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'bundle', label: 'Bundles' },
  { key: 'approval', label: 'Approvals' },
  { key: 'task', label: 'Tasks' },
  { key: 'todo', label: 'To-dos' },
  { key: 'question', label: 'Questions' },
  { key: 'suggestion', label: 'Suggestions' },
];

const CHIP_KINDS: Record<FeedChip, readonly FeedKind[]> = {
  bundle: ['bundle'],
  approval: ['rule_review'],
  task: ['task'],
  todo: ['todo'],
  question: ['question'],
  suggestion: ['suggestion', 'slack_message', 'meeting_proposal', 'email_suggestion'],
};

export function chipOf(value: string | null): FeedChip | null {
  return value !== null && Object.hasOwn(CHIP_KINDS, value) ? (value as FeedChip) : null;
}

export const kindsOf = (chip: FeedChip | null): readonly FeedKind[] | null => (chip ? CHIP_KINDS[chip] : null);

/** One person's own, never in a Team queue: Slack messages, meeting proposals, email suggestions. */
const PERSONAL_KINDS: readonly FeedKind[] = ['slack_message', 'meeting_proposal', 'email_suggestion'];

/** A Team queue's kinds for a chip: never the personal kinds. */
export const queueKindsOf = (chip: FeedChip | null): readonly FeedKind[] | null =>
  chip ? CHIP_KINDS[chip].filter((kind) => !PERSONAL_KINDS.includes(kind)) : null;

export const chipAllows = (chip: FeedChip | null, kind: FeedKind): boolean => chip === null || CHIP_KINDS[chip].includes(kind);

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const DECIDE_RANK: Partial<Record<FeedKind, number>> = { rule_review: 0, bundle: 1, question: 2, draft: 3 };
const rankOf = (item: FeedItem) => PRIORITY_RANK[item.priority ?? 'medium'];
const dueOf = (item: FeedItem) => item.due_date ?? '9999-12-31';

/** The contract's order inside one group (§2.1). */
export function compareIn(group: FeedGroupKey, a: FeedItem, b: FeedItem): number {
  if (group === 'decide') return a.at.localeCompare(b.at) || (DECIDE_RANK[a.kind] ?? 9) - (DECIDE_RANK[b.kind] ?? 9) || a.id - b.id;
  if (group === 'suggested') return b.at.localeCompare(a.at) || b.id - a.id;
  if (group === 'no_date') return rankOf(a) - rankOf(b) || a.at.localeCompare(b.at) || a.id - b.id;
  return dueOf(a).localeCompare(dueOf(b)) || rankOf(a) - rankOf(b) || a.at.localeCompare(b.at) || a.id - b.id;
}

export function groupIn(feed: FeedPayload, key: FeedGroupKey): FeedGroup {
  return feed.groups.find((group) => group.key === key) ?? { key, count: 0, items: [], next: null };
}

export function locateItem(feed: FeedPayload, key: string): { group: FeedGroupKey; item: FeedItem } | null {
  for (const group of feed.groups) {
    const item = group.items.find((candidate) => candidate.key === key);
    if (item) return { group: group.key, item };
  }
  return null;
}

/** The feed without one item (it was acted on), its group's count one lower. */
export function withoutItem<P extends FeedPayload>(feed: P, key: string): P {
  const found = locateItem(feed, key);
  if (!found) return feed;
  return {
    ...feed,
    groups: feed.groups.map((group) =>
      group.key === found.group ? { ...group, items: group.items.filter((item) => item.key !== key), count: Math.max(0, group.count - 1) } : group,
    ),
  };
}

/** The feed with one item placed in order (quick-add, Undo). Never twice. In
 *  a group cut by `next`, an item sorting past the last loaded one is only
 *  counted: Show more will bring it, and it must not come twice. */
export function withItem<P extends FeedPayload>(feed: P, key: FeedGroupKey, item: FeedItem): P {
  if (locateItem(feed, item.key)) return feed;
  return {
    ...feed,
    groups: feed.groups.map((group) => {
      if (group.key !== key) return group;
      const last = group.items[group.items.length - 1];
      if (group.next !== null && last && compareIn(key, item, last) > 0) return { ...group, count: group.count + 1 };
      const items = [...group.items, item].sort((a, b) => compareIn(key, a, b));
      return { ...group, items, count: group.count + 1 };
    }),
  };
}

/** One group's next page, appended (Show more). */
export function withPage<P extends FeedPayload>(feed: P, page: FeedGroup): P {
  return {
    ...feed,
    groups: feed.groups.map((group) => {
      if (group.key !== page.key) return group;
      const known = new Set(group.items.map((item) => item.key));
      return { ...group, items: [...group.items, ...page.items.filter((item) => !known.has(item.key))], count: page.count, next: page.next };
    }),
  };
}

/** A failed group read again (Try again): its first page replaces it; of the
 *  kinds retried, only those still failing stay in `failed`. */
export function withGroup<P extends FeedPayload>(feed: P, page: FeedGroup, failed: readonly FeedKind[], retried: readonly FeedKind[]): P {
  const kept = feed.failed.filter((kind) => !retried.includes(kind) || failed.includes(kind));
  return { ...feed, groups: feed.groups.map((group) => (group.key === page.key ? page : group)), failed: kept };
}

export const withHidden = <P extends FeedPayload>(feed: P, by: number): P => ({ ...feed, hidden: feed.hidden + by });

export const feedTotal = (feed: FeedPayload): number => feed.groups.reduce((sum, group) => sum + group.count, 0);

const DECIDE_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'draft'];
const TASK_KINDS: readonly FeedKind[] = ['task', 'todo'];

/** Where a failed source shows, and how its Try again reads (Decision 4). */
export interface FailedSlot {
  at: FeedGroupKey;
  kinds: FeedKind[];
  retry: 'decide' | 'suggested' | 'all';
}

export function failedSlots(failed: readonly FeedKind[]): FailedSlot[] {
  const slots: FailedSlot[] = [];
  const decide = failed.filter((kind) => DECIDE_KINDS.includes(kind));
  if (decide.length > 0) slots.push({ at: 'decide', kinds: decide, retry: 'decide' });
  const tasks = failed.filter((kind) => TASK_KINDS.includes(kind));
  if (tasks.length > 0) slots.push({ at: 'overdue', kinds: tasks, retry: 'all' });
  if (failed.includes('suggestion')) slots.push({ at: 'suggested', kinds: ['suggestion'], retry: 'suggested' });
  return slots;
}

const KIND_NOUN: Record<FeedKind, string> = {
  bundle: 'bundles',
  rule_review: 'rule reviews',
  question: 'questions',
  draft: 'drafts',
  task: 'tasks',
  todo: 'to-dos',
  suggestion: 'suggestions',
  slack_message: 'Slack messages',
  meeting_proposal: 'meetings asked for',
  email_suggestion: 'suggestions from your email',
};

export function failedText(kinds: readonly FeedKind[]): string {
  const nouns = kinds.map((kind) => KIND_NOUN[kind]);
  const list = nouns.length <= 1 ? nouns.join('') : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  return `Couldn't load ${list}.`;
}

export function hiddenFeedText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more on a record you can't open" : `${n} more on records you can't open`;
}

/** The words after "Work, " in the sidebar item's name (Decision 12). */
export function feedBadgeName(decide: number, overdue: number): string {
  const parts: string[] = [];
  if (decide > 0) parts.push(`${decide} to decide`);
  if (overdue > 0) parts.push(`${overdue} overdue`);
  return parts.join(', ');
}

/** The day an item arrived, in the reader's time zone. */
export const dayText = (at: string): string => formatDate(localDay(new Date(at)));

/** A question's full thread, for a quiet link beside its inline Answer: its
 *  organisation's Knowledge tab (Brain Waiting's rule, contract §2.3). A
 *  question on no organisation has no page of its own, so no link. */
export function threadHref(item: QuestionFeedItem): string | null {
  return item.record?.type === 'customer' ? `/organizations/${item.record.id}?tab=knowledge` : null;
}

const CHIP_NOUN: Record<FeedChip, string> = {
  bundle: 'bundles',
  task: 'tasks',
  todo: 'to-dos',
  approval: 'approvals',
  question: 'questions',
  suggestion: 'suggestions',
};

/** The empty feed's title: under a chip it names that kind only, since other
 *  kinds may still wait (Chrome test 63). */
export const emptyTitle = (chip: FeedChip | null): string => (chip ? `No ${CHIP_NOUN[chip]} waiting.` : FEED.EMPTY_TITLE);

/** The panel's link: on Work, the page's query kept with `bundle` set; anywhere else (Copilot's Next up), Mine with the panel open (frontend Decisions 4, 18). */
export function bundleHref(pathname: string, params: URLSearchParams, id: number): string {
  if (pathname !== '/work') return `/work?queue=mine&bundle=${id}`;
  const query = new URLSearchParams(params);
  query.set('bundle', String(id));
  return `/work?${query.toString()}`;
}

export const draftHref = (item: DraftFeedItem): string => `/communications?draft=${item.id}`;

/** Undo for Done: the status it had, with its reason when Blocked (contract §1.2). */
export function undoPatch(row: TaskRow): TaskPatch {
  return row.status === 'blocked' ? { status: 'blocked', blocked_reason: row.blocked_reason } : { status: row.status };
}

export const reopenedText = (title: string): string => sentence(`Reopened: ${title}`);
export const addedToMineText = (title: string): string => sentence(`Added to your work: ${title}`);
export const approvedText = (title: string): string => sentence(`Approved: ${title}`);

export function addedText(answer: TodoAnswer): string {
  if (answer.item) return sentence(`Added: ${answer.task.title}`);
  return sentence(`Added for ${answer.task.assignee?.name ?? 'someone else'}: ${answer.task.title}`);
}

/** Quick-add's fields (spec §5: title; More gives record, date, priority, assignee). */
export interface TodoForm {
  title: string;
  record: RecordRef | null;
  due: string;
  priority: TaskPriority;
  /** Only sent with a record; null is the caller. */
  assignee: number | null;
}

export function todoBody(form: TodoForm): TodoBody {
  const body: TodoBody = { title: form.title.trim(), priority: form.priority, due_date: form.due || null };
  if (form.record) {
    if (form.record.kind === 'organization') body.customer_id = form.record.id;
    else body.account_id = form.record.id;
    if (form.assignee !== null) body.assignee_id = form.assignee;
  }
  return body;
}

/** What More holds while it is closed, so nothing sent is out of sight:
 *  "With: Pizza Hut · for Carl CSM · due 9 Oct 2026 · High priority", or
 *  null when More holds nothing beyond a plain private to-do. */
export function moreSummary(form: TodoForm, assigneeName: string | null = null): string | null {
  const parts: string[] = [];
  if (form.record) parts.push(form.record.name);
  if (form.record && form.assignee !== null && assigneeName) parts.push(`for ${assigneeName}`);
  if (form.due) parts.push(`due ${isDueDate(form.due) ? formatDate(form.due) : form.due}`);
  if (form.priority !== 'medium') parts.push(`${PRIORITY_LABEL[form.priority]} priority`);
  return parts.length ? `With: ${parts.join(' · ')}` : null;
}

/** Refused here first, in the contract's words: a title, and a date with a record. */
export function todoErrors(form: TodoForm): Partial<Record<'title' | 'due_date', string>> {
  if (!form.title.trim()) return { title: WORK.TITLE_REQUIRED };
  if ((form.record && !form.due) || (form.due && !isDueDate(form.due))) return { due_date: WORK.DATE_REQUIRED };
  return {};
}

export const NEXT_UP = {
  TITLE: 'Next up',
  OPEN_WORK: 'Open Work',
  LOADING: 'Loading what is next',
  LOAD: 'Could not load what is next.',
  ANSWER_FAILED: 'Could not send that answer. Try again.',
  SEND: 'Send answer',
  SENDING: 'Sending…',
  WRITE: 'Write an answer.',
} as const;

/** Next up reads every kind but suggestions (spec §5 Copilot). */
export const NEXT_UP_KINDS: readonly FeedKind[] = ['bundle', 'rule_review', 'question', 'draft', 'task', 'todo'];
const NEXT_UP_GROUPS: readonly FeedGroupKey[] = ['decide', 'overdue', 'today'];

/** The first five: decide's bundles first (spec §8.3), then the rest of decide, overdue, today; and the three groups' total. */
export function nextUp(feed: FeedPayload): { items: { group: FeedGroupKey; item: FeedItem }[]; total: number } {
  const decide = groupIn(feed, 'decide').items;
  const first = [...decide.filter((item) => item.kind === 'bundle'), ...decide.filter((item) => item.kind !== 'bundle')].map((item) => ({ group: 'decide' as FeedGroupKey, item }));
  const rest = NEXT_UP_GROUPS.filter((key) => key !== 'decide').flatMap((key) => groupIn(feed, key).items.map((item) => ({ group: key, item })));
  const total = NEXT_UP_GROUPS.reduce((sum, key) => sum + groupIn(feed, key).count, 0);
  return { items: [...first, ...rest].slice(0, 5), total };
}

export const answeredText = (title: string): string => sentence(`Answered: ${title}`);

// Work home: the daily brief (owner, 2026-10-17). Mine with no kind chip
// opens on a greeting, a one-line summary, three tiles, Ready to run, and
// Your to-dos beside Suggested.

export const BRIEF = {
  NEEDS_YOU: 'Needs you',
  DUE_TODAY: 'Due today',
  DONE: 'Done with Revenact',
  /** A figure that could not be read (written as an escape: the Work folders hold no em dash). */
  NO_FIGURE: '\u2014',
  READY: 'Ready to run',
  NOTHING_WAITS: 'Nothing waits on you.',
  REVIEW_RUN: 'Review & run',
  TODOS: 'Your to-dos',
  NO_TODOS: 'Nothing on your list.',
  CLEAR: "You're clear. Revenact will put new work here as it comes in.",
  STEPS: 'Steps',
  NIGHTLY: 'Nightly review',
  SLACK_MESSAGE: 'Slack message',
  MEETING: 'Meeting',
} as const;

/** "Good morning, Tushar": morning before noon, afternoon before five, evening after. */
export function greetingText(hour: number, name: string | null | undefined): string {
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}` : `Good ${part}`;
}

/** The brief's figures, read off the feed: decide's bundles, decide's total, and overdue and today. */
export function briefCounts(feed: FeedPayload): { plans: number; waiting: number; overdue: number; today: number } {
  const decide = groupIn(feed, 'decide');
  return {
    plans: decide.items.filter((item) => item.kind === 'bundle').length,
    waiting: decide.count,
    overdue: groupIn(feed, 'overdue').count,
    today: groupIn(feed, 'today').count,
  };
}

/** "Revenact prepared 4 plans of action · 2 wait on you · 3 due today", zero parts left out. */
export function briefSummary(feed: FeedPayload): string {
  const { plans, waiting, overdue, today } = briefCounts(feed);
  const due = overdue + today;
  const parts: string[] = [];
  if (plans > 0) parts.push(`Revenact prepared ${plans} ${plans === 1 ? 'plan' : 'plans'} of action`);
  if (waiting > 0) parts.push(`${waiting} ${waiting === 1 ? 'waits' : 'wait'} on you`);
  if (due > 0) parts.push(`${due} due today`);
  const suggested = groupIn(feed, 'suggested').count;
  if (parts.length === 0 && suggested > 0) return `Nothing waits on you · Revenact has ${suggested} ${suggested === 1 ? 'suggestion' : 'suggestions'} to look at`;
  if (suggested > 0) parts.push(`${suggested} ${suggested === 1 ? 'suggestion' : 'suggestions'}`);
  return parts.length ? parts.join(' · ') : BRIEF.CLEAR;
}

export const overdueCountText = (n: number): string => `${n} overdue`;
export const showAllCountText = (n: number): string => `Show all ${n}`;

/** Where a bundle came from, in a word or two: the nightly review, a Slack message, a meeting, or the thread's channel. */
export function bundleSourceText(source: { kind: 'nightly' | 'thread' | 'slack_message' | 'meeting'; label: string }): string {
  if (source.kind === 'nightly') return BRIEF.NIGHTLY;
  if (source.kind === 'slack_message') return BRIEF.SLACK_MESSAGE;
  if (source.kind === 'meeting') return BRIEF.MEETING;
  return source.label;
}

/** The step chain's chips: at most `cap`, then "+N". */
export function stepChain(labels: readonly string[], cap = 5): { shown: string[]; more: number } {
  return { shown: labels.slice(0, cap), more: Math.max(0, labels.length - cap) };
}

/** "Sent to Tushar Aggarwal" / "Sent to Tushar and Jesh" / "Sent to A, B and C" (Send to Revenact handover, 2026-10-18). */
export function handedToText(names: string[]): string {
  if (names.length <= 1) return `Sent to ${names[0] ?? ''}`.trim();
  return `Sent to ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
