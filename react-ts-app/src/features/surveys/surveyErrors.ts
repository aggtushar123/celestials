// A refusal, put where its key points (spec §2.2: "Server errors show at
// their fields"). A `detail` (403, 409, 429) or a key no field owns goes to
// the form.
import { ApiError } from '../../lib/apiClient';

const SURVEY_FIELDS = ['name', 'survey_type', 'subject', 'intro', 'segment', 'roles', 'sharing', 'shared_with'] as const;
const ANSWER_FIELDS = ['score', 'comment'] as const;

export type SurveyField = (typeof SURVEY_FIELDS)[number];
export type SurveyErrors = Partial<Record<SurveyField | 'form', string>>;
export type AnswerErrors = Partial<Record<(typeof ANSWER_FIELDS)[number] | 'form', string>>;

/** Plan Decision 17. */
export const THROTTLED = 'Too many tries from this network. Wait a minute, then try again.';

function fieldErrors<F extends string>(err: unknown, fields: readonly F[], fallback: string): Partial<Record<F | 'form', string>> {
  if (!(err instanceof ApiError)) return { form: fallback } as Partial<Record<F | 'form', string>>;
  const out: Partial<Record<F | 'form', string>> = {};
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      if ((fields as readonly string[]).includes(key)) out[key as F] = value[0];
      else out.form ??= value[0];
    }
    if (typeof record.detail === 'string') out.form = record.detail;
  }
  return Object.keys(out).length > 0 ? out : ({ form: err.message } as Partial<Record<F | 'form', string>>);
}

export function surveyErrors(err: unknown, fallback = 'Could not save this survey. Try again.'): SurveyErrors {
  return fieldErrors(err, SURVEY_FIELDS, fallback);
}

/** The hosted form's refusal. Every 404 is the one expired page (no
 *  oracle: unknown, expired, answered and failed read the same). */
export function answerErrors(err: unknown): AnswerErrors | 'expired' {
  if (err instanceof ApiError && err.status === 404) return 'expired';
  if (err instanceof ApiError && err.status === 429) return { form: THROTTLED };
  if (!(err instanceof ApiError)) return { form: 'Could not send your answer. Check your connection and try again.' };
  return fieldErrors(err, ANSWER_FIELDS, 'Could not send your answer. Try again.');
}
