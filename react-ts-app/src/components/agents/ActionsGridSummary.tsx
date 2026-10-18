import { AGENTS, AGENT_LABEL, LEVEL_LABEL, usesKind } from '../../features/agents/agentsText';
import { AGENT_KINDS, type AgentSettings } from '../../features/agents/agentTypes';
import { SettingsNote, SettingsSection, TABLE, TD, TH, TYPE, ScrollTable } from '../ui';

// Rows centre vertically, so an action's name lines up with its selects (fix 6).
export const CELL = `${TD} text-left`;
export const HEAD = TH;

/** "What each action does": each kind's label and example, as a list. */
export function ActionsExplained({ settings }: { settings: AgentSettings }) {
  return (
    <SettingsSection title={AGENTS.WHAT_EACH_DOES} list={AGENTS.WHAT_EACH_DOES}>
      {settings.kinds.map((spec) => (
        <li key={spec.kind} className="flex flex-col gap-0.5 px-4 py-3">
          <span className={TYPE.label}>{spec.label}</span>
          <span className={TYPE.bodyMuted}>{spec.example}</span>
        </li>
      ))}
    </SettingsSection>
  );
}

/** Actions & approvals for a member (Decision 6): the same table, in words. */
export function ActionsGridSummary({ settings }: { settings: AgentSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{AGENTS.READ_ONLY}</SettingsNote>
      <SettingsSection title={AGENTS.GRID_TITLE}>
        <ScrollTable>
          <table aria-label={AGENTS.ACTIONS_TITLE} className={TABLE}>
            <thead>
              <tr className="border-b border-line-subtle">
                <th scope="col" className={`${HEAD} sticky left-0 bg-surface`}>
                  {AGENTS.ACTION}
                </th>
                {AGENT_KINDS.map((agent) => (
                  <th key={agent} scope="col" className={HEAD}>
                    {AGENT_LABEL[agent]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {settings.kinds.map((spec) => (
                <tr key={spec.kind}>
                  <th scope="row" className={`${CELL} sticky left-0 bg-surface font-semibold`}>
                    {spec.label}
                  </th>
                  {AGENT_KINDS.map((agent) => {
                    const level = usesKind(settings.kinds, agent, spec.kind) ? settings.levels[agent][spec.kind] : undefined;
                    return (
                      <td key={agent} className={level ? CELL : `${CELL} text-ink-muted`}>
                        {level ? LEVEL_LABEL[level] : AGENTS.NOT_USED}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </SettingsSection>
      <ActionsExplained settings={settings} />
    </div>
  );
}
