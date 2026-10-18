import { WorkTasksForm } from '../../components/work/WorkTasksForm';
import { WorkTasksSummary } from '../../components/work/WorkTasksSummary';
import { TRACK } from '../../features/work/workTracking';
import { WorkSettingsFrame } from './WorkSettingsFrame';
import { settingsTitle } from './workspaceSettingsNav';

/** Settings › Work › Tasks (spec §3.3): the form for whoever holds
 *  manage_org_settings (`can_edit`), the values as text for everyone else. */
export function WorkTasksPage() {
  return (
    <WorkSettingsFrame title={settingsTitle('/settings/work/tasks')} intro={TRACK.TASKS_INTRO}>
      {(settings, onSaved) => (settings.can_edit ? <WorkTasksForm settings={settings} onSaved={onSaved} /> : <WorkTasksSummary settings={settings} />)}
    </WorkSettingsFrame>
  );
}
