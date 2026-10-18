import { WorkNotificationsForm } from '../../components/work/WorkNotificationsForm';
import { WorkNotificationsSummary } from '../../components/work/WorkNotificationsSummary';
import { Banner } from '../../components/ui';
import { TRACK } from '../../features/work/workTracking';
import { WorkSettingsFrame } from './WorkSettingsFrame';
import { settingsTitle } from './workspaceSettingsNav';

/** Settings › Work › Notifications (spec §3.3; Decision 4): the email line
 *  for everyone when the server cannot send, then the form or the text. */
export function WorkNotificationsPage() {
  return (
    <WorkSettingsFrame title={settingsTitle('/settings/work/notifications')} intro={TRACK.NOTICES_INTRO}>
      {(settings, onSaved) => (
        <>
          {settings.email_ready ? null : <Banner tone="warning">{TRACK.NO_EMAIL}</Banner>}
          {settings.can_edit ? <WorkNotificationsForm settings={settings} onSaved={onSaved} /> : <WorkNotificationsSummary settings={settings} />}
        </>
      )}
    </WorkSettingsFrame>
  );
}
