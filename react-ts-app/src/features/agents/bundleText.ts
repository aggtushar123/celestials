// The bundle panel's words and pure rules (agent bundles D1 contract §3, §4,
// §6, §9; frontend Decisions 6 to 15). Kept free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import { forText } from '../work/feed';
import { DISMISS_REASONS } from '../work/recommended';
import type { BundleFeedItem } from '../work/workTypes';
import { ACTION_KINDS, AGENT_KINDS, type ActionKind, type ActionResult, type AgentAction, type AgentKind, type JiraLinkHint, type MailPreview, type SegmentPinPreview } from './agentTypes';
import { FINISHED_STATUSES, type Audience, type Bundle, type BundleSource, type BundleStatus, type BundleStep, type FinishedStatus, type HistoryFilters, type PickListName, type Placeholder, type RejectReason, type RunBody, type StepFieldValue, type StepFields, type StepLink, type StepSave } from './bundleTypes';

export const BUNDLE = {
  REVIEW: 'Review',
  LOAD: 'Could not load this bundle.',
  LOADING: 'Loading the bundle',
  LOST: "You can't open that any more.",
  STEPS: 'Steps',
  CANT_UNDO: "Can't be undone",
  RUNNING: 'Running…',
  RUN_FAILED: 'Could not run this bundle. Try again.',
  NONE_SELECTED: 'Choose at least one step to run.',
  RETRY: 'Retry',
  RETRYING: 'Retrying…',
  RETRY_FAILED: 'Could not retry this step. Try again.',
  SAVING: 'Saving…',
  SAVED: 'Saved.',
  EDITED: 'Edited',
  SAVE_FAILED: 'Could not save this step. Try again.',
  NEWER: 'New message since this was edited',
  REFRESH: 'Refresh suggestions',
  REFRESHING: 'Refreshing…',
  REFRESHED: 'Suggestions refreshed.',
  REFRESH_FAILED: "Couldn't refresh the suggestions. Try again.",
  NO_LONGER: 'The agent no longer suggests this.',
  REJECT: 'Reject bundle',
  REJECT_IT: 'Reject it',
  REJECTING: 'Rejecting…',
  REJECT_FAILED: 'Could not reject this bundle. Try again.',
  WHY: 'Why',
  CHOOSE_REASON: 'Choose a reason.',
  CHOOSE_REASON_OPTION: 'Choose a reason',
  NOTE: 'Note (optional)',
  NOTE_HINT: 'Up to 255 characters.',
  CANCEL: 'Cancel',
  DISCARD_TITLE: 'Discard your edits?',
  DISCARD: 'Discard',
  KEEP: 'Keep editing',
  REJECTED: 'Rejected.',
  DRAFT_ONLY: 'Save as draft only',
  QUESTION: 'Question',
  AUDIENCE: 'Audience',
  ROLES: 'Who at each record',
  SURVEY_TYPE: 'Survey type',
  NAME: 'Name',
  SUBJECT: 'Subject',
  BODY: 'Message',
  INTRO: 'Intro',
  TITLE: 'Title',
  NOTE_TITLE: 'Note title',
  NOTE_BODY: 'Note',
  REPLY: 'Reply',
  ALREADY_RAN: 'Applied',
  SAVED_AS_DRAFT: 'Saved as a draft.',
  SKIPPED: 'Not run',
  REJECTED_STEP: 'Rejected',
  UNDONE: 'Undone',
  FROM: 'From',
  STEP_COUNT_ONE: '1 step',
  TIMING: 'When it sends',
  SEND_NOW: 'Send now',
  AFTER_JIRA: 'When the Jira issue is resolved',
  SCENARIO_RAN: 'The scenario ran.',
  SCENARIO_FAILED: 'The scenario failed.',
} as const;

export const STATUS_WORD: Record<BundleStatus, string> = {
  waiting: 'Waiting',
  running: 'Running',
  done: 'Done',
  partly_done: 'Partly done',
  rejected: 'Rejected',
  expired: 'Expired',
  superseded: 'Replaced',
};

