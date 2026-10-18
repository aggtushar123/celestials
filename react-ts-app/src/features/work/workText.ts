// The Work section's words, kept free of React so they are unit-tested on
// their own. Sentence case, no em dash.
import type { ScopeKey } from '../brain/brainTypes';
import { formatDate } from '../customers/formatters';
import type {
  ParentKind,
  PersonRef,
  TaskEvent,
  TaskParentRef,
  TaskPerson,
  TaskPriority,
  TaskRow,
  TaskSource,
  TaskStatus,
  TeamPerson,
} from './workTypes';
import { sentence } from '../../lib/sentence';

export const WORK = {
  TITLE: 'Work',
  NEW_TASK: 'New task',
  ONLY_YOU: 'Only you',
  YOU: 'You',
  NO_DATE: 'No date',
  LOAD_TODAY: 'Could not load your tasks.',
  LOAD_TEAM: 'Could not load the team.',
  LOAD_DRILL: 'Could not load these tasks.',
  LOAD_TASK: 'Could not load this task.',
  LOAD_PEOPLE: 'Could not load teammates.',
  LOADING_PEOPLE: 'Loading teammates…',
  NO_TASK: "This task isn't there, or you can't open it.",
  TASK: 'Task',
  TASK_NOT_FOUND: 'Task not found',
  EMPTY_TITLE: 'Nothing on your list',
  EMPTY_DETAIL: 'Tasks assigned to you show here, soonest first.',
  NOBODY: 'Nobody in this view yet',
  NOBODY_DETAIL: 'People and their open tasks show here.',
  NO_DRILL: 'No open tasks you can see.',
  DONE_FAILED: 'Could not mark that done. Try again.',
  SAVE_FAILED: 'Could not save that change.',
  COMMENT_FAILED: 'Could not add that comment.',
  SAVED: 'Task saved.',
  SAVED_FIELD: 'Saved.',
  TITLE_REQUIRED: 'Give the task a title.',
  REASON_REQUIRED: "Say what it's blocked on.",
  DATE_REQUIRED: 'Choose a date.',
  ATTACH_RECORD: 'Attach to a record',
  ATTACH: 'Attach',
  ATTACH_DUE: 'Due date for the record task',
  /** Contract §1.2: attaching shows the to-do's earlier comments and events
   *  too. The panel's one warning, shown before and after a record is picked. */
  ATTACH_HISTORY: "Attaching a record makes this to-do and its history visible to people who can see that record. This can't be undone.",
  COMMENT_REQUIRED: 'Write a comment.',
  ACTIVITY: 'Activity',
  NO_ACTIVITY: 'No activity recorded yet.',
  ADD_COMMENT: 'Add a comment',
  COMMENT: 'Comment',
  SENDING: 'Sending…',
  BLOCKED_ON: 'Blocked on',
  MARK_BLOCKED: 'Mark blocked',
  SAVE_REASON: 'Save reason',
  SAVE_DESCRIPTION: 'Save description',
  CANCEL: 'Cancel',
  NO_DESCRIPTION: 'No description.',
  TRY_AGAIN: 'Try again',
  PICK_RECORD: 'Pick an organisation or account first.',
  RECORD: 'Record',
} as const;

/** A due date the panel may send: a real YYYY-MM-DD from the year 2000 on.
 *  A date input reports each typed segment, so a half-typed year ("0002")
 *  is refused here rather than saved. */
export function isDueDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 2000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  completed: 'Done',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Spec §5: a deactivated assignee reads "Unassigned (was X)". */
export function personName(person: TaskPerson | null): string {
  if (!person) return 'Unassigned';
  return person.active ? person.name : `Unassigned (was ${person.name})`;
}

export function parentPath(parent: TaskParentRef): string {
  return parent.kind === 'customer' ? `/organizations/${parent.id}` : `/accounts/${parent.id}`;
}

const SOURCE_TEXT: Record<TaskSource, string | null> = {
  manual: null,
  plan: 'From a plan',
  rule: 'From a rule',
  recommendation: 'Recommended by Revenact',
  agent: 'From the AI agent',
};

export function sourceText(row: Pick<TaskRow, 'source' | 'plan'>): string | null {
  if (row.source === 'plan' && row.plan) return `From ${row.plan.name}`;
  return SOURCE_TEXT[row.source];
}

