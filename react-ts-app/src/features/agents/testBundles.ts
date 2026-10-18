// Test-only: the bundle routes of the agent bundles D1 contract (§5, §9,
// §10.5), in front of stubFeed. Waiting bundles are the feed's `bundle`
// items; a run, a retry or a reject changes the bundle and the feed alike.
// Nothing is sent anywhere. No em dash.
import { vi } from 'vitest';
import { stubFeed, type FeedStub } from '../work/testFeed';
import { DECIDE_ITEMS } from '../work/testFeedFixtures';
import { outputLinks, stepAsAction } from './bundleText';
import { BUNDLES, PICK_LISTS, REFRESHED_STEPS, bundleItem } from './testBundleFixtures';
import type { FeedItem, TeamScope } from '../work/workTypes';
import type { Bundle, BundleStep, Department, FinishedStatus, PickListName, PickOption, QueueKey, QueueRow, QueuesPayload, StepFields, StepLink } from './bundleTypes';
import { FINISHED_STATUSES } from './bundleTypes';

export const LIVE_CHANNELS: PickOption[] = [
  { id: '5', name: '#support', detail: 'This thread' },
  { id: '5:C0ESCALATE', name: '#escalations', detail: 'Not synced' },
  { id: '5:C0RANDOM', name: '#random', detail: 'Not synced' },
];