export const REJECT_REASONS: { value: RejectReason; label: string }[] = DISMISS_REASONS;

/** What the reject form holds; the panel keeps it, so closing asks first
 *  and Keep editing brings it back. */
export interface RejectDraft {
  reason: RejectReason | '';
  note: string;
}

export const NO_REJECT: RejectDraft = { reason: '', note: '' };

export const runLabel = (n: number): string => `Run ${n} selected`;
export const stepCountText = (n: number): string => (n === 1 ? BUNDLE.STEP_COUNT_ONE : `${n} steps`);
export const filledInText = (n: number): string => `Filled in from step ${n} when it runs.`;

/** The panel's edits, per step id, until Run (contract D10). */
export type Draft = Record<number, { selected: boolean; fields: StepFields }>;

export const runnable = (step: BundleStep): boolean => step.status === 'proposed' && step.can_run;

/** A step's fields as the panel starts them: a Jira assignee left to the
 *  model (none stored, the preview's `matched_later`) starts as that member
 *  by name, so choosing Unassigned is a change that sends `assignee: null`
 *  (contract §4.1: it clears the model's member). */
export function startFields(step: BundleStep): StepFields {
  const later = (step.preview.jira?.assignee ?? step.preview.jira_assign?.assignee) ?? null;
  if (step.fields.assignee === null && later?.matched_later && step.editable.includes('assignee')) return { ...step.fields, assignee: { id: '', name: later.name } };
  return { ...step.fields };
}

export function draftOf(bundle: Bundle): Draft {
  return Object.fromEntries(bundle.steps.map((step) => [step.id, { selected: runnable(step) && step.selected, fields: startFields(step) }]));
}

export const selectedCount = (bundle: Bundle, draft: Draft): number => bundle.steps.filter((step) => runnable(step) && draft[step.id]?.selected).length;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The editable keys whose value differs from the stored one. */
export function changedFields(step: BundleStep, fields: StepFields): StepFields {
  const start = startFields(step);
  // Where the live picker owns the channel, `channel_choice` alone is sent: the server lets a
  // `connector_id` win, and the draft's copy goes stale once a saved pick moves the step.
  const viaChoice = step.editable.includes('channel_choice');
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => step.editable.includes(key) && !(viaChoice && key === 'connector_id') && !same(value, start[key])));
}

/** What PATCH /agents/bundles/<id>/steps/<step>/ sends for one step (contract §4.1; Decision 6):
 *  its changed fields, or its tick when `tick`; null when there is nothing to save. */
export function stepSave(step: BundleStep, entry: Draft[number] | undefined, { tick }: { tick: boolean }): StepSave | null {
  if (!entry || !runnable(step)) return null;
  if (tick) return entry.selected === step.selected ? null : { selected: entry.selected };
  const fields = changedFields(step, entry.fields);
  return Object.keys(fields).length > 0 ? { fields } : null;
}

/** Every waiting step once; fields only on ticked steps, only changed ones (contract §5.1). */
export function runBody(bundle: Bundle, draft: Draft): RunBody {
  return {
    steps: bundle.steps
      .filter((step) => step.status === 'proposed')
      .map((step) => {
        const entry = draft[step.id];
        const selected = runnable(step) && Boolean(entry?.selected);
        const fields = selected && entry ? changedFields(step, entry.fields) : {};
        return Object.keys(fields).length > 0 ? { id: step.id, selected, fields } : { id: step.id, selected };
      }),
  };
}

export function isDirty(bundle: Bundle, draft: Draft): boolean {
  const start = draftOf(bundle);
  return bundle.steps.some((step) => {
    const entry = draft[step.id];
    return entry !== undefined && (entry.selected !== start[step.id].selected || Object.keys(changedFields(step, entry.fields)).length > 0);
  });
}

const SENDS = ['campaign.send', 'survey.send'];

