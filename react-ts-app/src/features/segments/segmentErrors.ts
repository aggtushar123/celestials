// A segment write's 400, put where its key points (spec §3: messages at the
// field): name, description, kind, rules, sharing and shared_with at their
// own fields; a `detail` (the 50-segment limit, a 403), or else the first
// message of any other key, at the form.
import { ApiError } from '../../lib/apiClient';

const FIELDS = ['name', 'description', 'kind', 'rules', 'sharing', 'shared_with'] as const;

export type FormErrors = Partial<Record<(typeof FIELDS)[number] | 'form', string>>;

export function formErrors(err: unknown, fallback = 'Could not save this segment. Try again.'): FormErrors {
  if (!(err instanceof ApiError)) return { form: fallback };
  const out: FormErrors = {};
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      if ((FIELDS as readonly string[]).includes(key)) out[key as (typeof FIELDS)[number]] = value[0];
      // A key no field owns (non_field_errors, alert_on_changes…) still
      // reaches the reader, at the form.
      else out.form ??= value[0];
    }
    if (typeof record.detail === 'string') out.form = record.detail;
  }
  return Object.keys(out).length > 0 ? out : { form: err.message };
}

/** The preview's refusal: its `rules` text (it checks rules as a save does). */
export function rulesMessage(err: unknown): string {
  const errors = formErrors(err, 'Could not preview this segment.');
  return errors.rules ?? errors.form ?? 'Could not preview this segment.';
}
