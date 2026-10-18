// Test-only: one stateful fetch stub for /api/v1/agents/, in the delivery 1
// to 3 contracts' shapes and refusal orders. Writes are kept, so a later read
// returns them; every answer is a copy. Anything it does not know goes to
// `passThrough` (so stubWork or stubBrain can sit behind it). No em dash.
import { vi } from 'vitest';
import {
  ACTIONS,
  AGENT_SETTINGS,
  BUILT_CAMPAIGN_ID,
  BUILT_CANVAS_ID,
  BUILT_RULE_ID,
  BUILT_SEGMENT_ID,
  BUILT_TEMPLATE_ID,
  DRAFT_EMAIL_ID,
  DRAFT_TICKET_ID,
  STARTED_PLAN_ID,
} from './testAgentsFixtures';
import type { ActionKind, ActionLevel, AgentAction, AgentKind, AgentSettings, FastLaneRules } from './agentTypes';

export interface AgentsStub {
  settings?: AgentSettings;
  actions?: AgentAction[];
  /** Whether the reader may decide and undo every action. Default true. */
  mayDecide?: boolean;
  /** Ids whose undo answers CHANGED_SINCE. */
  changedSince?: number[];
  /** Whether a draft (by id) was sent or marked sent: undoing its draft.reply
   *  answers CHANGED_SINCE (stubDrafts' `isSent`). */
  draftSent?: (draftId: number) => boolean;
  /** spent_this_month per agent, overriding the cards. */
  spent?: Partial<Record<AgentKind, number>>;
  /** Activity's `hidden`. Default 0. */
  hidden?: number;
  /** How many reads of each fail (500) first. */
  failSettings?: number;
  failActivity?: number;
  /** The next decision (approve, reject or undo) answers this instead, once. */
  refuseNextDecision?: { status: number; body: unknown };
  /** The next run answers this instead, once. */
  refuseNextRun?: { status: number; body: unknown };
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
}