export interface BundlesStub extends FeedStub {
  bundles?: Bundle[];
  /** Step id: the error a run or retry gives it (once per run; a retry succeeds). */
  failSteps?: Record<number, string>;
  /** The next run answers this instead, once. */
  refuseNextRun?: { status: number; body: unknown };
  failHistory?: number;
  historyHidden?: number;
  /** Action id: its bundle, for GET /agents/actions/<id>/. */
  actions?: Record<number, number>;
  /** Items per History page. Default 50. */
  historyPageSize?: number;
  /** Step id: the outputs a run gives it, overriding OUTPUTS. */
  outputs?: Record<number, Record<string, string | number>>;
  /** Department queues the rail lists (contract D2-7). Default none. */
  departments?: { key: Department; label: string }[];
  /** The rail lists Unassigned (the reader is an admin). Default false. */
  unassigned?: boolean;
  /** The reader's department, whose queue the badge counts (D2-9). Default 'cs'. */
  readerDepartment?: Department;
  /** Each routed queue's `needs_customer` on the rail (round 2 D3 contract §4); every other row, and any queue not named, is null. */
  needsCustomer?: Partial<Record<QueueKey, number>>;
  /** The live Slack channel list (contract §4.1); default LIVE_CHANNELS. */
  liveChannels?: PickOption[];
  channelNote?: string | null;
  refuseNextSave?: { status: number; body: unknown };
  /** The next refresh answers this instead, once: e.g. `409 NO_READER`, `BUDGET_USED`, `BUNDLE_CHANGED`, 429, 503 (contract §4.2). */
  refuseNextRefresh?: { status: number; body: unknown };
  /** The new steps a refresh adds after the kept ones. Default REFRESHED_STEPS. `[]` with no edited step leaves nothing: the bundle is superseded (contract §4.2). */
  refreshAnswer?: BundleStep[];
  /** Pick lists by name, overriding PICK_LISTS (contract §5.2). */
  options?: Partial<Record<PickListName, PickOption[]>>;
  /** The next read of a list answers this instead, once. */
  failOptions?: Partial<Record<PickListName, { status: number; body: unknown }>>;
  /** Step id: the error a run gives an outside step, once (a retry succeeds). */
  failOutside?: Record<number, string>;
  /** GET /auth/members/ (the Change form's people); default none. */
  members?: { id: number; name: string; function: string; is_active: boolean }[];
  /** Department heads by function, for a Change to "whoever handles a department" (contract §4). */
  heads?: Partial<Record<string, { id: number; name: string }>>;
  /** Step id: the note a run ends it skipped with (contract SE4-10), once. */
  skipSteps?: Record<number, string>;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const READER = { id: 1, name: 'Alice' };
const NOW = '2026-10-07T10:42:00Z';
const DEPARTMENTS = ['cs', 'engineering', 'sales', 'analytics', 'leadership', 'other'];
const REASONS = ['already_handled', 'not_relevant', 'wrong_person', 'other'];
const PLACEHOLDER = /\{\{\s*step\s+(\d+)\.([a-z_]+)\s*\}\}/g;
const OUTPUTS: Record<string, (id: number) => Record<string, string | number>> = {
  'task.create': (id) => ({ task_id: id, task_url: `/work/mine?task=${id}` }),
  'note.create': (id) => ({ note_id: id }),
  'campaign.send': (id) => ({ campaign_id: id, campaign_url: `/campaigns/${id}` }),
  'campaign.create': (id) => ({ campaign_id: id, campaign_url: `/campaigns/${id}` }),
  'survey.send': (id) => ({ survey_id: id, survey_url: `/surveys/${id}` }),
  'segment.create': (id) => ({ segment_id: id, segment_url: `/segments/${id}` }),
  'plan.start': (id) => ({ plan_id: id }),
  'jira.create': () => ({ ticket_key: 'SUP-501', ticket_url: 'https://acme.atlassian.net/browse/SUP-501' }),
  'jira.comment': () => ({ ticket_key: 'SUP-12', ticket_url: 'https://acme.atlassian.net/browse/SUP-12', comment_url: 'https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031' }),
  'slack.reply': () => ({ slack_ts: '1760340001.000100', slack_url: 'https://slack.com/archives/C0SUPPORT/p1760340001000100' }),
};

/** A step's links as the server writes them (contract §4.1, D3-16). */
function linksFor(s: BundleStep): StepLink[] {
  const app = outputLinks(s.outputs).map((l) => ({ label: l.label, url: l.to, external: false }));
  const out: StepLink[] = [...app];
  if (typeof s.outputs.comment_url === 'string') {
    out.push({ label: `Open the comment on ${String(s.outputs.ticket_key)} in Jira`, url: s.outputs.comment_url, external: true });
    return out;
  }
  if (typeof s.outputs.ticket_url === 'string') out.push({ label: `Open ${String(s.outputs.ticket_key)} in Jira`, url: s.outputs.ticket_url, external: true });
  if (typeof s.outputs.slack_url === 'string') out.push({ label: 'Open the Slack message', url: s.outputs.slack_url, external: true });
  return out;
}

/** A Jira assignee saved: none clears the model's member (no matched_later
 *  any more); a person picked is no longer matched later (contract §4.1). */
function takeAssignee(s: BundleStep, fields: StepFields) {
  if (!('assignee' in fields)) return;
  const who = fields.assignee;
  const preview = isObject(who) && typeof who.name === 'string' ? { name: who.name, matched_later: false } : null;
  if (s.preview.jira) s.preview.jira.assignee = preview;
  if (s.preview.jira_assign) s.preview.jira_assign.assignee = preview;
}

const ran = (b: Bundle) => (b.run_by ? b.run_by.name : 'Revenact');

/** `rejecter`: who rejected it, which the bundle does not carry (contract §5.3 sets no run_by). */
function refusal409(b: Bundle, rejecter?: string) {
  const at = b.run_finished_at ?? b.updated_at;
  const time = new Date(at).toISOString().slice(11, 16);
  const detail: Record<string, string> = {
    running: `${ran(b)} is running this.`,
    done: `${ran(b)} ran this at ${time}.`,
    partly_done: `${ran(b)} ran this at ${time}.`,
    rejected: `${rejecter ?? ran(b)} rejected this.`,
    expired: 'This bundle expired: it waited 14 days.',
    superseded: 'A newer bundle replaced this one.',
  };
  const code: Record<string, string> = { running: 'BUNDLE_RUNNING', done: 'BUNDLE_RAN', partly_done: 'BUNDLE_RAN', rejected: 'BUNDLE_REJECTED', expired: 'BUNDLE_EXPIRED', superseded: 'BUNDLE_SUPERSEDED' };
  return json(409, { code: code[b.status], detail: detail[b.status], bundle: b });
}

export function stubBundles(stub: BundlesStub = {}) {
  const bundles = new Map<number, Bundle>((stub.bundles ?? BUNDLES).map((b) => [b.id, clone(b)]));
  const waiting = [...bundles.values()].filter((b) => b.status === 'waiting');
  // Mine: the reader's own (contract §10.1). Workspace-level ones wait on Rest
  // of company (D6), Carl's on My team.
  const routedToPeople = waiting.filter((b) => b.routed_to === 'owner' || b.routed_to === 'person' || b.record === null);
  const mine = routedToPeople.filter((b) => b.for?.id === READER.id);
  const team: Partial<Record<TeamScope, FeedItem[]>> = stub.team ?? {
    team: routedToPeople.filter((b) => b.for !== null && b.for.id !== READER.id).map((b) => bundleItem(b, true)),
    company: routedToPeople.filter((b) => b.record === null).map((b) => bundleItem(b, true)),
  };
  const feed = stubFeed({ ...stub, team, decide: [...(stub.decide ?? DECIDE_ITEMS).filter((item) => item.kind !== 'bundle'), ...mine.map((b) => bundleItem(b))] });
  /** A bundle that ran or was rejected leaves every list. */
  const leave = (id: number) => {
    feed.decide.delete(`bundle:${id}`);
    for (const list of Object.values(team)) {
      const at = list?.findIndex((item) => item.key === `bundle:${id}`) ?? -1;
      if (list && at >= 0) list.splice(at, 1);
    }
  };
  const failing = { ...(stub.failSteps ?? {}) };
  const outsideFailing = { ...(stub.failOutside ?? {}) };
  const skipping = { ...(stub.skipSteps ?? {}) };
  let refuseRun = stub.refuseNextRun ?? null;
  let failHistory = stub.failHistory ?? 0;
  let nextOut = 990;
  const rejectedBy = new Map<number, string>();

  /** The audience is only said while a step waits (contract §7.1, §7.2). */
  function leaveProposed(s: BundleStep) {
    if (s.preview.survey) s.preview.survey.audience = null;
    if (s.preview.campaign) s.preview.campaign.audience = null;
  }

  /** Contract §6.1: placeholders sit in the payload's text values, which the
   *  panel sees through the step's preview and fields, never its title. */
  const holders = (s: BundleStep): string => JSON.stringify([s.preview, s.fields]);
  const fill = (b: Bundle, text: string): string => text.replace(PLACEHOLDER, (_all, n: string, key: string) => String(b.steps.find((o) => o.position === Number(n))?.outputs[key] ?? ''));

  /** Choosing a live channel turns the Slack preview into that channel (contract §4.1). */
  function takeChannel(s: BundleStep, fields: StepFields) {
    const choice = fields.channel_choice;
    if (typeof choice !== 'string' || !s.preview.slack) return;
    const picked = (stub.liveChannels ?? LIVE_CHANNELS).find((o) => o.id === choice);
    if (!picked) return;
    // in_thread is relative to the fixture's source connector 5; the id's prefix is the connector (contract §4.2).
    s.fields = { ...s.fields, connector_id: Number(choice.split(':')[0]) };
    s.preview.slack = { ...s.preview.slack, channel: picked.name, in_thread: choice === '5', synced: !(picked.detail ?? '').startsWith('Not synced') };
  }

  function runStep(b: Bundle, s: BundleStep) {
    for (const match of holders(s).matchAll(PLACEHOLDER)) {
      const producer = b.steps.find((other) => other.position === Number(match[1]));
      if (!producer || producer.status !== 'applied' || producer.outputs[match[2]] === undefined) {
        leaveProposed(s);
        s.status = 'failed';
        s.error = `Needs step ${match[1]}, which didn't run.`;
        return;
      }
    }
    if (skipping[s.id]) {
      leaveProposed(s);
      s.status = 'skipped';
      s.note = skipping[s.id];
      s.can_run = false;
      delete skipping[s.id];
      return;
    }
    if (failing[s.id]) {
      leaveProposed(s);
      s.status = 'failed';
      s.error = failing[s.id];
      delete failing[s.id];
      return;
    }
    if (outsideFailing[s.id]) {
      leaveProposed(s);
      s.status = 'failed';
      s.error = outsideFailing[s.id];
      delete outsideFailing[s.id];
      return;
    }
    // Contract §6.3: the filled values are what the step stores and shows.
    s.preview = JSON.parse(JSON.stringify(s.preview), (_key, value) => (typeof value === 'string' ? fill(b, value) : value));
    s.fields = JSON.parse(JSON.stringify(s.fields), (_key, value) => (typeof value === 'string' ? fill(b, value) : value));
    s.placeholders = [];
    leaveProposed(s);
    s.status = 'applied';
    s.error = '';
    s.can_run = false;
    s.outputs = stub.outputs?.[s.id] ?? (OUTPUTS[s.kind] ?? (() => ({})))(nextOut++);
    if (s.kind === 'jira.assign') s.outputs = { ticket_key: String(s.preview.jira_assign?.issue ?? ''), ticket_url: `https://acme.atlassian.net/browse/${String(s.preview.jira_assign?.issue ?? '')}` };
    s.links = linksFor(s);
    s.undo = s.irreversible ? { allowed: false, until: null, reason: 'irreversible' } : { allowed: true, until: '2026-10-14T10:42:00Z', reason: null };
  }

  function settle(b: Bundle) {
    const selected = b.steps.filter((s) => s.selected && s.status !== 'skipped');
    b.status = selected.every((s) => s.status === 'applied') ? 'done' : 'partly_done';
    b.run_finished_at = NOW;
    b.updated_at = NOW;
    b.can_run = false;
    b.can_reject = false;
    leave(b.id);
  }

  function run(b: Bundle, body: Record<string, unknown>) {
    if (refuseRun) {
      const answer = refuseRun;
      refuseRun = null;
      return json(answer.status, answer.body);
    }
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    const waiting = b.steps.filter((s) => s.status === 'proposed');
    const sent = Array.isArray(body.steps) ? (body.steps as { id: number; selected: boolean; fields?: StepFields }[]) : null;
    const ids = sent?.map((s) => s.id) ?? [];
    // Contract: a non-integer (or boolean) step id is a 400, never a 500; BUNDLE_REFRESHED reads only integer ids.
    const whole = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id);
    if (sent && !ids.every(whole)) return json(400, { steps: ['List every waiting step once.'] });
    if (b.refreshed_at && replaced.has(b.id) && ids.some((id) => !b.steps.some((s) => s.id === id)))
      return json(409, { code: 'BUNDLE_REFRESHED', detail: 'This bundle was updated with a newer message. Review it again.', bundle: b });
    if (!sent || ids.length !== waiting.length || new Set(ids).size !== ids.length || waiting.some((s) => !ids.includes(s.id))) return json(400, { steps: ['List every waiting step once.'] });
    if (!sent.some((s) => s.selected)) return json(400, { steps: ['Choose at least one step to run.'] });
    for (const asked of sent) {
      const s = b.steps.find((candidate) => candidate.id === asked.id) as BundleStep;
      if (asked.selected && !s.can_run) return json(403, { code: 'CANT_RUN_STEP', detail: `You can't run step ${s.position}.`, step: s.id });
      for (const key of Object.keys(asked.fields ?? {})) {
        if (!asked.selected || !s.editable.includes(key)) return json(400, { steps: { [s.id]: { [key]: ["This can't be changed here."] } } });
        if (key === 'title' && String(asked.fields?.[key] ?? '').trim() === '') return json(400, { steps: { [s.id]: { title: ['Give the task a title.'] } } });
      }
    }
    b.run_by = READER;
    b.run_started_at = NOW;
    for (const asked of sent) {
      const s = b.steps.find((candidate) => candidate.id === asked.id) as BundleStep;
      s.selected = asked.selected;
      if (!asked.selected) {
        s.status = 'skipped';
        continue;
      }
      if (asked.fields && Object.keys(asked.fields).length > 0) {
        s.fields = { ...s.fields, ...asked.fields };
        takeAssignee(s, asked.fields);
        takeChannel(s, asked.fields);
        if (typeof asked.fields.title === 'string') s.title = asked.fields.title;
        b.edited_at = NOW;
        b.edited_by = READER;
      }
    }
    for (const s of [...b.steps].sort((x, y) => x.position - y.position)) if (s.selected && s.status === 'proposed') runStep(b, s);
    settle(b);
    return json(200, { bundle: b });
  }

