import { useId, useState } from 'react';
import { NO_REFUSAL, patchWorkSettings, readRefusal, type Refusal } from '../../features/work/workApi';
import { HOURS, TRACK, hourLabel, hourNote } from '../../features/work/workTracking';
import type { WorkSettings, WorkSettingsPatch } from '../../features/work/workTypes';
import { FORM_ALERT, Select, SettingsRow, SettingsSection, Switch, useInstantSave } from '../ui';

/** Settings › Work › Notifications for an admin (delivery 3 Decisions 4,
 *  5; settings production spec §6): the daily digest and the hour it goes
 *  out after, each saved the moment it changes, with an Undo. */
export function WorkNotificationsForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const instant = useInstantSave();
  const failed = refusal.field;

  const change = (key: 'digest_enabled' | 'digest_hour', patch: WorkSettingsPatch, back: WorkSettingsPatch) => {
    setRefusal(NO_REFUSAL);
    void instant.run({
      key,
      request: () => patchWorkSettings(patch),
      onSaved,
      undo: () => patchWorkSettings(back),
      onUndone: onSaved,
      onError: (error) => setRefusal(readRefusal(error, TRACK.SAVE_FAILED)),
    });
  };

  const hourId = `${ids}-hour`;
  return (
    <div className="flex flex-col gap-3">
      <SettingsSection title={TRACK.DIGEST_SECTION}>
        <SettingsRow label={TRACK.DIGEST} hint={TRACK.DIGEST_DETAIL} hintId={`${ids}-digest-detail`} error={failed.digest_enabled || undefined} errorId={`${ids}-digest-error`}>
          <Switch
            checked={settings.digest_enabled}
            label={TRACK.DIGEST}
            busy={instant.busyKey === 'digest_enabled'}
            describedBy={failed.digest_enabled ? `${ids}-digest-detail ${ids}-digest-error` : `${ids}-digest-detail`}
            onChange={(next) => change('digest_enabled', { digest_enabled: next }, { digest_enabled: settings.digest_enabled })}
          />
        </SettingsRow>
        <SettingsRow label={TRACK.DIGEST_HOUR} htmlFor={hourId} hint={hourNote(settings.timezone)} hintId={`${hourId}-detail`} error={failed.digest_hour || undefined} errorId={`${hourId}-error`}>
          <Select
            id={hourId}
            label={TRACK.DIGEST_HOUR}
            labelPosition="external"
            value={String(settings.digest_hour)}
            invalid={Boolean(failed.digest_hour)}
            describedBy={failed.digest_hour ? `${hourId}-detail ${hourId}-error` : `${hourId}-detail`}
            onChange={(value) => change('digest_hour', { digest_hour: Number(value) }, { digest_hour: settings.digest_hour })}
            options={HOURS.map((hour) => ({ value: String(hour), label: hourLabel(hour) }))}
            className="sm:w-28"
          />
        </SettingsRow>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
    </div>
  );
}
