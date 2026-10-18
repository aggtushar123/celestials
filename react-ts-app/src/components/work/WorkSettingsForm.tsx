import { useId, useState } from 'react';
import type { RecKind, SourceField, WorkSettings, WorkSettingsPatch } from '../../features/work/workTypes';
import { patchWorkSettings, refreshRecommendations } from '../../features/work/workApi';
import {
  NO_SETTINGS_ERRORS,
  RECEIVE_OPTIONS,
  SET,
  SOURCE_SPECS,
  draftOf,
  hasErrors,
  isEmptyPatch,
  patchOf,
  readSettingsRefusal,
  refreshSummary,
  validateDraft,
  type RunSummary,
  type SettingsDraft,
  type SettingsErrors,
} from '../../features/work/workSettings';
import { Figured } from '../brain/Figured';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { BUTTON, CHECKBOX, FIELD_ERROR, FORM_ALERT, INPUT, INVALID, NUM, SettingsRow, SettingsSection, Switch, TYPE, useInstantSave, useSettingsDraft, useSettingsDraftSave } from '../ui';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { recommendationsChanged } from './taskChanges';

// A threshold: a short number field, the danger edge while refused.
const FIELD = `${INPUT} ${INVALID} ${NUM} sm:w-28`;
// A radio and its words fill the row, so the whole row is the target.
const RADIO_ROW = 'flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3';

/** The recommender's settings for an admin (spec §2.4; Decisions 11, 12;
 *  settings production spec §6): who receives them and each source's switch
 *  save at once, with an Undo; the thresholds and the dismiss cooldown go
 *  through the page's save bar (only what changed, refused in place first);
 *  Run now says what it did. */