  function retry(b: Bundle, stepId: number, body: Record<string, unknown>) {
    const s = b.steps.find((candidate) => candidate.id === stepId);
    if (!s) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
    if (b.status === 'running') return refusal409(b, rejectedBy.get(b.id));
    if (s.status !== 'failed') return json(409, { code: 'NOT_FAILED', detail: 'Only a failed step can be retried.', bundle: b });
    // Contract §7.1, §7.2: a send step is retried only by the person who ran it (a step error, not a refusal).
    if ((s.kind === 'campaign.send' || s.kind === 'survey.send') && b.run_by?.id !== READER.id) {
      s.error = 'Only the person who ran this step can retry it.';
      return json(200, { bundle: b });
    }
    const fields = (body.fields ?? {}) as StepFields;
    s.fields = { ...s.fields, ...fields };
    takeAssignee(s, fields);
    takeChannel(s, fields);
    runStep(b, s);
    settle(b);
    return json(200, { bundle: b });
  }

  function reject(b: Bundle, body: Record<string, unknown>) {
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    if (!REASONS.includes(String(body.reason))) return json(400, { reason: ['Choose already handled, not relevant, wrong person or other.'] });
    const note = typeof body.note === 'string' ? body.note : '';
    if (note.length > 255) return json(400, { note: ['Keep the note under 255 characters.'] });
    for (const s of b.steps) if (s.status === 'proposed') s.status = 'rejected';
    Object.assign(b, { status: 'rejected', reject_reason: body.reason, reject_note: note, updated_at: NOW, can_run: false, can_reject: false, rejected_by: READER });
    rejectedBy.set(b.id, READER.name);
    leave(b.id);
    return json(200, { bundle: b });
  }

