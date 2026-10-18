// Recommended's words and rules (spec §2.4; delivery 2 contract), kept free
// of React so they are unit-tested on their own. Sentence case, no em dash.
import { ApiError } from '../../lib/apiClient';
import { AGENT_LABEL } from '../agents/agentsText';
import { WORK, isDueDate } from './workText';
import type { AssigneeOption, DismissReason, RecRowKind, RecommendationRow, TaskPerson } from './workTypes';
import { sentence } from '../../lib/sentence';

export const REC = {
  LOAD: 'Could not load recommendations.',
  EMPTY_TITLE: 'Nothing to decide',
  EMPTY_DETAIL: 'Revenact recommends work here when a renewal nears, health drops or tickets pile up.',
  ASSIGN: 'Assign',
  ASSIGN_TASK: 'Assign task',
  ASSIGNING: 'Assigning…',
  DISMISS: 'Dismiss',
  DISMISS_IT: 'Dismiss it',
  DISMISSING: 'Dismissing…',
  CANCEL: 'Cancel',
  WHO: 'Who does it',
  DUE: 'Due date',
  TITLE: 'Task title',
  REASON: 'Reason',
  CHOOSE_REASON: 'Choose a reason',
  NOTE: 'Say why',
  WHY: 'Why',
  EVIDENCE: 'Evidence',
  OPEN_TASK: 'Open task',
  GONE: "This recommendation isn't there any more.",
  ALREADY_DECIDED: 'Someone already decided this.',
  ASSIGN_FAILED: 'Could not assign that. Try again.',
  DISMISS_FAILED: 'Could not dismiss that. Try again.',
  PERSON_REQUIRED: 'Choose who does it.',
  REASON_REQUIRED: 'Choose a reason.',
  NOTE_REQUIRED: 'Say why.',
  NOTE_TOO_LONG: 'Keep the note under 255 characters.',
  TITLE_TOO_LONG: 'Keep the title under 255 characters.',
} as const;

export const KIND_LABEL: Record<RecRowKind, string> = {
  renewal_due: 'Renewal',
  health_drop: 'Health drop',
  urgent_tickets: 'Urgent tickets',
  overdue_tasks: 'Overdue tasks',
  open_questions: 'Open questions',
  anomaly: 'Anomaly',
  agent_action: 'AI agent',
};

/** The meta line's kind: the agent's name for an agent action (Decision 12). */
export function recKindText(rec: RecommendationRow): string {
  return rec.kind === 'agent_action' && rec.agent_action ? AGENT_LABEL[rec.agent_action.agent] : KIND_LABEL[rec.kind];
}

/** Spec §2.3's four reasons, in its order. */
export const DISMISS_REASONS: { value: DismissReason; label: string }[] = [
  { value: 'already_handled', label: 'Already handled' },
  { value: 'not_relevant', label: 'Not relevant' },
  { value: 'wrong_person', label: 'Wrong person' },
  { value: 'other', label: 'Other' },
];

const LONGEST = 255;

export function suggestedText(rec: RecommendationRow, me: number | null): string {
  const person = rec.suggested_assignee;
  if (!person) return 'Nobody suggested';
  if (person.id === me) return 'Suggested for you';
  if (!person.active) return `Suggested for ${person.name} (no longer active)`;
  if (!person.can_open) return `Suggested for ${person.name}, who can't open it now`;
  return `Suggested for ${person.name}`;
}

/** Whose queue it is in, when that is not the reader's. */
export function queueText(rec: RecommendationRow, me: number | null): string | null {
  return rec.recipient.id === me ? null : `In ${rec.recipient.name}'s queue`;
}

/** The contract: `active: false` or `can_open: false` is not prefilled. */
export function prefillAssignee(rec: RecommendationRow): number | null {
  const person = rec.suggested_assignee;
  return person && person.active && person.can_open ? person.id : null;
}

/** A choice the picker still offers enabled; kept as is while the list loads. */
export function pickable(people: AssigneeOption[] | null, id: number | null): number | null {
  if (id === null || people === null) return id;
  return people.some((person) => person.id === id && person.can_open) ? id : null;
}

export type AssignErrors = Partial<Record<'assignee_id' | 'due_date' | 'title', string>>;
export type DismissErrors = Partial<Record<'reason' | 'note', string>>;

export function validateAssign(form: { assignee: number | null; due: string; title: string }): AssignErrors {
  const errors: AssignErrors = {};
  if (form.assignee === null) errors.assignee_id = REC.PERSON_REQUIRED;
  if (!isDueDate(form.due)) errors.due_date = WORK.DATE_REQUIRED;
  const title = form.title.trim();
  if (!title) errors.title = WORK.TITLE_REQUIRED;
  else if (title.length > LONGEST) errors.title = REC.TITLE_TOO_LONG;
  return errors;
}

export function validateDismiss(reason: DismissReason | '', note: string): DismissErrors {
  if (reason === '') return { reason: REC.REASON_REQUIRED };
  if (reason !== 'other') return {};
  const text = note.trim();
  if (!text) return { note: REC.NOTE_REQUIRED };
  return text.length > LONGEST ? { note: REC.NOTE_TOO_LONG } : {};
}

export function assignedStatus(title: string, assignee: TaskPerson | null, me: number | null): string {
  const who = !assignee ? 'nobody' : assignee.id === me ? 'you' : assignee.name;
  return sentence(`Assigned to ${who}: ${title}`);
}

export const dismissedStatus = (title: string): string => sentence(`Dismissed: ${title}`);

/** A decision that can no longer happen (Decision 9): a 409 ALREADY_DECIDED
 *  with the server's own sentence ("Mona Manager already assigned this."),
 *  or a 404 (gone, or a record the reader can no longer open). Null for
 *  every other failure, which stays in the form. */
export function decidedElsewhere(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 404) return REC.GONE;
  if (err.status !== 409) return null;
  const body = err.body;
  const detail = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).detail : undefined;
  return typeof detail === 'string' && detail ? detail : REC.ALREADY_DECIDED;
}

/** A 403 CANT_DECIDE: the reader may no longer decide this one (it was
 *  re-routed, or their reach changed). The sentence stays in the form, and
 *  the list is read again so a re-routed row catches up. */
export function cantDecide(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = err.body;
  return body !== null && typeof body === 'object' && !Array.isArray(body) && (body as Record<string, unknown>).code === 'CANT_DECIDE';
}
