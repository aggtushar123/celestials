// Settings › Work › Recommendations (spec §2.4; Decisions 10 to 12): each
// source's fields and limits, the draft the form edits, checking it in the
// contract's own words, the PATCH it sends (only what changed), the
// server's refusals read back onto the form, and Run now's summary. Kept
// free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import type { RecKind, RecommendTo, RefreshResult, SourceField, SourceSettings, WorkSettings, WorkSettingsPatch } from './workTypes';

export const SET = {
  TITLE: 'Recommendations',
  INTRO: 'Revenact reads the workspace once a day and recommends a task wherever one of these signals triggers.',
  LOAD: 'Could not load these settings.',
  LOADING: 'Loading these settings',
  READ_ONLY: 'Only admins can change these.',
  RECEIVES: 'Who receives them',
  SIGNALS: 'Signals',
  DISMISSALS: 'Dismissals',
  COOLDOWN: 'After a dismissal (days)',
  COOLDOWN_DETAIL: "A dismissed signal isn't recommended again for this long unless it gets worse. 0 means straight away.",
  ON: 'On',
  OFF: 'Off',
  SAVE_FAILED: 'Could not save these settings.',
  RUN: 'Run now',
  RUNNING: 'Running…',
  RUN_HINT: 'Runs with the saved settings.',
  RUN_FAILED: 'Could not run the recommender.',
} as const;

export const RECEIVE_OPTIONS: { value: RecommendTo; label: string; detail: string }[] = [
  {
    value: 'manager',
    label: "The suggested person's manager",
    detail: 'When they have an active manager who can open the record; otherwise the person themselves.',
  },
  { value: 'owner', label: 'The suggested person', detail: 'Straight to the person Revenact suggests.' },
];

export interface FieldSpec {
  field: SourceField;
  label: string;
  min: number;
  max: number;
  /** A whole number; otherwise at most one decimal place (the contract's `drop`). */
  whole: boolean;
}

export interface SourceSpec {
  kind: RecKind;
  label: string;
  detail: string;
  fields: FieldSpec[];
}

const days = (label: string): FieldSpec => ({ field: 'days', label, min: 1, max: 120, whole: true });

/** The contract's sources, in its order, with its limits. */
export const SOURCE_SPECS: readonly SourceSpec[] = [
  { kind: 'renewal_due', label: 'Renewal due', detail: 'A renewal within this many days, or overdue.', fields: [days('Within (days)')] },
  {
    kind: 'health_drop',
    label: 'Health drop',
    detail: 'Health now at least this much below the reading from this many days ago.',
    fields: [
      { field: 'drop', label: 'Drop of at least', min: 0.1, max: 5, whole: false },
      { field: 'window_days', label: 'Compared with (days ago)', min: 1, max: 120, whole: true },
    ],
  },
  {
    kind: 'urgent_tickets',
    label: 'Urgent tickets',
    detail: 'At least this many open critical or high tickets.',
    fields: [{ field: 'min', label: 'At least (tickets)', min: 1, max: 50, whole: true }],
  },
  { kind: 'anomaly', label: 'Anomalies', detail: 'A live anomaly that names the record.', fields: [] },
];

export const COOLDOWN_SPEC = { min: 0, max: 120, whole: true } as const;

export function sourceLabel(kind: string): string {
  return SOURCE_SPECS.find((spec) => spec.kind === kind)?.label ?? kind;
}

export function rangeMessage(spec: { min: number; max: number; whole: boolean }): string {
  return spec.whole ? `Choose a whole number from ${spec.min} to ${spec.max}.` : `Choose a number from ${spec.min} to ${spec.max}.`;
}

/** The number typed, inside the limits, or null: a whole number, or with
 *  at most one decimal place where the field is not whole (`drop`). */