  function history(url: URL) {
    if (failHistory > 0) {
      failHistory -= 1;
      return json(500, { detail: 'Down.' });
    }
    const agent = url.searchParams.get('agent');
    const kind = url.searchParams.get('step_kind');
    const status = url.searchParams.get('status');
    if (agent !== null && !['cs', 'sales', 'ops'].includes(agent)) return json(400, { agent: ['Choose cs, sales or ops.'] });
    if (status !== null && !FINISHED_STATUSES.includes(status as FinishedStatus)) return json(400, { status: ['Choose done, partly done, rejected, expired or superseded.'] });
    const rows = [...bundles.values()]
      .filter((b) => FINISHED_STATUSES.includes(b.status as FinishedStatus))
      .filter((b) => (agent ? b.agent === agent : true) && (status ? b.status === status : true) && (kind ? b.steps.some((s) => s.kind === kind) : true))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
    const size = stub.historyPageSize ?? 50;
    const page = Number(url.searchParams.get('page') ?? '1');
    const start = (page - 1) * size;
    if (start > 0 && start >= rows.length) return json(404, { detail: 'Invalid page.' });
    const at = (n: number) => `http://localhost/api/v1/agents/bundles/history/?page=${n}`;
    return json(200, { count: rows.length, next: start + size < rows.length ? at(page + 1) : null, previous: page > 1 ? at(page - 1) : null, results: rows.slice(start, start + size), hidden: stub.historyHidden ?? 0 });
  }

