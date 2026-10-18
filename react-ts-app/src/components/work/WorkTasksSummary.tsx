import { SET } from '../../features/work/workSettings';
import { TRACK, weekdayNames } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { NUM, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../ui';

/** Settings › Work › Tasks for a member (delivery 3 Decision 6): the values as text. */
export function WorkTasksSummary({ settings }: { settings: WorkSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{SET.READ_ONLY}</SettingsNote>
      <SettingsSection title={TRACK.REMINDERS}>
        <div data-setting="escalate">
          <SettingsRow label={TRACK.ESCALATE}>
            <p className={`${TYPE.body} ${NUM}`}>{settings.escalate_after_days}</p>
          </SettingsRow>
        </div>
        <div data-setting="timezone">
          <SettingsRow label={TRACK.TIMEZONE}>
            <p className={TYPE.body}>{settings.timezone}</p>
          </SettingsRow>
        </div>
        <div data-setting="working_days">
          <SettingsRow label={TRACK.WORKING_DAYS}>
            <p className={TYPE.body}>{weekdayNames(settings.working_days)}</p>
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
  );
}