export function WorkSettingsForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [draft, setDraft] = useState<SettingsDraft>(() => draftOf(settings));
  const [errors, setErrors] = useState<SettingsErrors>(NO_SETTINGS_ERRORS);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const saving = useSubmitOnce();
  const running = useSubmitOnce();
  const instant = useInstantSave();
  // Receiver and switches save on their own; the bar holds thresholds and the cooldown.
  const typed = (d: SettingsDraft): SettingsDraft => ({
    ...d,
    recommend_to: settings.recommend_to,
    sources: Object.fromEntries(
      Object.entries(d.sources).map(([kind, source]) => [kind, { ...source, enabled: settings.sources[kind as RecKind]?.enabled === true }]),
    ) as SettingsDraft['sources'],
  });
  const pending = patchOf(settings, typed(draft));
  const dirty = !isEmptyPatch(pending);

  const setValue = (kind: RecKind, field: SourceField, value: string) =>
    setDraft((current) => ({
      ...current,
      sources: { ...current.sources, [kind]: { ...current.sources[kind], values: { ...current.sources[kind].values, [field]: value } } },
    }));

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const local = validateDraft(typed(draft));
    if (hasErrors(local)) {
      setErrors(local);
      return false;
    }
    setErrors(NO_SETTINGS_ERRORS);
    const outcome = await saving.run(() => patchWorkSettings(pending));
    if (!outcome) return false;
    if (!outcome.ok) {
      setErrors(readSettingsRefusal(outcome.error, SET.SAVE_FAILED));
      return false;
    }
    setDraft(draftOf(outcome.value));
    onSaved(outcome.value);
    return true;
  }

  // Enter in a field saves the way the page bar does (spec §5.4).
  const saveAll = useSettingsDraftSave();
  useSettingsDraft({
    dirty,
    saving: saving.busy,
    save,
    discard: () => {
      setDraft(draftOf(settings));
      setErrors(NO_SETTINGS_ERRORS);
    },
  });

  // An instant change: its own earlier refusal is retired, the saved value is
  // merged into the draft so unsaved typed edits survive, and Undo reverses it.
  const saveNow = (
    key: string,
    patch: WorkSettingsPatch,
    back: WorkSettingsPatch,
    apply: (next: WorkSettings) => (d: SettingsDraft) => SettingsDraft,
  ) => {
    setErrors((current) => {
      if (key === 'recommend_to') return { ...current, recommend_to: undefined };
      const kind = key as RecKind;
      const rest = { ...current.sources[kind] };
      delete rest.enabled;
      delete rest.source;
      const sources = { ...current.sources };
      if (Object.keys(rest).length > 0) sources[kind] = rest;
      else delete sources[kind];
      return { ...current, sources };
    });
    const synced = (next: WorkSettings) => {
      onSaved(next);
      setDraft(apply(next));
    };
    void instant.run({
      key,
      request: () => patchWorkSettings(patch),
      onSaved: synced,
      undo: () => patchWorkSettings(back),
      onUndone: synced,
      onError: (error) =>
        setErrors((current) => {
          const refused = readSettingsRefusal(error, SET.SAVE_FAILED);
          const sources = { ...current.sources };
          for (const [kind, own] of Object.entries(refused.sources)) sources[kind as RecKind] = { ...sources[kind as RecKind], ...own };
          return { ...current, ...refused, sources, form: refused.form ?? current.form };
        }),
    });
  };

  async function runNow() {
    if (running.busy) return;
    setRun(null);
    setRunError(null);
    const outcome = await running.run(() => refreshRecommendations());
    if (!outcome) return;
    if (outcome.ok) {
      setRun(refreshSummary(outcome.value));
      recommendationsChanged();
    } else {
      setRunError(errorMessage(outcome.error, SET.RUN_FAILED));
    }
  }

  const cooldownId = `${ids}-cooldown`;
  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveAll();
        }}
        noValidate
        aria-label={SET.TITLE}
        className="flex flex-col gap-6"
      >
        <SettingsSection title={SET.RECEIVES}>
          <fieldset className="min-w-0 divide-y divide-line-subtle">
            <legend className="sr-only">{SET.RECEIVES}</legend>
            {RECEIVE_OPTIONS.map((option) => {
              const detailId = `${ids}-receives-${option.value}`;
              return (
                <label key={option.value} className={RADIO_ROW}>
                  <input
                    type="radio"
                    name={`${ids}-receives`}
                    value={option.value}
                    checked={settings.recommend_to === option.value}
                    aria-labelledby={`${detailId}-label`}
                    aria-describedby={detailId}
                    onChange={() =>
                      saveNow('recommend_to', { recommend_to: option.value }, { recommend_to: settings.recommend_to }, (next) => (d) => ({ ...d, recommend_to: next.recommend_to }))
                    }
                    className={`mt-0.5 ${CHECKBOX}`}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span id={`${detailId}-label`} className={TYPE.label}>
                      {option.label}
                    </span>
                    <span id={detailId} className={TYPE.meta}>
                      {option.detail}
                    </span>
                  </span>
                </label>
              );
            })}
            {errors.recommend_to ? (
              <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
                {errors.recommend_to}
              </p>
            ) : null}
          </fieldset>
        </SettingsSection>

        <SettingsSection title={SET.SIGNALS} list={SET.SIGNALS}>
          {SOURCE_SPECS.map((spec) => {
            const source = draft.sources[spec.kind];
            const failed = errors.sources[spec.kind] ?? {};
            const detailId = `${ids}-${spec.kind}-detail`;
            const own = failed.enabled ?? failed.source;
            return (
              <li key={spec.kind} data-source={spec.kind} className="flex flex-col gap-2 px-4 py-3">
                {/* The switch row keeps its 44px target; its detail sits right under it. */}
                <div className="flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={TYPE.label}>{spec.label}</span>
                    <Switch
                      checked={settings.sources[spec.kind]?.enabled === true}
                      busy={instant.busyKey === spec.kind}
                      label={spec.label}
                      describedBy={detailId}
                      onChange={(next) =>
                        saveNow(
                          spec.kind,
                          { sources: { [spec.kind]: { enabled: next } } },
                          { sources: { [spec.kind]: { enabled: !next } } },
                          (saved) => (d) => ({
                            ...d,
                            sources: { ...d.sources, [spec.kind]: { ...d.sources[spec.kind], enabled: saved.sources[spec.kind]?.enabled === true } },
                          }),
                        )
                      }
                    />
                  </div>
                  <p id={detailId} className={TYPE.meta}>
                    {spec.detail}
                  </p>
                </div>
                {spec.fields.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {spec.fields.map((field) => {
                      const id = `${ids}-${spec.kind}-${field.field}`;
                      const error = failed[field.field];
                      return (
                        <div key={field.field} className="flex min-w-0 flex-col gap-1">
                          <label htmlFor={id} className={TYPE.label}>
                            {field.label}
                          </label>
                          <input
                            id={id}
                            inputMode={field.whole ? 'numeric' : 'decimal'}
                            value={source.values[field.field] ?? ''}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? `${id}-error` : undefined}
                            onChange={(event) => setValue(spec.kind, field.field, event.target.value)}
                            className={FIELD}
                          />
                          {error ? (
                            <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
                              {error}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {own ? (
                  <p role="alert" className={FORM_ALERT}>
                    {own}
                  </p>
                ) : null}
              </li>
            );
          })}
        </SettingsSection>

        <SettingsSection title={SET.DISMISSALS}>
          <SettingsRow
            label={SET.COOLDOWN}
            htmlFor={cooldownId}
            hint={SET.COOLDOWN_DETAIL}
            hintId={`${cooldownId}-detail`}
            error={errors.dismiss_cooldown_days || undefined}
            errorId={`${cooldownId}-error`}
          >
            <input
              id={cooldownId}
              inputMode="numeric"
              value={draft.cooldown}
              aria-invalid={Boolean(errors.dismiss_cooldown_days)}
              aria-describedby={errors.dismiss_cooldown_days ? `${cooldownId}-detail ${cooldownId}-error` : `${cooldownId}-detail`}
              onChange={(event) => setDraft((current) => ({ ...current, cooldown: event.target.value }))}
              className={FIELD}
            />
          </SettingsRow>
        </SettingsSection>

        {errors.form ? (
          <p role="alert" className={FORM_ALERT}>
            {errors.form}
          </p>
        ) : null}
      </form>

      <SettingsSection title={SET.RUN} description={SET.RUN_HINT}>
        <div className="flex flex-col items-start gap-2 px-4 py-3">
          <button type="button" onClick={() => void runNow()} aria-disabled={running.busy || undefined} className={BUTTON}>
            {running.busy ? SET.RUNNING : SET.RUN}
          </button>
          {/* Always mounted (spec §4.4): the run's answer is announced. */}
          <div role="status" className={`flex flex-col gap-1 ${TYPE.body} empty:sr-only`}>
            {run ? (
              <p>
                <Figured text={run.text} />
              </p>
            ) : null}
            {run?.failed ? <p className="text-[13px] leading-5 text-warning-ink">{run.failed}</p> : null}
          </div>
          {runError ? (
            <p role="alert" className={FORM_ALERT}>
              {runError}
            </p>
          ) : null}
        </div>
      </SettingsSection>
    </div>
  );
}