  let refuseSave = stub.refuseNextSave ?? null;
  let refuseRefresh = stub.refuseNextRefresh ?? null;
  const replaced = new Set<number>();

  /** Contract §4.1. */
  function save(b: Bundle, stepId: number, body: Record<string, unknown>) {
    if (refuseSave) {
      const answer = refuseSave;
      refuseSave = null;
      return json(answer.status, answer.body);
    }
    const s = b.steps.find((candidate) => candidate.id === stepId);
    // A step a Refresh removed is no longer waiting: the 409 carries the bundle as it is now.
    if (!s) return b.status === 'waiting' ? json(409, { code: 'STEP_NOT_WAITING', detail: 'Only a waiting step can be changed.', bundle: b }) : refusal409(b, rejectedBy.get(b.id));
    if (!s.can_run && s.status === 'proposed') return json(403, { code: 'CANT_RUN_STEP', detail: `You can't run step ${s.position}.`, step: s.id });
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    if (s.status !== 'proposed') return json(409, { code: 'STEP_NOT_WAITING', detail: 'Only a waiting step can be changed.', bundle: b });
    // Contract §4.1: neither a `selected` key nor a non-empty `fields` object ({} and {"fields": {}} alike).
    const fields = (isObject(body.fields) ? body.fields : {}) as StepFields;
    if (!('selected' in body) && Object.keys(fields).length === 0) return json(400, { steps: ['Send fields or selected.'] });
    for (const key of Object.keys(fields)) if (!s.editable.includes(key)) return json(400, { steps: { [s.id]: { [key]: ["This can't be changed here."] } } });
    if (typeof fields.title === 'string' && fields.title.trim() === '') return json(400, { steps: { [s.id]: { title: ['Give the task a title.'] } } });
    if ('selected' in body && typeof body.selected !== 'boolean') return json(400, { steps: { [s.id]: { selected: ['Choose on or off.'] } } });
    s.fields = { ...s.fields, ...fields };
    takeAssignee(s, fields);
    takeChannel(s, fields);
    if (typeof fields.title === 'string') s.title = fields.title;
    if (typeof body.selected === 'boolean') s.selected = body.selected;
    s.edited = true;
    b.edited_at = NOW;
    b.edited_by = READER;
    b.updated_at = NOW;
    return json(200, { bundle: b });
  }

