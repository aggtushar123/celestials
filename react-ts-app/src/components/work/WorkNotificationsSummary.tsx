import { SET } from '../../features/work/workSettings';
import { TRACK, hourLabel } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { NUM, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../ui';

/** Settings › Work › Notifications for a member (delivery 3 Decision 6): the values as text. */
export function WorkNotificationsSummary({ settings }: { settings: WorkSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{SET.READ_ONLY}</SettingsNote>
      <SettingsSection title={TRACK.DIGEST_SECTION}>
        {/* The heading names the digest; its row says only On or Off. */}
        <div data-setting="digest" className="px-4 py-3">
          <p className={TYPE.body}>{settings.digest_enabled ? SET.ON : SET.OFF}</p>
        </div>
        <div data-setting="digest_hour">
          <SettingsRow label={TRACK.DIGEST_HOUR}>
            <p className={`${TYPE.body} ${NUM}`}>{hourLabel(settings.digest_hour)}</p>
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
  );
}
