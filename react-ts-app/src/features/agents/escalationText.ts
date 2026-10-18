// Slack escalations D4 (contract SE4-5, SE4-12, SE4-13, SE4-26; frontend
// Decisions 1 to 3 and 7): the escalation bundle's words and pure rules.
// Kept free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import { PLACEHOLDER_RE } from './bundleText';
import type { Bundle, BundleStep, Escalation, Placeholder } from './bundleTypes';

export const ESCALATION = {
  HANDLED_BY: 'Handled by',
  CHOOSE: 'Choose who handles this',
  CHANGE: 'Change',
  CHOOSE_BUTTON: 'Choose',
  PERSON: 'Person',
  DEPARTMENT: 'Department',
  WHOEVER: 'Whoever handles a department',
  SAVE: 'Save',
  SAVING: 'Saving…',
  CANCEL: 'Cancel',
  SAVE_FAILED: "Couldn't change who handles this. Try again.",
  CHOOSE_DEPARTMENT: 'Choose a department.',
  RUNS_LAST: 'Runs last',
  RUNS_LAST_ISSUE: 'Runs last, once the Jira issue exists',
  KEEP_MARKERS: 'Keep the words in brackets as they are: they become the Jira key and link.',
  PARTICIPANT: 'You can run this because you took part in the Slack thread.',
  fillsIn: (n: number) => `Fills in when step ${n} runs:`,
  remove: (label: string) => `Remove ${label}`,
  nowHandledBy: (name: string) => `Now handled by ${name}.`,
  assignedBy: (by: string, quote: string) => `Assigned by the thread: ${by}, "${quote}"`,
  threadSaid: (by: string, quote: string) => `The thread said: ${by}, "${quote}"`,
  noMatch: (named: string) => `The thread named ${named}, but no member matches. Choose who handles this.`,
  noOneNamed: (rest: string) => `No one was named in the thread, so it goes to ${rest}`,
} as const;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Faiz Jamal (Customer Success)", or the name alone with no department. */
const personText = (h: NonNullable<Escalation['handler']>) => (h.function_label ? `${h.name} (${h.function_label})` : h.name);

/** The handler block's two lines (Decision 2): where it came from, and who. */
export function handlerLines(esc: Escalation, recordName: string): { source: string | null; person: string | null } {
  const said = esc.decision;
  const h = esc.handler;
  switch (esc.via) {
    case 'thread':
      return { source: said ? ESCALATION.assignedBy(firstName(said.by), said.quote) : null, person: h ? personText(h) : null };
    case 'unresolved':
      return { source: ESCALATION.noMatch(said?.named ?? ''), person: null };
    case 'team': {
      const who = h ? `${h.name} (on ${recordName}'s account team)` : null;
      // R5: after a department Change the server keeps the decision (SE4-13).
      if (said) return { source: ESCALATION.threadSaid(firstName(said.by), said.quote), person: who };
      return { source: who ? ESCALATION.noOneNamed(who) : ESCALATION.CHOOSE, person: null };
    }
    case 'head': {
      const who = h ? `${h.name} (${esc.function_label} head)` : null;
      if (said) return { source: ESCALATION.threadSaid(firstName(said.by), said.quote), person: who };
      return { source: who ? ESCALATION.noOneNamed(who) : ESCALATION.CHOOSE, person: null };
    }
    case 'chosen':
      return { source: said ? ESCALATION.threadSaid(firstName(said.by), said.quote) : null, person: h ? personText(h) : null };
    default:
      return { source: said ? ESCALATION.threadSaid(firstName(said.by), said.quote) : ESCALATION.CHOOSE, person: null };
  }
}

/** The panel's order (Decision 1): an escalation's reply first, the rest by position. */
export function displayOrder(bundle: Bundle): BundleStep[] {
  const steps = [...bundle.steps].sort((a, b) => a.position - b.position);
  if (!bundle.escalation) return steps;
  return [...steps.filter((s) => s.kind === 'slack.reply'), ...steps.filter((s) => s.kind !== 'slack.reply')];
}

export function runsLastText(bundle: Bundle): string {
  return bundle.steps.some((s) => s.kind === 'jira.create') ? ESCALATION.RUNS_LAST_ISSUE : ESCALATION.RUNS_LAST;
}

const MARK: Record<string, string> = { ticket_key: 'Jira key', ticket_url: 'Jira link' };

/** A placeholder as the person reads it in the reply's text (Decision 3). */
export const markerOf = (p: Placeholder): string => `[${MARK[p.key] ?? p.label}]`;

const named = (placeholders: Placeholder[], n: string, key: string) => placeholders.find((p) => p.step === Number(n) && p.key === key);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The stored text as the person edits it: each placeholder as its marker. */
export function toMarkers(raw: string, placeholders: Placeholder[]): string {
  return raw.replace(PLACEHOLDER_RE, (all: string, n: string, key: string) => {
    const p = named(placeholders, n, key);
    return p ? markerOf(p) : all;
  });
}

/** What the person typed, as stored text: each marker the stored text had,
 *  in order, is its placeholder again; a marker typed beyond those stays
 *  words, so a chip can be kept or removed but never typed (Decision 3). */
export function fromMarkers(edited: string, stored: string, placeholders: Placeholder[]): string {
  const budget = new Map<string, string[]>();
  for (const m of stored.matchAll(PLACEHOLDER_RE)) {
    const p = named(placeholders, m[1], m[2]);
    if (!p) continue;
    const mark = markerOf(p);
    budget.set(mark, [...(budget.get(mark) ?? []), m[0]]);
  }
  if (budget.size === 0) return edited;
  const pattern = new RegExp([...budget.keys()].map(escape).join('|'), 'g');
  return edited.replace(pattern, (mark) => budget.get(mark)?.shift() ?? mark);
}

/** The reply's text with a marker taken out; a marker wrapped in brackets
 *  takes the brackets too, and either way one adjacent space goes with it
 *  (the one before, else the one after at the start of the text). */
export function withoutMarker(shown: string, marker: string): string {
  for (const form of [`(${marker})`, marker]) {
    if (shown.includes(` ${form}`)) return shown.replace(` ${form}`, '');
    if (shown.startsWith(`${form} `)) return shown.slice(form.length + 1);
    if (shown.includes(form)) return shown.replace(form, '');
  }
  return shown;
}

export interface HandlerRefusal {
  field: 'function' | 'user_id' | null;
  message: string;
  /** 404: the reader lost the bundle. */
  lost: boolean;
}

const firstOf = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

/** Contract §4's refusals, read for the Change form. */
export function readHandlerRefusal(err: unknown): HandlerRefusal {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null) return { field: null, message: ESCALATION.SAVE_FAILED, lost: false };
  if (err.status === 404) return { field: null, message: '', lost: true };
  const body = err.body as Record<string, unknown>;
  for (const field of ['function', 'user_id'] as const) {
    const message = firstOf(body[field]);
    if (message) return { field, message, lost: false };
  }
  return { field: null, message: typeof body.detail === 'string' ? body.detail : ESCALATION.SAVE_FAILED, lost: false };
}