  /** Contract §4.2: keep edited steps (renumbered 1..k), append the new ones. */
  function refresh(b: Bundle) {
    if (b.source.kind !== 'thread') return json(409, { code: 'NOT_A_THREAD', detail: 'Only a bundle made from a message can be refreshed.' });
    if (!b.can_run) return json(403, { code: 'CANT_RUN', detail: "You can't run this bundle." });
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    if (refuseRefresh) {
      const answer = refuseRefresh;
      refuseRefresh = null;
      return json(answer.status, answer.body);
    }
    const kept = b.steps.filter((s) => s.status !== 'proposed' || s.edited).sort((x, y) => x.position - y.position);
    kept.forEach((s, index) => (s.position = index + 1));
    const added = clone(stub.refreshAnswer ?? REFRESHED_STEPS).map((s, index) => ({ ...s, position: kept.length + index + 1 }));
    b.steps = [...kept, ...added];
    b.step_count = b.steps.length;
    // Nothing kept and nothing new: the bundle is superseded and the answer is that bundle.
    if (b.steps.length === 0) {
      b.status = 'superseded';
      b.can_run = false;
      b.can_reject = false;
      b.can_refresh = false;
    }
    b.has_newer_message = false;
    b.refreshed_at = NOW;
    b.updated_at = NOW;
    replaced.add(b.id);
    return json(200, { bundle: b });
  }

  const FUNCTION_WORDS: Record<string, string> = { cs: 'Customer Success', engineering: 'Engineering', sales: 'Sales', analytics: 'Analytics', leadership: 'Leadership', other: 'Other' };

  function handler(b: Bundle, body: Record<string, unknown>) {
    if (!b.escalation) return json(409, { code: 'NOT_AN_ESCALATION', detail: 'Only an escalation has someone who handles it.' });
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    if (!('user_id' in body)) return json(400, { user_id: ['This field is required.'] });
    let who: { id: number; name: string; function_label: string } | null = null;
    let via: 'head' | 'nobody' | 'chosen' = 'nobody';
    let fn = b.escalation.function;
    if (body.user_id === null) {
      if (typeof body.function !== 'string' || !DEPARTMENTS.includes(body.function)) return json(400, { function: ['Choose a department.'] });
      fn = body.function as Department;
      const head = stub.heads?.[fn];
      who = head ? { ...head, function_label: FUNCTION_WORDS[fn] } : null;
      via = who ? 'head' : 'nobody';
    } else {
      const m = (stub.members ?? []).find((p) => p.id === body.user_id);
      if (!m) return json(400, { user_id: ['No such member.'] });
      if (!m.is_active) return json(400, { user_id: [`${m.name} is deactivated. Pick an active member.`] });
      who = { id: m.id, name: m.name, function_label: FUNCTION_WORDS[m.function] ?? '' };
      via = 'chosen';
    }
    const was = b.escalation.handler;
    const before = was ? `with ${was.function_label ? `${was.name} (${was.function_label})` : was.name}` : null;
    const after = who ? `with ${who.function_label ? `${who.name} (${who.function_label})` : who.name}` : '';
    b.escalation = { ...b.escalation, function: fn, function_label: fn ? FUNCTION_WORDS[fn] : '', handler: who, via };
    for (const s of b.steps) {
      if (s.status !== 'proposed') continue;
      // Contract SE4-13: a reply still in the template's words names the new person.
      if (s.kind === 'slack.reply' && !s.edited && before && typeof s.fields.text === 'string' && s.fields.text.includes(before)) {
        s.fields = { ...s.fields, text: s.fields.text.replace(before, after).replace(' .', '.') };
        s.edited = true;
      }
      if (s.kind === 'jira.assign' && s.preview.jira_assign) {
        s.preview.jira_assign = { ...s.preview.jira_assign, assignee: who ? { name: who.name, matched_later: true } : null };
        s.edited = true;
      }
      if (s.kind === 'task.create') {
        s.fields = { ...s.fields, assignee_id: who?.id ?? null };
        if (s.preview.task) s.preview.task = { ...s.preview.task, assignee: who ? { id: who.id, name: who.name } : null };
        s.edited = true;
      }
    }
    b.edited_at = NOW;
    b.edited_by = READER;
    b.updated_at = NOW;
    return json(200, { bundle: b });
  }

