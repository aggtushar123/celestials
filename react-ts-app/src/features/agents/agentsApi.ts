// Thin apiFetch wrappers over /api/v1/agents/ (delivery 1 contract). No em dash.
import { ApiError, apiFetch } from '../../lib/apiClient';
import type { ActionKind, AgentAction, AgentCard, AgentKind, AgentSettings, AgentSettingsPatch, ApproveBody, SignalSource } from './agentTypes';

export const fetchAgentSettings = () => apiFetch<AgentSettings>('/agents/settings/');
export const patchAgentSettings = (patch: AgentSettingsPatch) => apiFetch<AgentSettings>('/agents/settings/', { method: 'PATCH', body: patch });
/** A real, paid model call: only ever from a click. */
export const runAgent = (kind: AgentKind) => apiFetch<AgentCard>(`/agents/${kind}/run/`, { method: 'POST' });

/** One action, for the bell's `?action=<id>` link; 404 when gone or on a record the reader can't open. */
export const fetchAction = (id: number) => apiFetch<AgentAction>(`/agents/actions/${id}/`);
export const approveAction = (id: number, body: ApproveBody = {}) =>
  apiFetch<{ action: AgentAction }>(`/agents/actions/${id}/approve/`, { method: 'POST', body });
export const rejectAction = (id: number, note: string) => apiFetch<{ action: AgentAction }>(`/agents/actions/${id}/reject/`, { method: 'POST', body: note.trim() ? { note } : {} });
export const undoAction = (id: number) => apiFetch<{ action: AgentAction }>(`/agents/actions/${id}/undo/`, { method: 'POST' });

/** A settings refusal read for the form: top-level fields, each agent's
 *  fields, each agent's levels, or a line for the form. */
export interface AgentRefusal {
  top: Partial<Record<'ai_enabled' | 'tone', string>>;
  agents: Partial<Record<string, Partial<Record<'enabled' | 'monthly_credits', string>> | string>>;
  levels: Partial<Record<string, Partial<Record<ActionKind, string>>>>;
  form: string | null;
}

export const NO_AGENT_REFUSAL: AgentRefusal = { top: {}, agents: {}, levels: {}, form: null };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const first = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

export function readAgentRefusal(err: unknown, fallback: string): AgentRefusal {
  if (!(err instanceof ApiError) || !isObject(err.body)) return { ...NO_AGENT_REFUSAL, form: fallback };
  const body = err.body;
  const out: AgentRefusal = { top: {}, agents: {}, levels: {}, form: null };
  for (const key of ['ai_enabled', 'tone'] as const) {
    const message = first(body[key]);
    if (message) out.top[key] = message;
  }
  let unrecognised = false;
  if (isObject(body.agents)) {
    for (const [agent, value] of Object.entries(body.agents)) {
      const whole = first(value);
      if (whole) {
        out.agents[agent] = whole;
        continue;
      }
      if (!isObject(value)) continue;
      const fields: Partial<Record<'enabled' | 'monthly_credits', string>> = {};
      for (const field of ['enabled', 'monthly_credits'] as const) {
        const message = first(value[field]);
        if (message) fields[field] = message;
      }
      if (Object.keys(fields).length === 0) {
        unrecognised = true;
        continue;
      }
      out.agents[agent] = fields;
    }
  }
  if (isObject(body.levels)) {
    for (const [agent, value] of Object.entries(body.levels)) {
      if (!isObject(value)) continue;
      const cells: Partial<Record<ActionKind, string>> = {};
      for (const [kind, messages] of Object.entries(value)) {
        const message = first(messages);
        if (message) cells[kind as ActionKind] = message;
      }
      out.levels[agent] = cells;
    }
  }
  const named = Object.keys(out.top).length + Object.keys(out.agents).length + Object.keys(out.levels).length;
  if (named > 0 && !unrecognised) return out;
  const general = first(body.non_field_errors);
  if (general) return { ...out, form: general };
  if (typeof body.detail === 'string') return { ...out, form: body.detail };
  return { ...out, form: fallback };
}

