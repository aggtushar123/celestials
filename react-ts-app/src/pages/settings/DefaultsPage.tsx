import { useCapability } from '../../hooks';
import { SettingsFrame, SettingsNote } from '../../components/ui';
import { CurrencySection } from './CurrencySection';
import { LifecycleDefaultSection } from './LifecycleDefaultSection';
import { settingsTitle } from './workspaceSettingsNav';

/** Settings › Data › Defaults (settings spec 2026-10-06 §3.2): the
 *  workspace's currency with its FX rates, then what a new organisation
 *  starts as. The currency waits in the save bar because
 *  saving it clears the rates; the default stage saves at once. Both need
 *  manage_org_settings, so one note under the heading says so. */
export function DefaultsPage() {
  const canEdit = useCapability('manage_org_settings');
  return (
    <SettingsFrame
      title={settingsTitle('/settings/defaults')}
      intro="What the workspace assumes until a record says otherwise."
      note={canEdit ? undefined : <SettingsNote icon="lock">You don't have permission to change this.</SettingsNote>}
    >
      <CurrencySection />
      <LifecycleDefaultSection />
    </SettingsFrame>
  );
}