  const department = (b: Bundle) => (b.routed_to === 'department' ? b.department?.key : null);
  const inQueue = (scope: string, b: Bundle) =>
    b.status === 'waiting' && (scope === 'unassigned' ? b.routed_to === 'admins' && b.source.kind === 'thread' : `department:${department(b)}` === scope);
  const offeredQueue = (scope: string) => (scope === 'unassigned' ? stub.unassigned === true : (stub.departments ?? []).some((d) => `department:${d.key}` === scope));

  /** Contract §4.6: the queue's waiting bundles in `decide`, nothing else. */
  function queueScope(scope: string, cursor: string | null) {
    if (scope.startsWith('department:') && !DEPARTMENTS.includes(scope.slice('department:'.length)))
      return json(400, { code: 'SCOPE_UNKNOWN', detail: 'Choose team, company, a department or unassigned.' });
    if (!offeredQueue(scope)) return json(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
    // A queue answers one page (next: null), so any cursor is stale or bad, as on the team scope.
    if (cursor !== null) return json(400, { cursor: ['That list has changed. Reload Work.'] });
    const items = [...bundles.values()].filter((b) => inQueue(scope, b)).map((b) => bundleItem(b, true));
    const group = (key: string, list: FeedItem[]) => ({ key, count: list.length, items: list, next: null });
    return json(200, { scope, groups: [group('decide', items), group('overdue', []), group('suggested', [])], hidden: 0, failed: [] });
  }

  const KIND_LISTS: Record<string, PickListName[]> = {
    'jira.create': ['jira_projects', 'jira_issue_types', 'jira_priorities', 'jira_assignees'],
    'jira.assign': ['jira_assignees'],
    'slack.reply': ['slack_channels'],
  };
  const failList = { ...(stub.failOptions ?? {}) };

  /** Contract §5.2. */
  function pickList(s: BundleStep, list: PickListName, url: URL) {
    if (!(KIND_LISTS[s.kind] ?? []).includes(list)) return json(400, { list: ['This step has no such list.'] });
    // Refused in the contract's order: list, then project, then query.
    const project = url.searchParams.get('project') ?? '';
    if (list === 'jira_issue_types' && !project) return json(400, { project: ['Choose a project first.'] });
    const query = url.searchParams.get('query') ?? '';
    if (query.length > 100) return json(400, { query: ['Keep the search under 100 characters.'] });
    const failed = failList[list];
    if (failed) {
      delete failList[list];
      return json(failed.status, failed.body);
    }
    if (list === 'jira_issue_types') {
      return json(200, { options: stub.options?.jira_issue_types ?? PICK_LISTS.jira_issue_types[project] ?? [], more: false });
    }
    if (list === 'slack_channels' && url.searchParams.get('live') === '1') {
      // Contract: unsynced rows match on the bare name, synced rows on their "#name" label.
      const live = (stub.liveChannels ?? LIVE_CHANNELS).filter((o) => {
        const synced = !(o.detail ?? '').startsWith('Not synced');
        return (synced ? o.name : o.name.replace(/^#/, '')).toLowerCase().includes(query.toLowerCase());
      });
      return json(200, { options: live.slice(0, 100), more: live.length > 100, note: stub.channelNote ?? null });
    }
    const rows = (stub.options?.[list] ?? (PICK_LISTS[list] as PickOption[])).filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
    return json(200, { options: rows, more: false });
  }

  const waitingIn = (scope: string) => [...bundles.values()].filter((b) => inQueue(scope, b)).length;

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (method === 'GET' && path === '/agents/bundles/history/') return history(url);
    const match = /^\/agents\/bundles\/(\d+)\/(?:(run|reject|refresh)\/|steps\/(\d+)\/retry\/)?$/.exec(path);
    if (match) {
      const b = bundles.get(Number(match[1]));
      if (!b) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
      if (method === 'GET' && !match[2] && !match[3]) return json(200, b);
      if (method === 'POST' && match[2] === 'run') return run(b, body);
      if (method === 'POST' && match[2] === 'reject') return reject(b, body);
      if (method === 'POST' && match[2] === 'refresh') return refresh(b);
      if (method === 'POST' && match[3]) return retry(b, Number(match[3]), body);
    }
    const optionsPath = /^\/agents\/bundles\/(\d+)\/steps\/(\d+)\/options\/([a-z_]+)\/$/.exec(path);
    if (optionsPath && method === 'GET') {
      const b = bundles.get(Number(optionsPath[1]));
      const s = b?.steps.find((candidate) => candidate.id === Number(optionsPath[2]));
      if (!b || !s) return json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
      return pickList(s, optionsPath[3] as PickListName, url);
    }
    const undo = /^\/agents\/actions\/(\d+)\/undo\/$/.exec(path);
    if (undo && method === 'POST') {
      for (const b of bundles.values()) {
        const s = b.steps.find((candidate) => candidate.id === Number(undo[1]));
        if (!s) continue;
        if (s.status !== 'applied' || !s.undo?.allowed) return json(409, { code: 'NOT_APPLIED', detail: 'Only an applied action can be undone.' });
        s.status = 'undone';
        s.undo = null;
        return json(200, { action: { ...stepAsAction(b, s), status: 'undone', undo: null, undone_by: READER, undone_at: NOW } });
      }
    }
    const action = /^\/agents\/actions\/(\d+)\/$/.exec(path);
    if (method === 'GET' && action && stub.actions?.[Number(action[1])] !== undefined) {
      // The action is the step of that id (a bundle of one, contract §1.4): its status with it.
      const owner = bundles.get(stub.actions[Number(action[1])]);
      const status = owner?.steps.find((candidate) => candidate.id === Number(action[1]))?.status ?? 'applied';
      return json(200, { id: Number(action[1]), bundle: stub.actions[Number(action[1])], status });
    }
    const handlerPath = /^\/agents\/bundles\/(\d+)\/handler\/$/.exec(path);
    if (handlerPath && method === 'PATCH') {
      const b = bundles.get(Number(handlerPath[1]));
      return b ? handler(b, body) : json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
    }
    if (method === 'GET' && path === '/auth/members/' && stub.members) return json(200, stub.members);
    const stepPath = /^\/agents\/bundles\/(\d+)\/steps\/(\d+)\/$/.exec(path);
    if (stepPath && method === 'PATCH') {
      const b = bundles.get(Number(stepPath[1]));
      return b ? save(b, Number(stepPath[2]), body) : json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
    }
    if (method === 'GET' && path === '/work/feed/team/') {
      const scope = url.searchParams.get('scope') ?? '';
      if (scope === 'unassigned' || scope.startsWith('department:')) return queueScope(scope, url.searchParams.get('cursor'));
    }
    if (method === 'GET' && path === '/work/queues/') {
      const base = (await feed.spy(input, init)) as unknown as { ok: boolean; json: () => Promise<unknown> };
      if (!base.ok) return base;
      const answer = (await base.json()) as QueuesPayload;
      const extra: QueueRow[] = [
        ...(stub.departments ?? []).map((d) => ({ key: `department:${d.key}` as const, label: d.label, count: waitingIn(`department:${d.key}`) })),
        ...(stub.unassigned ? [{ key: 'unassigned' as const, label: 'Unassigned', count: waitingIn('unassigned') }] : []),
      ];
      const at = answer.queues.findIndex((q) => q.key === 'history');
      answer.queues.splice(at < 0 ? answer.queues.length : at, 0, ...extra);
      for (const row of answer.queues) row.needs_customer = stub.needsCustomer?.[row.key] ?? null;
      return json(200, answer);
    }
    if (method === 'GET' && path === '/work/feed/count/') {
      const answered = (await feed.spy(input, init)) as unknown as { ok: boolean; json: () => Promise<unknown> };
      if (!answered.ok) return answered;
      const base = (await answered.json()) as { decide: number; overdue: number; badge: number; failed: string[] };
      const own = waitingIn(`department:${stub.readerDepartment ?? 'cs'}`);
      return json(200, { ...base, decide: base.decide + own, badge: base.badge + own });
    }
    return feed.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, feed, bundles };
}
