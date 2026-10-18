import { ActionsGridForm } from '../../components/agents/ActionsGridForm';
import { ActionsGridSummary } from '../../components/agents/ActionsGridSummary';
import { AiOffNotice } from '../../components/agents/AiOffNotice';
import { AGENTS } from '../../features/agents/agentsText';
import { AgentSettingsFrame } from './AgentSettingsFrame';
import { settingsTitle } from './workspaceSettingsNav';

/** Settings › Actions & approvals (spec §1.6, §1.8; Decision 6). */
export function AgentActionsPage() {
  return (
    <AgentSettingsFrame title={settingsTitle('/settings/agents/actions')} intro={AGENTS.ACTIONS_INTRO}>
      {(settings, onSaved) => (
        <>
          {settings.ai_enabled ? null : <AiOffNotice />}
          {settings.can_edit ? <ActionsGridForm settings={settings} onSaved={onSaved} /> : <ActionsGridSummary settings={settings} />}
        </>
      )}
    </AgentSettingsFrame>
  );
}
