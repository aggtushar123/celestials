// A refusal, put where its keys point (spec §4 "Refusals"; Contract note
// 11): `detail` and `non_field_errors` on the form; `milestones` as a list
// aligned with the milestones sent, each with its `tasks`; a message for
// the whole list on the `milestones` field. Keys outside `fields` go to the
// form. A client check builds the same shape.
import { ApiError } from '../../lib/apiClient';
import type { PlanOpenBody } from './planTypes';

export interface NestedErrors {
  field: Record<string, string>;
  tasks: Record<string, string>[];
}

export interface PlanErrors {
  form?: string;
  field: Record<string, string>;
  milestones: NestedErrors[];
}

export const NO_ERRORS: PlanErrors = { field: {}, milestones: [] };
const GONE = 'It is no longer there, or you can no longer open it.';

const first = (value: unknown): string | undefined => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const flat = (value: unknown): Record<string, string> =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([key, messages]) => {
          const message = first(messages);
          return message ? [[key, message]] : [];
        }),
      )
    : {};

export function hasErrors(errors: PlanErrors): boolean {
  return (
    Boolean(errors.form) ||
    Object.keys(errors.field).length > 0 ||
    errors.milestones.some((one) => Object.keys(one.field).length > 0 || one.tasks.some((task) => Object.keys(task).length > 0))
  );
}

export function planErrors(err: unknown, fields: readonly string[], fallback: string): PlanErrors {
  if (!(err instanceof ApiError)) return { form: fallback, field: {}, milestones: [] };
  if (err.status === 404) return { form: GONE, field: {}, milestones: [] };
  const out: PlanErrors = { field: {}, milestones: [] };
  const body = err.body;
  if (isObject(body)) {
    for (const [key, value] of Object.entries(body)) {
      if (key === 'detail' && typeof value === 'string') {
        out.form = value;
        continue;
      }
      if (key === 'non_field_errors') {
        out.form ??= first(value);
        continue;
      }
      if (key === 'milestones' && Array.isArray(value) && value.some(isObject)) {
        out.milestones = value.map((item) => {
          const own = isObject(item) ? item : {};
          const { tasks, ...rest } = own;
          return { field: flat(rest), tasks: Array.isArray(tasks) ? tasks.map(flat) : [] };
        });
        continue;
      }
      const message = first(value);
      if (!message) continue;
      if (fields.includes(key)) out.field[key] = message;
      else out.form ??= message;
    }
  }
  return hasErrors(out) ? out : { form: fallback, field: {}, milestones: [] };
}

/** One line, for a place with no fields (a checkbox, a confirm dialog). */
export function firstError(errors: PlanErrors): string {
  return (
    errors.form ??
    Object.values(errors.field)[0] ??
    errors.milestones.flatMap((one) => [...Object.values(one.field), ...one.tasks.flatMap((task) => Object.values(task))])[0] ??
    'Something went wrong.'
  );
}

/** 409 `{code: 'PLAN_OPEN', plan_id, detail}` on POST plans/. */
export function isPlanOpen(err: unknown): err is ApiError & { body: PlanOpenBody } {
  return err instanceof ApiError && err.status === 409 && isObject(err.body) && err.body.code === 'PLAN_OPEN' && typeof err.body.plan_id === 'number';
}