export interface ActionState {
  action: AgentAction;
  /** Undo answers CHANGED_SINCE while true. */
  changed: boolean;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const DOWN = { detail: 'Down.' };
const READER = { id: 1, name: 'Alice' };
const LEVELS: readonly ActionLevel[] = ['auto', 'ask', 'never'];
const RANK: Record<ActionLevel, number> = { never: 0, ask: 1, auto: 2 };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const SENDER = /^(@|[^@\s]+@)[^@\s]+\.[^@\s]+$/;
const isWhole = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
const tidy = (list: unknown[]) => [...new Set(list.map((v) => String(v).trim().toLowerCase()))];

export function stubAgents(stub: AgentsStub = {}) {
  const settings: AgentSettings = JSON.parse(JSON.stringify(stub.settings ?? AGENT_SETTINGS));
  for (const card of settings.agents) {
    const spent = stub.spent?.[card.kind];
    if (spent !== undefined) card.spent_this_month = spent;
  }
  const changed = new Set(stub.changedSince ?? []);
  const actions = new Map<number, ActionState>(
    (stub.actions ?? ACTIONS).map((a) => [a.id, { action: JSON.parse(JSON.stringify(a)) as AgentAction, changed: changed.has(a.id) }]),
  );
  const mayDecide = stub.mayDecide ?? true;
  let failSettings = stub.failSettings ?? 0;
  let failActivity = stub.failActivity ?? 0;
  let refuseDecision = stub.refuseNextDecision ?? null;
  let refuseRun = stub.refuseNextRun ?? null;
  const settle: ((id: number) => void)[] = [];

  function decidedText(a: AgentAction): string {
    if (a.status === 'undone') return `${a.undone_by?.name ?? 'Someone'} already undid this.`;
    const who = a.decided_by?.name ?? 'Someone';
    return a.status === 'rejected' ? `${who} already rejected this.` : `${who} already applied this.`;
  }

  function decide(id: number, verb: 'approve' | 'reject' | 'undo', body?: Record<string, unknown>) {
    const state = actions.get(id);
    if (!state) return json(404, { code: 'NO_SUCH_ACTION', detail: 'No such action.' });
    if (!mayDecide) return json(403, { code: 'CANT_DECIDE', detail: "You can't decide this action." });
    if (refuseDecision) {
      const answer = refuseDecision;
      refuseDecision = null;
      return json(answer.status, answer.body);
    }
    if (verb === 'reject' && typeof body?.note === 'string' && body.note.length > 255) return json(400, { note: ['Keep the note under 255 characters.'] });
    const a = state.action;
    if (verb === 'undo') {
      if (a.status === 'undone') return json(409, { code: 'ALREADY_DECIDED', detail: decidedText(a), action: a });
      if (a.status !== 'applied') return json(409, { code: 'NOT_APPLIED', detail: 'Only an applied action can be undone.' });
      if (a.undo && a.undo.reason === 'expired') return json(410, { code: 'UNDO_EXPIRED', detail: 'Undo is available for 7 days after an action applies.' });
      if (a.kind === 'draft.reply' && a.result.draft_id !== null && stub.draftSent?.(a.result.draft_id)) {
        return json(409, { code: 'CHANGED_SINCE', detail: 'This draft has been sent.' });
      }
      if (state.changed) {
        return json(409, { code: 'CHANGED_SINCE', detail: `${a.preview.field ?? 'It'} has changed since: it is now Churn.`, current: 'Churn', applied: a.preview.to ?? '' });
      }
      a.status = 'undone';
      a.undone_by = READER;
      a.undone_at = '2026-10-08T09:30:00Z';
      a.undo = null;
      return json(200, { action: a });
    }
    if (a.status === 'expired') return json(409, { code: 'EXPIRED', detail: 'This action has expired: the record changed since.', action: a });
    if (a.status !== 'proposed') return json(409, { code: 'ALREADY_DECIDED', detail: decidedText(a), action: a });
    a.decided_by = READER;
    a.decided_at = '2026-10-08T09:10:00Z';
    if (verb === 'reject') {
      a.status = 'rejected';
    } else {
      a.status = 'applied';
      a.applied_at = '2026-10-08T09:10:00Z';
      a.undo = { allowed: true, until: '2026-10-15T09:10:00Z', reason: null };
      if (a.kind === 'task.create') a.result = { ...a.result, task_id: 90 };
      if (a.kind === 'draft.reply') a.result = { ...a.result, draft_id: a.preview.draft?.channel === 'ticket' ? DRAFT_TICKET_ID : DRAFT_EMAIL_ID };
      if (a.kind === 'plan.start') a.result = { ...a.result, plan_id: STARTED_PLAN_ID };
      if (a.kind === 'segment.create') a.result = { ...a.result, segment_id: BUILT_SEGMENT_ID };
      if (a.kind === 'scenario.create') a.result = { ...a.result, rule_id: BUILT_RULE_ID, segment_id: BUILT_SEGMENT_ID };
      if (a.kind === 'campaign.create') a.result = { ...a.result, campaign_id: BUILT_CAMPAIGN_ID, segment_id: BUILT_SEGMENT_ID };
      if (a.kind === 'canvas.create') a.result = { ...a.result, canvas_id: BUILT_CANVAS_ID };
      if (a.kind === 'plan.template') a.result = { ...a.result, template_id: BUILT_TEMPLATE_ID };
    }
    settle.forEach((fn) => fn(id));
    return json(200, { action: a });
  }

  function saveSettings(body: unknown) {
    if (!settings.can_edit) return json(403, { detail: 'You do not have permission to perform this action.' });
    if (!isObject(body)) return json(400, { non_field_errors: ['Send the fields as one object.'] });
    const errors: Record<string, unknown> = {};
    if ('ai_enabled' in body && typeof body.ai_enabled !== 'boolean') errors.ai_enabled = ['Choose on or off.'];
    if ('tone' in body && !['professional', 'friendly', 'concise'].includes(String(body.tone))) errors.tone = ['Choose professional, friendly or concise.'];
    const INTERVALS = ['30m', '1h', '4h', '24h'];
    if ('signal_interval' in body && !INTERVALS.includes(String(body.signal_interval))) errors.signal_interval = ['Choose every 30 minutes, every hour, every 4 hours or once a day.'];
    if ('signal_sources' in body) {
      if (!isObject(body.signal_sources)) errors.signal_sources = ['Send the sources as one object.'];
      else {
        const wrong: Record<string, string[]> = {};
        for (const [key, value] of Object.entries(body.signal_sources)) {
          if (!settings.signals.sources.some((s) => s.key === key)) wrong[key] = ['Unknown source.'];
          else if (typeof value !== 'boolean') wrong[key] = ['Choose on or off.'];
        }
        if (Object.keys(wrong).length > 0) errors.signal_sources = wrong;
      }
    }
    if ('fast_lane' in body) {
      const lane = settings.signals.fast_lane;
      if (!lane) errors.fast_lane = ['Unknown setting.'];
      else if (!isObject(body.fast_lane)) errors.fast_lane = ['Send the fast lane as one object.'];
      else {
        const wrong: Record<string, unknown> = {};
        const rules: Record<string, string[]> = {};
        const patch = body.fast_lane;
        const rulesIn = isObject(patch.rules) ? patch.rules : {};
        for (const key of Object.keys(patch)) if (!['on', 'rules', 'per_hour', 'per_day'].includes(key)) wrong[key] = ['Unknown setting.'];
        for (const key of Object.keys(rulesIn)) if (!(key in lane.rules)) rules[key] = ['Unknown setting.'];
        if ('on' in patch && typeof patch.on !== 'boolean') wrong.on = ['Choose on or off.'];
        for (const key of ['jira_priority', 'poor_health'] as const) if (key in rulesIn && typeof rulesIn[key] !== 'boolean') rules[key] = ['Choose on or off.'];
        const { words, senders, slack_connectors: slack } = rulesIn;
        if (words !== undefined) {
          if (!Array.isArray(words) || words.length > lane.limits.words) rules.words = [`Add at most ${lane.limits.words} words.`];
          else if (words.some((w) => typeof w !== 'string' || w.trim().length < 2 || w.trim().length > 40)) rules.words = ['Use 2 to 40 characters for each word.'];
        }
        if (senders !== undefined) {
          if (!Array.isArray(senders) || senders.length > lane.limits.senders) rules.senders = [`Add at most ${lane.limits.senders} senders.`];
          else if (senders.some((v) => typeof v !== 'string' || !SENDER.test(v.trim()))) rules.senders = ['Use an email address or @domain for each sender.'];
        }
        if (slack !== undefined && (!Array.isArray(slack) || slack.some((id) => !lane.slack_choices.some((c) => c.id === id)))) rules.slack_connectors = ['Choose Slack connections from the list.'];
        if ('per_hour' in patch && !isWhole(patch.per_hour, lane.limits.per_hour)) wrong.per_hour = [`Choose a whole number from 0 to ${lane.limits.per_hour}.`];
        if ('per_day' in patch && !isWhole(patch.per_day, lane.limits.per_day)) wrong.per_day = [`Choose a whole number from 0 to ${lane.limits.per_day}.`];
        if (!wrong.per_hour && !wrong.per_day) {
          const hour = 'per_hour' in patch ? (patch.per_hour as number) : lane.per_hour;
          const day = 'per_day' in patch ? (patch.per_day as number) : lane.per_day;
          if (hour > day) wrong.per_hour = ["The hourly limit can't be more than the daily limit."];
        }
        if (Object.keys(rules).length > 0) wrong.rules = rules;
        if (Object.keys(wrong).length > 0) errors.fast_lane = wrong;
      }
    }
    const agentErrors: Record<string, unknown> = {};
    if (isObject(body.agents)) {
      for (const [kind, fields] of Object.entries(body.agents)) {
        if (!settings.agents.some((card) => card.kind === kind)) {
          agentErrors[kind] = ['Unknown agent.'];
          continue;
        }
        if (!isObject(fields)) continue;
        const wrong: Record<string, string[]> = {};
        if ('enabled' in fields && typeof fields.enabled !== 'boolean') wrong.enabled = ['Choose on or off.'];
        if ('monthly_credits' in fields) {
          const value = fields.monthly_credits;
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > settings.plan_monthly_credits) {
            wrong.monthly_credits = [`Choose a whole number from 0 to ${settings.plan_monthly_credits}.`];
          }
        }
        if (Object.keys(wrong).length > 0) agentErrors[kind] = wrong;
      }
    }
    if (Object.keys(agentErrors).length > 0) errors.agents = agentErrors;
    const levelErrors: Record<string, Record<string, string[]>> = {};
    if (isObject(body.levels)) {
      for (const [agent, cells] of Object.entries(body.levels)) {
        if (!isObject(cells)) continue;
        for (const [kind, level] of Object.entries(cells)) {
          const spec = settings.kinds.find((k) => k.kind === kind);
          let message: string | null = null;
          if (!spec || !spec.agents.includes(agent as AgentKind)) message = "That agent doesn't use this action.";
          else if (!LEVELS.includes(level as ActionLevel)) message = 'Choose auto, ask or never.';
          else if (RANK[level as ActionLevel] > RANK[spec.max_level]) message = "This action can't be set to auto.";
          if (message) (levelErrors[agent] ??= {})[kind] = [message];
        }
      }
    }
    if (Object.keys(levelErrors).length > 0) errors.levels = levelErrors;
    if (Object.keys(errors).length > 0) return json(400, errors);
    if (typeof body.ai_enabled === 'boolean') settings.ai_enabled = body.ai_enabled;
    if (typeof body.tone === 'string') settings.tone = body.tone as AgentSettings['tone'];
    if (typeof body.signal_interval === 'string') settings.signals.interval = body.signal_interval as AgentSettings['signals']['interval'];
    if (isObject(body.signal_sources)) {
      for (const [key, value] of Object.entries(body.signal_sources)) {
        const row = settings.signals.sources.find((s) => s.key === key);
        if (row && typeof value === 'boolean') row.enabled = value;
      }
    }
    if (isObject(body.fast_lane) && settings.signals.fast_lane) {
      const lane = settings.signals.fast_lane;
      const patch = body.fast_lane;
      if (typeof patch.on === 'boolean') lane.on = patch.on;
      if (typeof patch.per_hour === 'number') lane.per_hour = patch.per_hour;
      if (typeof patch.per_day === 'number') lane.per_day = patch.per_day;
      if (isObject(patch.rules)) {
        const next = patch.rules as Partial<FastLaneRules>;
        if (typeof next.jira_priority === 'boolean') lane.rules.jira_priority = next.jira_priority;
        if (typeof next.poor_health === 'boolean') lane.rules.poor_health = next.poor_health;
        if (Array.isArray(next.words)) lane.rules.words = tidy(next.words);
        if (Array.isArray(next.senders)) lane.rules.senders = tidy(next.senders);
        if (Array.isArray(next.slack_connectors)) lane.rules.slack_connectors = [...next.slack_connectors];
      }
    }
    if (isObject(body.agents)) {
      for (const [kind, fields] of Object.entries(body.agents)) {
        const card = settings.agents.find((c) => c.kind === kind);
        if (!card || !isObject(fields)) continue;
        if (typeof fields.enabled === 'boolean') card.enabled = fields.enabled;
        if (typeof fields.monthly_credits === 'number') card.monthly_credits = fields.monthly_credits;
      }
    }
    if (isObject(body.levels)) {
      for (const [agent, cells] of Object.entries(body.levels)) {
        if (!isObject(cells)) continue;
        for (const [kind, level] of Object.entries(cells)) settings.levels[agent as AgentKind][kind as ActionKind] = level as ActionLevel;
      }
    }
    return json(200, settings);
  }

