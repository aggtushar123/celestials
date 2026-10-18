import { WorkSettingsForm } from '../../components/work/WorkSettingsForm';
import { WorkSettingsSummary } from '../../components/work/WorkSettingsSummary';
import { SET } from '../../features/work/workSettings';
import { WorkSettingsFrame } from './WorkSettingsFrame';
import { settingsTitle } from './workspaceSettingsNav';

/** Settings › Work › Recommendations (spec §2.4; Decision 10): the form for
 *  whoever holds manage_org_settings (`can_edit`), the values as text for
 *  everyone else. */
export function WorkRecommendationsPage() {
  return (
    <WorkSettingsFrame title={settingsTitle('/settings/work/recommendations')} intro={SET.INTRO} loading={SET.LOADING} loadFailed={SET.LOAD}>
      {(settings, onSaved) => (settings.can_edit ? <WorkSettingsForm settings={settings} onSaved={onSaved} /> : <WorkSettingsSummary settings={settings} />)}
    </WorkSettingsFrame>
  );
}
