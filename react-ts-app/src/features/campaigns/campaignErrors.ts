// A refusal, put where its key points (spec §2.2: "field refusals appear at
// their fields"; "a refusal that belongs to no field takes focus").
import { ApiError } from '../../lib/apiClient';
import { THROTTLED } from '../surveys/surveyErrors';

export const CAMPAIGN_FIELDS = ['name', 'segment', 'roles', 'subject', 'body', 'sharing', 'shared_with', 'status'] as const;
export type CampaignField = (typeof CAMPAIGN_FIELDS)[number];
export type CampaignErrors = Partial<Record<CampaignField | 'form', string>>;

/** A 404: missing and not shared read the same (spec §1.7). */
export const MISSING = "This campaign doesn't exist or isn't shared with you.";
export const SEND_FALLBACK = 'Could not send it. Try again.';

export function hasErrors(errors: CampaignErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function campaignErrors(err: unknown, fallback = 'Could not save this campaign. Try again.'): CampaignErrors {
  if (!(err instanceof ApiError)) return { form: fallback };
  if (err.status === 404) return { form: MISSING };
  const out: CampaignErrors = {};
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === 'detail' && typeof value === 'string') {
        out.form = value;
        continue;
      }
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      if ((CAMPAIGN_FIELDS as readonly string[]).includes(key)) out[key as CampaignField] = value[0];
      else out.form ??= value[0];
    }
  }
  if (!hasErrors(out) && err.status === 429) return { form: THROTTLED };
  return hasErrors(out) ? out : { form: fallback };
}

export type SendRefusal = { at: 'send'; message: string } | { at: 'form'; errors: CampaignErrors };

/** Contract note 8: a field goes back to the form; everything else stays at Send. */
export function sendRefusal(err: unknown): SendRefusal {
  const errors = campaignErrors(err, SEND_FALLBACK);
  const fields = Object.keys(errors).filter((key) => key !== 'form');
  return fields.length > 0 ? { at: 'form', errors } : { at: 'send', message: errors.form ?? SEND_FALLBACK };
}