  function run(kind: string) {
    const card = settings.agents.find((c) => c.kind === kind);
    if (!card) return json(404, { detail: 'Not found.' });
    if (!settings.can_run) return json(403, { detail: 'Only admins and people who can see every account can run an agent.' });
    if (refuseRun) {
      const answer = refuseRun;
      refuseRun = null;
      return json(answer.status, answer.body);
    }
    if (!settings.ai_enabled) return json(409, { code: 'AI_OFF', detail: 'AI is switched off for this workspace.' });
    if (!card.enabled) return json(409, { code: 'AGENT_OFF', detail: 'This agent is switched off.' });
    // The 429 ("The workspace has no credits left.") is reachable through refuseNextRun.
    if (Object.values(settings.levels[card.kind] ?? {}).every((level) => level === 'never')) {
      return json(409, { code: 'NO_ACTIONS', detail: 'Every action is set to never for this agent.' });
    }
    if (card.spent_this_month >= card.monthly_credits) {
      return json(409, { code: 'BUDGET_USED', detail: "This agent's budget is used up: it resumes on 1 Nov.", resets_on: card.resets_on });
    }
    card.spent_this_month += 1;
    card.last_run = { at: '2026-10-08T09:20:00Z', proposed: 3, applied: 1, dropped: 0, skipped_reason: null };
    return json(200, card);
  }

