import { AgentsForm } from '../../components/agents/AgentsForm';
import { AgentsSummary } from '../../components/agents/AgentsSummary';
import { AGENTS } from '../../features/agents/agentsText';
import { AgentSettingsFrame } from './AgentSettingsFrame';
import { settingsTitle } from './workspaceSettingsNav';

/** Settings › Agents (spec §1.8; Decision 7): the form for whoever holds
 *  manage_org_settings (`can_edit`), the values as text for everyone else. */
export function AgentsSettingsPage() {
  return (
    <AgentSettingsFrame title={settingsTitle('/settings/agents')} intro={AGENTS.SETTINGS_INTRO}>
      {(settings, onSaved) => (settings.can_edit ? <AgentsForm settings={settings} onSaved={onSaved} /> : <AgentsSummary settings={settings} onSaved={onSaved} />)}
    </AgentSettingsFrame>
  );
}
