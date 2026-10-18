// Guided agent (2026-10-18; backend docs/API_CONTRACTS.md "Guided agent:
// diagnose, write, send"): a bundle answered one question at a time, drawn
// as a conversation. The words and the thread's shape. No em dash.
import type { DiagnoseFinding } from './agentTypes';
import type { Bundle, BundleStep } from './bundleTypes';
import { isAppPath } from './bundleText';

export const GUIDED = {
  YES: 'Yes',
  NOT_NOW: 'Not now',
  EDIT: 'Edit',
  CANCEL_EDIT: 'Cancel edit',
  YOU: 'You',
  AGENT: 'Revenact',
  THREAD: 'Conversation with Revenact',
  ANSWER: 'Your answer',
  WORKING: 'Revenact is working…',
  STOPPED: 'Stopped. Nothing else was done.',
  FINDINGS: 'What I found',
  DRAFT_IS_READY: 'Here is the draft.',
  OPEN_HISTORY: 'Open in History',
  TO: 'To',
  FROM: 'From',
  SUBJECT: 'Subject',
  BODY: 'Message',
  EDITING: 'Change anything, then answer Yes to send it.',
  RUN_FAILED: "Couldn't run this step. Try again.",
  STOP_FAILED: "Couldn't stop. Try again.",
  PRIORITY: 'Priority',
  OPEN: 'Open',
} as const;

const READ_WORDS: Record<string, string> = {
  health: 'health',
  tickets: 'tickets',
  calls: 'calls',
  emails: 'emails',
  slack: 'Slack',
  contacts: 'contacts',
};

/** "Reading tickets, calls, emails, Slack…": what a diagnosis reads, in the server's order. */
export function readsText(reads: readonly string[]): string {
  const words = reads.map((read) => READ_WORDS[read] ?? read);
  return words.length > 0 ? `Reading ${words.join(', ')}…` : GUIDED.WORKING;
}

export const summaryHiddenText = (runner: string): string => `Summary hidden: it used ${runner}'s private mail.`;
export const onlyOwnerText = (owner: string): string => `Only ${owner} can see the draft`;
export const sentText = (to: string, from: string | null): string => (from ? `Sent to ${to} from ${from}.` : `Sent to ${to}.`);
export const onTimelineText = (record: string): string => `Added to ${record}'s timeline.`;
export const doneText = (record: string | null): string => (record ? `Done. Everything is in History and on ${record}'s timeline.` : 'Done. Everything is in History.');
export const priorityText = (title: string): string => `${GUIDED.PRIORITY}: ${title}`;

/** What the agent asks before a step: the server's question, else its own fallback. */
export function questionOf(step: BundleStep): string {
  return step.question || `Next: ${step.title}. Should I go ahead?`;
}

/** Where a finding's source opens: the tool's own https page (a new tab),
 *  an app path (in the app), or nowhere. */
export function findingHref(finding: DiagnoseFinding): { href: string; external: boolean } | null {
  const url = finding.source.url;
  if (!url) return null;
  if (url.startsWith('https://')) return { href: url, external: true };
  if (isAppPath(url)) return { href: url, external: false };
  return null;
}

/** One line of the conversation. `ask` is the agent's question; `yes` and
 *  `not-now` the reader's answer; `result` an applied step's answer;
 *  `failed` its error with Retry; `state` a step that ended otherwise
 *  (rejected, expired, undone); `stopped` and `done` close the thread. */
export type ThreadEntry =
  | { kind: 'ask' | 'yes' | 'not-now' | 'result' | 'failed' | 'state'; key: string; step: BundleStep }
  | { kind: 'stopped' | 'done'; key: string };

/** The conversation so far: each step up to and including the one asked
 *  now, in order. A skipped step reads as "Not now" and ends the thread
 *  (the later ones were skipped with it); nothing after the first waiting
 *  step shows. A bundle that finished without a stop says Done. */
export function threadOf(bundle: Bundle): ThreadEntry[] {
  const steps = [...bundle.steps].sort((a, b) => a.position - b.position);
  const out: ThreadEntry[] = [];
  let stopped = false;
  let open = false;
  for (const step of steps) {
    const key = String(step.id);
    if (step.status === 'proposed') {
      if (step.id === bundle.next_step) out.push({ kind: 'ask', key: `ask-${key}`, step });
      open = true;
      break;
    }
    out.push({ kind: 'ask', key: `ask-${key}`, step });
    if (step.status === 'applied') {
      out.push({ kind: 'yes', key: `yes-${key}`, step }, { kind: 'result', key: `result-${key}`, step });
    } else if (step.status === 'failed') {
      out.push({ kind: 'yes', key: `yes-${key}`, step }, { kind: 'failed', key: `failed-${key}`, step });
    } else if (step.status === 'skipped') {
      out.push({ kind: 'not-now', key: `no-${key}`, step }, { kind: 'stopped', key: 'stopped' });
      stopped = true;
      break;
    } else {
      out.push({ kind: 'state', key: `state-${key}`, step });
    }
  }
  if (!stopped && !open && bundle.status === 'done') out.push({ kind: 'done', key: 'done' });
  return out;
}

/** The step asked now, when there is one. */
export function nextStepOf(bundle: Bundle): BundleStep | null {
  if (bundle.next_step == null) return null;
  return bundle.steps.find((step) => step.id === bundle.next_step) ?? null;
}

/** The email fields of a send step, as the reader may edit them. */
export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export function emailDraftOf(step: BundleStep): EmailDraft {
  const text = (key: string) => (typeof step.fields[key] === 'string' ? String(step.fields[key]) : '');
  return { to: text('to'), subject: text('subject'), body: text('body') };
}

/** Only the fields the reader changed, among those the server lets them edit. */
export function changedEmail(step: BundleStep, draft: EmailDraft): Partial<EmailDraft> {
  const was = emailDraftOf(step);
  const out: Partial<EmailDraft> = {};
  for (const key of ['to', 'subject', 'body'] as const) if (step.editable.includes(key) && draft[key] !== was[key]) out[key] = draft[key];
  return out;
}

/** The feed's priority bundles, first come first (stable). */
export function prioritySort<T extends { kind: string; detail?: unknown }>(items: readonly T[]): T[] {
  const high = (item: T) => item.kind === 'bundle' && (item.detail as { priority?: string } | undefined)?.priority === 'high';
  return [...items.filter(high), ...items.filter((item) => !high(item))];
}