/** Contract §3: a kind with "Save as draft only" can't be undone while the switch is off. */
export function showsCantUndo(step: BundleStep, fields: StepFields): boolean {
  if (step.editable.includes('draft_only')) return (SENDS.includes(step.kind) || step.outside) && fields.draft_only !== true;
  return step.irreversible;
}

export const PLACEHOLDER_RE = /\{\{\s*step\s+(\d+)\.([a-z_]+)\s*\}\}/g;

/** Text with each `{{step N.key}}` as a chip (frontend Decision 10). */
export function textParts(text: string, placeholders: Placeholder[]): (string | { chip: string })[] {
  const parts: (string | { chip: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const named = placeholders.find((p) => p.step === Number(match[1]) && p.key === match[2]);
    parts.push({ chip: named ? named.label : `${BUNDLE.FROM} step ${match[1]}` });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const one = (noun: string) => noun.replace(/s$/, '');

export function audienceText(audience: Audience, limit?: number | null): string {
  const people = `${audience.contacts} ${audience.contacts === 1 ? 'contact' : 'contacts'}`;
  const records = `${audience.records} ${audience.records === 1 ? one(audience.record_noun) : audience.record_noun}`;
  const text = `${people} across ${records}`;
  return limit ? `${text} · at most ${limit}` : text;
}

/** Slack bundles: a segment pin's change, "Not pinned → Pinned". */
export const pinText = (pin: SegmentPinPreview): string => `${pin.from} → ${pin.to}`;

/** Slack bundles: what a step's run left, beside its state: a held survey's
 *  wait ("Waiting for KAN-12"), or a scenario run's note or outcome. */
export function afterRunText(step: BundleStep): string | null {
  if (step.status === 'proposed') return null;
  const wait = step.preview.record_survey?.wait;
  if (wait) return wait.label;
  const run = step.preview.scenario_run?.run;
  if (run) return run.note || (run.status === 'success' ? BUNDLE.SCENARIO_RAN : BUNDLE.SCENARIO_FAILED);
  return null;
}

/** The line that takes focus after a run (frontend Decision 11). */
export function summaryText(bundle: Bundle): string {
  const ran = bundle.steps.filter((step) => step.selected && step.status !== 'skipped');
  const applied = ran.filter((step) => step.status === 'applied' || step.status === 'undone').length;
  const failed = ran.filter((step) => step.status === 'failed').length;
  if (bundle.status === 'rejected') return BUNDLE.REJECTED;
  if (applied === 0 && failed === 0) return 'Nothing ran: every step had expired.';
  if (bundle.status === 'done') return `Done: all ${applied} ${applied === 1 ? 'step' : 'steps'} ran.`;
  const count = `${applied} of ${ran.length} ${ran.length === 1 ? 'step' : 'steps'} ran.`;
  if (failed === 0) return count;
  return `${count} ${failed === 1 ? 'Retry the failed one.' : 'Retry the failed ones.'}`;
}

const LINK_LABEL: Record<string, string> = {
  task_url: 'Open task',
  campaign_url: 'Open campaign',
  survey_url: 'Open survey',
  segment_url: 'Open segment',
  rule_url: 'Open scenario',
  canvas_url: 'Open map',
};

/** A step's result links (contract §6.2): only `*_url` keys with a page, in the table's order. */
export function outputLinks(outputs: Record<string, string | number>): { label: string; to: string }[] {
  return Object.keys(LINK_LABEL)
    .filter((key) => typeof outputs[key] === 'string' && String(outputs[key]).startsWith('/'))
    .map((key) => ({ label: LINK_LABEL[key], to: String(outputs[key]) }));
}

const EXPIRED: Record<string, string> = {
  changed: 'the record changed since',
  not_reproposed: 'the agent no longer proposes it',
  replaced: 'the agent no longer proposes it',
  never: 'this action is now set to never',
  waited: 'it waited 14 days',
  date_passed: 'its date has passed',
};

export const expiredText = (reason: string): string => `Expired: ${EXPIRED[reason] ?? 'it expired'}.`;

/** A finished step's state line (not a failed one: that is its error). */
export function stepStateText(step: BundleStep): string | null {
  if (step.status === 'applied') return step.editable.includes('draft_only') && step.fields.draft_only === true ? BUNDLE.SAVED_AS_DRAFT : BUNDLE.ALREADY_RAN;
  if (step.status === 'skipped') return BUNDLE.SKIPPED;
  if (step.status === 'rejected') return BUNDLE.REJECTED_STEP;
  if (step.status === 'undone') return BUNDLE.UNDONE;
  if (step.status === 'expired') return expiredText(step.expired_reason);
  return null;
}

export interface RunRefusal {
  form: string | null;
  /** step id: field: its first message. */
  fields: Record<number, Record<string, string>>;
  /** A 409's bundle as it is now. */
  bundle: Bundle | null;
  /** 404: the reader lost the bundle. */
  lost: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const first = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

/** Contract §9: run, retry and reject refusals, read for the panel. */
export function readRunRefusal(err: unknown, fallback: string = BUNDLE.RUN_FAILED): RunRefusal {
  const out: RunRefusal = { form: null, fields: {}, bundle: null, lost: false };
  if (!(err instanceof ApiError) || !isObject(err.body)) return { ...out, form: fallback };
  const body = err.body;
  if (err.status === 404) return { ...out, lost: true };
  if (isObject(body.bundle)) out.bundle = body.bundle as unknown as Bundle;
  const whole = first(body.steps);
  if (whole) return { ...out, form: whole };
  if (isObject(body.steps)) {
    for (const [id, value] of Object.entries(body.steps)) {
      if (!isObject(value)) continue;
      const fields: Record<string, string> = {};
      for (const [key, messages] of Object.entries(value)) {
        const message = first(messages);
        if (message) fields[key] = message;
      }
      out.fields[Number(id)] = fields;
    }
    if (Object.keys(out.fields).length > 0) return out;
  }
  for (const key of ['reason', 'note']) {
    const message = first(body[key]);
    if (message) return { ...out, fields: { 0: { [key]: message } } };
  }
  if (typeof body.detail === 'string') return { ...out, form: body.detail };
  return { ...out, form: fallback };
}

export const BUNDLE_GONE = "That bundle isn't there any more, or it's on a record you can't open.";

const NO_RESULT: ActionResult = {
  task_id: null,
  note_id: null,
  initiative_id: null,
  draft_id: null,
  plan_id: null,
  segment_id: null,
  rule_id: null,
  campaign_id: null,
  canvas_id: null,
  template_id: null,
};

/** A step as the shared action shape, so AgentActionBody and UndoAction show
 *  it as they show any action; every placeholder in its preview becomes its
 *  words (Decision 10: never raw braces). */
export function stepAsAction(bundle: Bundle, step: BundleStep): AgentAction {
  const words = (text: string) => textParts(text, step.placeholders).map((part) => (typeof part === 'string' ? part : part.chip)).join('');
  const preview = JSON.parse(JSON.stringify(step.preview), (_key, value) => (typeof value === 'string' ? words(value) : value));
  return {
    id: step.id,
    agent: bundle.agent,
    kind: step.kind,
    title: words(step.title),
    status: step.status,
    record: bundle.record ? { kind: bundle.record.type, id: bundle.record.id, name: bundle.record.name } : null,
    preview,
    rationale: step.rationale,
    evidence: step.evidence,
    decided_by: null,
    decided_at: null,
    auto: false,
    applied_at: null,
    undo: step.undo,
    undone_by: null,
    undone_at: null,
    result: NO_RESULT,
    created_at: bundle.created_at,
    bundle: bundle.id,
  };
}

export const HISTORY = {
  LIST: 'Finished bundles',
  LOAD: 'Could not load History.',
  LOADING: 'Loading History',
  EMPTY_TITLE: 'Nothing finished yet',
  EMPTY_DETAIL: "Bundles show here once they ran, were rejected or expired, with each step's result and Undo for 7 days.",
  STEP_KIND: 'Step kind',
  ALL_STEP_KINDS: 'All step kinds',
  RAN_BY: 'Ran by',
  REJECTED_BY: 'Rejected by',
  ON_ITS_OWN: 'Applied on its own',
} as const;

export function historyFiltersOf(params: URLSearchParams): HistoryFilters {
  const agent = params.get('agent');
  const kind = params.get('step_kind');
  const status = params.get('status');
  const page = Number(params.get('page'));
  return {
    agent: AGENT_KINDS.includes(agent as AgentKind) ? (agent as AgentKind) : null,
    step_kind: ACTION_KINDS.includes(kind as ActionKind) ? (kind as ActionKind) : null,
    status: FINISHED_STATUSES.includes(status as FinishedStatus) ? (status as FinishedStatus) : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** `params` with the History filters written in (and an open panel closed). */
export function historyParams(filters: HistoryFilters, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['agent', 'step_kind', 'status', 'page', 'bundle']) next.delete(key);
  if (filters.agent) next.set('agent', filters.agent);
  if (filters.step_kind) next.set('step_kind', filters.step_kind);
  if (filters.status) next.set('status', filters.status);
  if (filters.page > 1) next.set('page', String(filters.page));
  return next;
}

/** Who finished it, for a History row; null when the bundle does not say
 *  (expired or replaced).
 *  rejected: `rejected_by` (contract D2-28), else `run_by`. */
export function finishedByText(bundle: Bundle): string | null {
  if (bundle.status === 'expired' || bundle.status === 'superseded') return null;
  if (bundle.status === 'rejected') {
    const who = bundle.rejected_by ?? bundle.run_by;
    return who ? `${HISTORY.REJECTED_BY} ${who.name}` : null;
  }
  return bundle.run_by ? `${HISTORY.RAN_BY} ${bundle.run_by.name}` : HISTORY.ON_ITS_OWN;
}

/** The source line's words (Decision 3): "Zendesk ZD-1042 from ann@x.com", then "3 messages" for mail. */
export function sourceParts(source: BundleSource): string[] {
  if (source.kind === 'meeting') return [source.label, source.title].filter(Boolean);
  if (source.kind === 'slack_message') return [source.sender ? `${source.label} from ${source.sender}` : source.label];
  const head = [source.label, source.ticket].filter(Boolean).join(' ');
  const parts = [source.from ? `${head} from ${source.from}` : head];
  if (source.channel === 'mail' && source.messages > 1) parts.push(`${source.messages} messages`);
  return parts;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** A meeting's slot in the reader's time zone, 24-hour: "Tue 10:00–11:00". */
export function meetingSlotText(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime())) return '';
  const head = `${WEEKDAYS[start.getDay()]} ${hhmm(start)}`;
  return Number.isNaN(end.getTime()) ? head : `${head}–${hhmm(end)}`;
}

/** The one rule for a routed bundle (Decision 5): a department's bundle is for its department,
 *  an Unassigned thread says "Unassigned", an owner-routed or nightly one says nothing. */
function routedWords(routedTo: Bundle['routed_to'], department: Bundle['department'], sourceKind: BundleSource['kind']): string | null {
  if (routedTo === 'department' && department) return `For ${department.label}`;
  if (routedTo === 'admins' && sourceKind === 'thread') return 'Unassigned';
  // Slack bundles: a Slack message's bundle is its sender's alone, and only they read it.
  if (routedTo === 'person') return 'For you';
  return null;
}

/** Who a bundle is for: the routed words, else its owner or the company. */
export function bundleForText(bundle: Bundle): string {
  return routedWords(bundle.routed_to, bundle.department, bundle.source.kind) ?? forText(bundle.for) ?? '';
}

/** A queue row's routed words, or null for an owner-routed or nightly row. */
export function routedText(detail: BundleFeedItem['detail']): string | null {
  return routedWords(detail.routed_to, detail.department, detail.source.kind);
}

/** "Open in Zendesk", the link's visible words; openInText adds what a screen reader needs. */
export const openInLabel = (label: string): string => `Open in ${label}`;
export const openInText = (label: string): string => `${openInLabel(label)} (opens in a new tab)`;

/** Agent bundles D3: the outside steps' words (frontend Decisions 1 to 7). */
export const OUTSIDE = {
  COMMENT: 'Comment',
  INTERNAL: 'Only your team sees this comment in Jira.',
  TO: 'To',
  CC: 'Cc',
  ADDRESSES_HINT: 'Separate addresses with commas.',
  REPLY: 'Reply',
  CHANNEL: 'Channel',
  MESSAGE: 'Message',
  PROJECT: 'Project',
  CHOOSE_PROJECT: 'Choose a project.',
  ISSUE_TYPE: 'Issue type',
  SUMMARY: 'Summary',
  DESCRIPTION: 'Description',
  PRIORITY: 'Priority',
  ASSIGNEE: 'Assignee',
  JIRA_DEFAULT: "Jira's default",
  UNASSIGNED: 'Unassigned',
  SEARCH_PEOPLE: 'Search people in Jira',
  NOBODY: 'Nobody matches.',
  NO_CHANNELS: 'No channels match.',
  NOTHING: 'Nothing to choose from.',
  CHOOSE: 'Choose…',
  TRY_AGAIN: 'Try again',
  THREADED: 'Goes in the same email thread.',
  OPEN_SETTING: 'Open Connections',
  OPENS_NEW_TAB: '(opens in a new tab)',
  LINK_JIRA: 'Link your Jira account to act as yourself.',
  SEARCH_CHANNELS: 'Search channels',
} as const;

export const postsAsText = (who: string): string => `Posts as ${who}`;
export const whoText = (name: string, you = false): string => (you ? `you (${name})` : name);
export const jiraAsText = (who: string, you = false): string => `Created in Jira as ${whoText(who, you)}`;
export const assignedAsText = (who: string, you = false): string => `Assigned in Jira as ${whoText(who, you)}`;
export const commentsAsText = (who: string, you = false): string => `Comments in Jira as ${whoText(who, you)}`;

/** Round 2 D2 Decision 4: how a bot line says you could act as yourself. */
export function linkHintText(link: JiraLinkHint | undefined, site: string): string | null {
  if (link === 'none') return OUTSIDE.LINK_JIRA;
  if (link === 'other_site') return `Your Jira link doesn't cover ${site}.`;
  return null;
}
export const onIssueText = (issue: string): string => `On ${issue}`;
export const matchedLaterText = (name: string): string => `${name} (matched in Jira by email when it runs)`;

const LIST_NOUN: Record<PickListName, string> = {
  jira_projects: 'Jira projects',
  jira_issue_types: 'issue types',
  jira_priorities: 'priorities',
  jira_assignees: 'people in Jira',
  slack_channels: 'Slack channels',
};
export const listNoun = (list: PickListName): string => LIST_NOUN[list];
export const listLoading = (list: PickListName): string => `Loading ${LIST_NOUN[list]}…`;
export const listFailed = (list: PickListName): string => `Couldn't load ${LIST_NOUN[list]}.`;

/** One typed line of addresses as a list (Decision 2). */
export function parseAddresses(text: string): string[] {
  return text.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
}

export function addressesText(value: StepFieldValue): string {
  return Array.isArray(value) ? value.join(', ') : '';
}

export function fromText(preview: MailPreview): string | null {
  return preview.from ? `From ${preview.from}` : null;
}

/** Only https URLs are ever drawn as external links (Global Constraints). */
export function isExternal(link: StepLink): boolean {
  return link.external && link.url.startsWith('https://');
}

/** An app path the router may follow: one leading slash, never `//` or `/\`
 *  (a browser reads those as another site). */
export function isAppPath(url: string): boolean {
  return /^\/(?![/\\])/.test(url);
}

/** A History row's links: its applied outside steps' external links (Decision 9). */
export function historyLinks(bundle: Bundle): StepLink[] {
  return bundle.steps.filter((s) => s.outside && s.status === 'applied').flatMap((s) => (s.links ?? []).filter(isExternal));
}