function parse(text: string, spec: { min: number; max: number; whole: boolean }): number | null {
  const trimmed = text.trim();
  if (!(spec.whole ? /^\d+$/ : /^\d+(\.\d)?$/).test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= spec.min && value <= spec.max ? value : null;
}

export interface SourceDraft {
  enabled: boolean;
  values: Partial<Record<SourceField, string>>;
}

export interface SettingsDraft {
  recommend_to: RecommendTo;
  cooldown: string;
  sources: Record<RecKind, SourceDraft>;
}

export function draftOf(settings: WorkSettings): SettingsDraft {
  const sources = {} as Record<RecKind, SourceDraft>;
  for (const spec of SOURCE_SPECS) {
    const saved: SourceSettings | undefined = settings.sources[spec.kind];
    const values: Partial<Record<SourceField, string>> = {};
    for (const field of spec.fields) {
      const value = saved?.[field.field];
      values[field.field] = value === undefined ? '' : String(value);
    }
    sources[spec.kind] = { enabled: saved?.enabled === true, values };
  }
  return { recommend_to: settings.recommend_to, cooldown: String(settings.dismiss_cooldown_days), sources };
}

export type SourceErrors = Partial<Record<SourceField | 'enabled' | 'source', string>>;

export interface SettingsErrors {
  recommend_to?: string;
  dismiss_cooldown_days?: string;
  sources: Partial<Record<RecKind, SourceErrors>>;
  form: string | null;
}

export const NO_SETTINGS_ERRORS: SettingsErrors = { sources: {}, form: null };

export function validateDraft(draft: SettingsDraft): SettingsErrors {
  const errors: SettingsErrors = { sources: {}, form: null };
  if (parse(draft.cooldown, COOLDOWN_SPEC) === null) errors.dismiss_cooldown_days = rangeMessage(COOLDOWN_SPEC);
  for (const spec of SOURCE_SPECS) {
    const fields: SourceErrors = {};
    for (const field of spec.fields) {
      if (parse(draft.sources[spec.kind].values[field.field] ?? '', field) === null) fields[field.field] = rangeMessage(field);
    }
    if (Object.keys(fields).length > 0) errors.sources[spec.kind] = fields;
  }
  return errors;
}

export function hasErrors(errors: SettingsErrors): boolean {
  return Boolean(errors.recommend_to || errors.dismiss_cooldown_days || errors.form || Object.keys(errors.sources).length > 0);
}

/** Only what changed (Decision 11): a no-op PATCH (an untouched draft)
 *  writes and audits nothing server-side, so sending only the changed
 *  fields is exactly right, not just an optimisation. Run it on a draft
 *  that passed `validateDraft`; on any other it still answers, for the
 *  dirty check. */
export function patchOf(saved: WorkSettings, draft: SettingsDraft): WorkSettingsPatch {
  const patch: WorkSettingsPatch = {};
  if (draft.recommend_to !== saved.recommend_to) patch.recommend_to = draft.recommend_to;
  const cooldown = Number(draft.cooldown.trim());
  if (cooldown !== saved.dismiss_cooldown_days) patch.dismiss_cooldown_days = cooldown;
  const sources: NonNullable<WorkSettingsPatch['sources']> = {};
  for (const spec of SOURCE_SPECS) {
    const was: SourceSettings | undefined = saved.sources[spec.kind];
    const now = draft.sources[spec.kind];
    const change: Partial<SourceSettings> = {};
    if (now.enabled !== (was?.enabled === true)) change.enabled = now.enabled;
    for (const field of spec.fields) {
      const value = Number((now.values[field.field] ?? '').trim());
      if (value !== was?.[field.field]) change[field.field] = value;
    }
    if (Object.keys(change).length > 0) sources[spec.kind] = change;
  }
  if (Object.keys(sources).length > 0) patch.sources = sources;
  return patch;
}

export const isEmptyPatch = (patch: WorkSettingsPatch): boolean => Object.keys(patch).length === 0;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const first = (value: unknown): string | undefined => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined);
const isKind = (kind: string): kind is RecKind => SOURCE_SPECS.some((spec) => spec.kind === kind);
const SOURCE_FIELDS: readonly string[] = ['days', 'drop', 'window_days', 'min', 'enabled'];

/** A PATCH refusal, read onto the form: each field's first sentence under
 *  that field (`sources.<kind>.<field>` under its input, a source's own
 *  under its row), anything else (`sources` as a list, `non_field_errors`,
 *  a 403's `detail`) on the form; offline or a bare 500 is `fallback`. */
export function readSettingsRefusal(err: unknown, fallback: string): SettingsErrors {
  if (!(err instanceof ApiError) || !isObject(err.body)) return { sources: {}, form: fallback };
  const body = err.body;
  const out: SettingsErrors = { sources: {}, form: null };
  const recommendTo = first(body.recommend_to);
  if (recommendTo) out.recommend_to = recommendTo;
  const cooldown = first(body.dismiss_cooldown_days);
  if (cooldown) out.dismiss_cooldown_days = cooldown;
  if (Array.isArray(body.sources)) out.form = first(body.sources) ?? null;
  else if (isObject(body.sources)) {
    for (const [kind, value] of Object.entries(body.sources)) {
      if (!isKind(kind)) continue;
      const own = first(value);
      if (own) {
        out.sources[kind] = { source: own };
        continue;
      }
      if (!isObject(value)) continue;
      const fields: SourceErrors = {};
      for (const [field, messages] of Object.entries(value)) {
        const message = first(messages);
        if (!message) continue;
        if (SOURCE_FIELDS.includes(field)) fields[field as SourceField | 'enabled'] = message;
        else fields.source = message;
      }
      if (Object.keys(fields).length > 0) out.sources[kind] = fields;
    }
  }
  if (hasErrors(out)) return out;
  const general = first(body.non_field_errors);
  return { sources: {}, form: general ?? (typeof body.detail === 'string' ? body.detail : fallback) };
}

export interface RunSummary {
  text: string;
  failed: string | null;
}

/** The one entry of `RefreshResult.failed` that is not a source kind: the
 *  notice to recipients failed, not a signal (the recommendations still
 *  stand per the contract's own words). */
const NOTICE_FAILED = 'recommendations_waiting';

/** Run now's result in words (Decision 12). `failed` can mix source kinds
 *  with `"recommendations_waiting"` (the notice failed, not a source),
 *  worded as its own sentence, never listed as if it were a source. */
export function refreshSummary(result: RefreshResult): RunSummary {
  let text = `Run finished: ${result.created} new, ${result.updated} updated, ${result.expired} expired.`;
  if (result.unrouted > 0) text += ` ${result.unrouted} couldn't be sent to anyone who can open the record.`;
  text += result.notified === 1 ? ' 1 person told.' : ` ${result.notified} people told.`;

  const sourceFailures = result.failed.filter((kind) => kind !== NOTICE_FAILED);
  const noticeFailed = result.failed.includes(NOTICE_FAILED);
  const parts: string[] = [];
  if (sourceFailures.length > 0) parts.push(`These sources failed this run: ${sourceFailures.map(sourceLabel).join(', ')}.`);
  if (noticeFailed) parts.push('Telling people about them failed this run. The recommendations stand.');
  const failed = parts.length > 0 ? parts.join(' ') : null;

  return { text, failed };
}
