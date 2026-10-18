import { useId, useMemo, useState } from 'react';
import { NO_REFUSAL, patchWorkSettings, readRefusal, type Refusal } from '../../features/work/workApi';
import { TRACK, WEEKDAYS, tasksDraftOf, tasksPatchOf, timezoneOptions, validateTasks, type TasksDraft } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { DayChips, FORM_ALERT, INPUT, INVALID, NUM, Select, SettingsRow, SettingsSection, useInstantSave, useSettingsDraft, useSettingsDraftSave } from '../ui';
import { useSubmitOnce } from '../plans/useSubmitOnce';

const FIELD = `${INPUT} ${INVALID} ${NUM} sm:w-28`;

/** Settings › Work › Tasks for an admin (delivery 3 Decisions 2, 3, 5;
 *  settings production spec §6): the timezone saves at once, with an Undo;
 *  the escalate threshold and the working days go through the page's save
 *  bar, which sends only what changed after the browser's own checks. */
export function WorkTasksForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [draft, setDraft] = useState<TasksDraft>(() => tasksDraftOf(settings));
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const saving = useSubmitOnce();
  const instant = useInstantSave();
  const zones = useMemo(() => timezoneOptions(settings.timezone), [settings.timezone]);
  // The timezone saves on its own; the bar holds only the threshold and the days.
  const pending = tasksPatchOf(settings, { ...draft, timezone: settings.timezone });
  const dirty = Object.keys(pending).length > 0;
  const failed = refusal.field;
  // Any edit retires the old refusal for that field.
  const edit = (field: keyof Refusal['field'], change: (current: TasksDraft) => TasksDraft) => {
    setRefusal((current) => {
      if (!current.field[field]) return current;
      const rest = { ...current.field };
      delete rest[field];
      return { ...current, field: rest };
    });
    setDraft(change);
  };

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const local = validateTasks(draft);
    if (Object.keys(local.field).length > 0) {
      setRefusal(local);
      return false;
    }
    setRefusal(NO_REFUSAL);
    const outcome = await saving.run(() => patchWorkSettings(pending));
    if (!outcome) return false;
    if (!outcome.ok) {
      setRefusal(readRefusal(outcome.error, TRACK.SAVE_FAILED));
      return false;
    }
    setDraft(tasksDraftOf(outcome.value));
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
      setDraft(tasksDraftOf(settings));
      setRefusal(NO_REFUSAL);
    },
  });

  const changeZone = (timezone: string) => {
    const previous = settings.timezone;
    if (timezone === previous) return;
    edit('timezone', (current) => current);
    const synced = (next: WorkSettings) => {
      onSaved(next);
      setDraft((current) => ({ ...current, timezone: next.timezone }));
    };
    void instant.run({
      key: 'timezone',
      request: () => patchWorkSettings({ timezone }),
      onSaved: synced,
      undo: () => patchWorkSettings({ timezone: previous }),
      onUndone: synced,
      onError: (error) => setRefusal(readRefusal(error, TRACK.SAVE_FAILED)),
    });
  };

  const escalateId = `${ids}-escalate`;
  const zoneId = `${ids}-zone`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void saveAll();
      }}
      noValidate
      aria-label={TRACK.TASKS_TITLE}
      className="flex flex-col gap-3"
    >
      <SettingsSection title={TRACK.REMINDERS}>
        <SettingsRow
          label={TRACK.ESCALATE}
          htmlFor={escalateId}
          hint={TRACK.ESCALATE_DETAIL}
          hintId={`${escalateId}-detail`}
          error={failed.escalate_after_days || undefined}
          errorId={`${escalateId}-error`}
        >
          <input
            id={escalateId}
            inputMode="numeric"
            value={draft.escalate}
            aria-invalid={Boolean(failed.escalate_after_days)}
            aria-describedby={failed.escalate_after_days ? `${escalateId}-detail ${escalateId}-error` : `${escalateId}-detail`}
            onChange={(event) => edit('escalate_after_days', (current) => ({ ...current, escalate: event.target.value }))}
            className={FIELD}
          />
        </SettingsRow>
        <SettingsRow label={TRACK.TIMEZONE} htmlFor={zoneId} hint={TRACK.TIMEZONE_DETAIL} hintId={`${zoneId}-detail`} error={failed.timezone || undefined} errorId={`${zoneId}-error`}>
          <Select
            id={zoneId}
            label={TRACK.TIMEZONE}
            labelPosition="external"
            value={settings.timezone}
            invalid={Boolean(failed.timezone)}
            describedBy={failed.timezone ? `${zoneId}-detail ${zoneId}-error` : `${zoneId}-detail`}
            onChange={changeZone}
            options={zones.map((zone) => ({ value: zone, label: zone }))}
            className="sm:w-72"
          />
        </SettingsRow>
        <SettingsRow label={TRACK.WORKING_DAYS} hint={TRACK.WORKING_DAYS_DETAIL} hintId={`${ids}-days-detail`} error={failed.working_days || undefined} errorId={`${ids}-days-error`}>
          <DayChips
            label={TRACK.WORKING_DAYS}
            days={WEEKDAYS}
            value={draft.working_days}
            describedBy={`${ids}-days-detail`}
            onChange={(next) => edit('working_days', (current) => ({ ...current, working_days: next }))}
          />
        </SettingsRow>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
