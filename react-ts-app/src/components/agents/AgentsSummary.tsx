import { AGENTS } from '../../features/agents/agentsText';
import type { AgentSettings } from '../../features/agents/agentTypes';
import type { SettingsUpdate } from '../../pages/settings/AgentSettingsFrame';
import { NUM, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../ui';
import { AgentCard } from './AgentCard';
import { AiOffNotice } from './AiOffNotice';
import { FastLaneSummary } from './FastLane';
import { MessageSourcesSummary } from './MessageSources';

const TONE: Record<AgentSettings['tone'], string> = { professional: 'Professional', friendly: 'Friendly', concise: 'Concise' };

/** Settings › Agents for a member (Decision 7): the values as text in the
 *  same sections, with Run now when the server says `can_run`. */
export function AgentsSummary({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: SettingsUpdate) => void }) {
  const canRun = settings.can_run;
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{AGENTS.READ_ONLY}</SettingsNote>
      <SettingsSection title={AGENTS.WORKSPACE_AI}>
        <SettingsRow label={AGENTS.AI_SWITCH}>
          <p className={TYPE.body}>{settings.ai_enabled ? AGENTS.ON : AGENTS.OFF}</p>
        </SettingsRow>
        <SettingsRow label={AGENTS.TONE}>
          <p className={TYPE.body}>{TONE[settings.tone]}</p>
        </SettingsRow>
      </SettingsSection>
      {settings.ai_enabled ? null : <AiOffNotice />}
      <MessageSourcesSummary settings={settings} />
      <FastLaneSummary settings={settings} />
      {settings.agents.map((card) => (
        <AgentCard key={card.kind} card={card} canRun={canRun} onRan={(next) => onSaved((current) => ({ ...current, agents: current.agents.map((c) => (c.kind === next.kind ? next : c)) }))}>
          <SettingsRow label={AGENTS.AGENT_SWITCH}>
            <p className={TYPE.body}>
              {card.enabled ? AGENTS.ON : AGENTS.OFF} · <span className={NUM}>{card.monthly_credits}</span> credits a month
            </p>
          </SettingsRow>
        </AgentCard>
      ))}
    </div>
  );
}