export function hiddenTeamText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 task you can't open" : `${n} tasks you can't open`;
}

export function moreRowsText(shown: number, total: number): string | null {
  return total > shown ? `Showing ${shown} of ${total}` : null;
}

const TEAM_TITLE: Record<ScopeKey, string> = { me: 'Your tasks', team: "Your team's tasks", company: "Everyone's tasks" };
export const teamTitle = (scope: ScopeKey): string => TEAM_TITLE[scope];

/** A Team row's accessible name: the person and every count, in words. */
export function teamRowLabel(row: TeamPerson): string {
  const oldest = row.oldest_overdue ? `, oldest due ${formatDate(row.oldest_overdue)}` : '';
  return `${personName(row.person)}: ${row.open} open, ${row.overdue} overdue, ${row.blocked} blocked${oldest}`;
}

export function cantOpenText(kind: ParentKind): string {
  return kind === 'customer' ? "Can't open this organisation" : "Can't open this account";
}

export const doneLabel = (title: string): string => `Mark “${title}” done`;
export const doneStatus = (title: string): string => sentence(`Done: ${title}`);

export function actorName(actor: PersonRef | null, me: number | null): string {
  if (!actor) return 'Revenact';
  return actor.id === me ? 'You' : actor.name;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function ref(value: unknown): PersonRef | null {
  if (!value || typeof value !== 'object') return null;
  const person = value as { id?: unknown; name?: unknown };
  return typeof person.id === 'number' && typeof person.name === 'string' ? { id: person.id, name: person.name } : null;
}

const whom = (person: PersonRef, me: number | null): string => (person.id === me ? 'you' : person.name);

const STATUS_WORD: Record<TaskStatus, string> = { pending: 'pending', 'in-progress': 'in progress', blocked: 'blocked', completed: 'done' };
const statusWord = (value: unknown): string => STATUS_WORD[text(value) as TaskStatus] ?? text(value);

const FROM_SOURCE: Record<TaskSource, string> = {
  manual: '',
  plan: ' from a plan',
  rule: ' from a rule',
  recommendation: ' from a recommendation',
  agent: " from the AI agent's proposal",
};

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);
const late = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} overdue`;

/** One line of the trail, for the reader `me` (backend contract, Event table). */
export function eventSentence(event: TaskEvent, me: number | null): string {
  const who = actorName(event.actor, me);
  const data = event.data;
  switch (event.kind) {
    case 'created': {
      const assignee = ref(data.assignee);
      const forWhom = assignee ? ` for ${whom(assignee, me)}` : '';
      const from = FROM_SOURCE[text(data.source) as TaskSource] ?? '';
      const suggested = text(data.suggested);
      const note = !suggested
        ? ''
        : data.fallback === 'cannot_open'
          ? ` The agent suggested ${suggested}, who can't open this record.`
          : ` The agent suggested ${suggested}, who isn't a member here.`;
      return `${who} created this task${forWhom}${from}.${note}`;
    }
    case 'recommended': {
      const facts = Array.isArray(data.facts) ? data.facts.filter((fact): fact is string => typeof fact === 'string') : [];
      return facts.length > 0 ? `Revenact recommended it: ${facts.join('; ')}.` : 'Revenact recommended it.';
    }
    case 'assigned': {
      const to = ref(data.to);
      const from = ref(data.from);
      if (!to) return `${who} changed who does it.`;
      return `${who} assigned it to ${whom(to, me)}${from ? ` (was ${from.name})` : ''}.`;
    }
    case 'status': {
      const to = text(data.to);
      if (to === 'blocked') {
        const reason = text(data.reason);
        return reason ? `${who} marked it blocked: ${reason}` : `${who} marked it blocked.`;
      }
      if (to === 'completed') return `${who} marked it done.`;
      return `${who} moved it from ${statusWord(data.from)} to ${statusWord(data.to)}.`;
    }
    case 'due_changed':
      return `${who} moved the due date from ${formatDate(text(data.from) || null)} to ${formatDate(text(data.to) || null)}.`;
    case 'edited': {
      const field = text(data.field);
      if (field === 'title') return `${who} renamed it from “${text(data.from)}” to “${text(data.to)}”.`;
      if (field === 'priority') return `${who} changed the priority from ${text(data.from)} to ${text(data.to)}.`;
      if (field === 'record') {
        const to = data.to && typeof data.to === 'object' ? text((data.to as { name?: unknown }).name) : '';
        return to ? `${who} attached it to ${to}.` : `${who} attached it to a record.`;
      }
      return `${who} edited the description.`;
    }
    case 'comment':
      return `${who} commented`;
    case 'nudged': {
      const to = ref(data.to);
      const days = count(data.days_overdue);
      return to && days !== null ? `Revenact reminded ${whom(to, me)}: ${late(days, 'day')}.` : 'Revenact sent a reminder.';
    }
    case 'escalated': {
      const to = ref(data.to);
      const days = count(data.working_days_overdue);
      return to && days !== null ? `Revenact told ${whom(to, me)}: ${late(days, 'working day')}.` : 'Revenact told a manager it is overdue.';
    }
    default:
      return `${who} updated it.`;
  }
}
