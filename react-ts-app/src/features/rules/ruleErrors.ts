// A refusal, put where its key points (spec §2.2, "Save"; backend: "400 at
// the fields named", the actions as a list aligned with them). A `detail`
// goes to the form, except the segment-ownership 403, which belongs at the
// segment (contract gap 7).
import { ApiError } from '../../lib/apiClient';
import { SAY } from './ruleOptions';

export const RULE_FIELDS = [
  'name', 'segment', 'trigger', 'score', 'direction', 'threshold', 'cadence', 'weekday',
  'actions', 'cooldown_days', 'is_active', 'sharing', 'shared_with',
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];
/** One action's errors by its own keys (`title`, `stage`, `roles`, …). */
export type ActionErrors = Record<string, string>;
export interface RuleErrors {
  form?: string;
  field: Partial<Record<RuleField, string>>;
  action: ActionErrors[];
}

export const NO_ERRORS: RuleErrors = { field: {}, action: [] };
const GONE = 'This rule or its segment is no longer there.';

export function hasErrors(errors: RuleErrors): boolean {
  return Boolean(errors.form) || Object.keys(errors.field).length > 0 || errors.action.some((one) => Object.keys(one).length > 0);
}

const first = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

export function ruleErrors(err: unknown, fallback = 'Could not save this rule. Try again.'): RuleErrors {
  if (!(err instanceof ApiError)) return { form: fallback, field: {}, action: [] };
  if (err.status === 404) return { form: GONE, field: {}, action: [] };
  const out: RuleErrors = { field: {}, action: [] };
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === 'detail' && typeof value === 'string') {
        if (value === SAY.NOT_SEGMENT_OWNER) out.field.segment = value;
        else out.form = value;
        continue;
      }
      if (key === 'actions' && Array.isArray(value) && value.some((item) => item !== null && typeof item === 'object')) {
        out.action = value.map((item) =>
          Object.fromEntries(
            Object.entries((item ?? {}) as Record<string, unknown>).flatMap(([name, messages]) => {
              const message = first(messages);
              return message ? [[name, message]] : [];
            }),
          ),
        );
        continue;
      }
      const message = first(value);
      if (!message) continue;
      if ((RULE_FIELDS as readonly string[]).includes(key)) out.field[key as RuleField] = message;
      else out.form ??= message;
    }
  }
  return hasErrors(out) ? out : { form: fallback, field: {}, action: [] };
}

/** One line, for a place that has no fields (the on/off switch). */
export function firstError(errors: RuleErrors): string {
  return errors.form ?? Object.values(errors.field)[0] ?? errors.action.flatMap((one) => Object.values(one))[0] ?? 'Something went wrong.';
}