  function activity(url: URL) {
    if (failActivity > 0) {
      failActivity -= 1;
      return json(500, DOWN);
    }
    const agent = url.searchParams.get('agent');
    const kind = url.searchParams.get('kind');
    const status = url.searchParams.get('status');
    const page = Number(url.searchParams.get('page') ?? '1');
    const customer = url.searchParams.get('customer');
    const account = url.searchParams.get('account');
    if (agent && !['cs', 'sales', 'ops'].includes(agent)) return json(400, { agent: ['Choose cs, sales or ops.'] });
    if (kind && !settings.kinds.some((k) => k.kind === kind)) return json(400, { kind: ['Choose a valid action kind.'] });
    if (status && !['proposed', 'applied', 'rejected', 'expired', 'undone'].includes(status)) return json(400, { status: ['Choose a valid status.'] });
    const rows = [...actions.values()]
      .map((s) => s.action)
      .filter((a) => (!agent || a.agent === agent) && (!kind || a.kind === kind) && (!status || a.status === status) &&
          (!customer || (a.record?.kind === 'customer' && a.record.id === Number(customer))) &&
          (!account || (a.record?.kind === 'account' && a.record.id === Number(account))))
      .sort((x, y) => y.id - x.id);
    const size = 50;
    if (page > 1 && (page - 1) * size >= rows.length) return json(404, { detail: 'Invalid page.' });
    const results = rows.slice((page - 1) * size, page * size);
    const query = (n: number) => {
      const next = new URLSearchParams(url.searchParams);
      next.set('page', String(n));
      return `http://localhost/api/v1/agents/actions/?${next.toString()}`;
    };
    return json(200, {
      count: rows.length,
      next: page * size < rows.length ? query(page + 1) : null,
      previous: page > 1 ? query(page - 1) : null,
      results,
      hidden: stub.hidden ?? 0,
    });
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === '/agents/settings/' && method === 'GET') {
      if (failSettings > 0) {
        failSettings -= 1;
        return json(500, DOWN);
      }
      return json(200, settings);
    }
    if (path === '/agents/settings/' && method === 'PATCH') return saveSettings(body);
    if (path === '/agents/actions/' && method === 'GET') return activity(url);
    const one = /^\/agents\/actions\/(\d+)\/$/.exec(path);
    if (one && method === 'GET') {
      const state = actions.get(Number(one[1]));
      return state ? json(200, state.action) : json(404, { code: 'NO_SUCH_ACTION', detail: 'No such action.' });
    }
    const verb = /^\/agents\/actions\/(\d+)\/(approve|reject|undo)\/$/.exec(path);
    if (verb && method === 'POST') return decide(Number(verb[1]), verb[2] as 'approve' | 'reject' | 'undo', body);
    const running = /^\/agents\/([a-z]+)\/run\/$/.exec(path);
    if (running && method === 'POST') return run(running[1]);
    if (stub.passThrough) return stub.passThrough(input, init);
    return json(404, { detail: 'Not found.' });
  });
  vi.stubGlobal('fetch', spy);
  /** Called with an action's id when it is applied or rejected (a Work stub can drop its recommendation). */
  const onSettle = (fn: (id: number) => void) => {
    settle.push(fn);
  };
  return { spy, actions, settings, onSettle };
}

/** Every `method` request whose path contains `part`, as `/path?query` without /api/v1. */
export function calls(spy: ReturnType<typeof vi.fn>, method: string, part: string): string[] {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), method: (init as RequestInit | undefined)?.method ?? 'GET' }))
    .filter((call) => call.method === method && call.url.pathname.includes(part))
    .map((call) => `${call.url.pathname.replace(/^\/api\/v1/, '')}${call.url.search}`);
}

/** The JSON bodies of every `method` request whose path contains `part`; `{}` for a POST with no body. */
export function sent(spy: ReturnType<typeof vi.fn>, method: string, part: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && new URL(String(input)).pathname.includes(part))
    .map(([, init]) => {
      const raw = (init as RequestInit).body;
      return raw ? JSON.parse(String(raw)) : {};
    });
}