/** The `code` of a refusal (BUDGET_USED, CHANGED_SINCE, ...), or null. */
export function refusalCode(err: unknown): string | null {
  if (!(err instanceof ApiError) || !isObject(err.body)) return null;
  return typeof err.body.code === 'string' ? err.body.code : null;
}

/** The server's own sentence, or null. */
export function refusalDetail(err: unknown): string | null {
  if (!(err instanceof ApiError) || !isObject(err.body)) return null;
  return typeof err.body.detail === 'string' && err.body.detail ? err.body.detail : null;
}

/** A refusal's whole body when it is an object (CHANGED_SINCE's `current`, `applied`). */
export function refusalBody(err: unknown): Record<string, unknown> | null {
  return err instanceof ApiError && isObject(err.body) ? err.body : null;
}

/** A signals refusal (contract §4.8), read for the Reading messages section. */
export function readSignalRefusal(err: unknown, fallback: string): { interval: string | null; sources: Partial<Record<SignalSource, string>>; form: string | null } {
  const out = { interval: null as string | null, sources: {} as Partial<Record<SignalSource, string>>, form: null as string | null };
  if (!(err instanceof ApiError) || !isObject(err.body)) return { ...out, form: fallback };
  out.interval = first(err.body.signal_interval);
  const whole = first(err.body.signal_sources);
  if (whole) return { ...out, form: whole };
  if (isObject(err.body.signal_sources)) {
    for (const [key, value] of Object.entries(err.body.signal_sources)) {
      const message = first(value);
      if (message) out.sources[key as SignalSource] = message;
    }
  }
  if (out.interval || Object.keys(out.sources).length > 0) return out;
  return { ...out, form: typeof err.body.detail === 'string' ? err.body.detail : fallback };
}

const FAST_LANE_TOP = ['on', 'per_hour', 'per_day'] as const;
const FAST_LANE_RULES = ['words', 'senders', 'slack_connectors', 'jira_priority', 'poor_health'] as const;
export type FastLaneField = (typeof FAST_LANE_TOP)[number] | (typeof FAST_LANE_RULES)[number];
export type FastLaneRefusal = Record<FastLaneField | 'form', string | null>;
export const NO_FAST_LANE_REFUSAL: FastLaneRefusal = { on: null, words: null, senders: null, slack_connectors: null, jira_priority: null, poor_health: null, per_hour: null, per_day: null, form: null };

/** The first sentence under a key the section has no row for ("Unknown setting."). */
const firstOther = (body: Record<string, unknown>, known: readonly string[]): string | null =>
  Object.entries(body)
    .filter(([key]) => !known.includes(key))
    .map(([, value]) => first(value))
    .find(Boolean) ?? null;

/** A fast lane refusal (round 2 D3 contract §5.2), read for the Fast lane
 *  section: each field's sentence (the rule keys come nested under `rules`),
 *  or a line for the form. */
export function readFastLaneRefusal(err: unknown, fallback: string): FastLaneRefusal {
  const out: FastLaneRefusal = { ...NO_FAST_LANE_REFUSAL };
  if (!(err instanceof ApiError) || !isObject(err.body)) return { ...out, form: fallback };
  const lane = err.body.fast_lane;
  const whole = first(lane);
  if (whole) return { ...out, form: whole };
  let other: string | null = null;
  if (isObject(lane)) {
    const rules = isObject(lane.rules) ? lane.rules : {};
    for (const key of FAST_LANE_TOP) out[key] = first(lane[key]);
    for (const key of FAST_LANE_RULES) out[key] = first(rules[key]);
    other = firstOther(lane, [...FAST_LANE_TOP, 'rules']) ?? firstOther(rules, FAST_LANE_RULES);
  }
  if (other) return { ...out, form: other };
  if (Object.values(out).some(Boolean)) return out;
  return { ...out, form: typeof err.body.detail === 'string' ? err.body.detail : fallback };
}
