import { useEffect, useState, type FormEvent } from 'react';
import { NO_AGENT_REFUSAL, patchAgentSettings, readAgentRefusal, type AgentRefusal } from '../../features/agents/agentsApi';
import { AGENTS, AGENT_LABEL, LEVEL_LABEL, capFor, levelsDraftOf, levelsPatchOf, levelsUpTo, usesKind } from '../../features/agents/agentsText';
import { AGENT_KINDS, type AgentSettings, type Levels } from '../../features/agents/agentTypes';
import { FIELD_ERROR, FORM_ALERT, Select, SettingsSave, SettingsSection, TABLE, ScrollTable } from '../ui';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import type { SettingsUpdate } from '../../pages/settings/AgentSettingsFrame';
import { ActionsExplained, CELL, HEAD } from './ActionsGridSummary';

/** Actions & approvals for an admin (Decision 6): kinds down, agents across,
 *  each cell Auto, Ask or Never up to the kind's max_level, one Save. */
export function ActionsGridForm({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: SettingsUpdate) => void }) {
  const [draft, setDraft] = useState<Levels>(() => levelsDraftOf(settings));
  const [refusal, setRefusal] = useState<AgentRefusal>(NO_AGENT_REFUSAL);
  const [status, setStatus] = useState('');
  const saving = useSubmitOnce();
  const [focusCell, setFocusCell] = useState<string | null>(null);
  const dirty = Object.keys(levelsPatchOf(settings, draft)).length > 0;

  useEffect(() => {
    if (focusCell) document.getElementById(focusCell)?.focus();
  }, [focusCell]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setStatus('');
    setRefusal(NO_AGENT_REFUSAL);
    setFocusCell(null);
    const outcome = await saving.run(() => patchAgentSettings(levelsPatchOf(settings, draft)));
    if (!outcome) return;
    if (outcome.ok) {
      setDraft(levelsDraftOf(outcome.value));
      onSaved(outcome.value);
      setStatus('Saved.');
    } else {
      const next = readAgentRefusal(outcome.error, AGENTS.SAVE_FAILED);
      setRefusal(next);
      for (const spec of settings.kinds) {
        const agent = AGENT_KINDS.find((a) => next.levels[a]?.[spec.kind]);
        if (agent) {
          setFocusCell(`level-${agent}-${spec.kind}`);
          break;
        }
      }
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-6">
      <SettingsSection
        title={AGENTS.GRID_TITLE}
        description={AGENTS.NEVER_NOTE}
        footer={<SettingsSave dirty={dirty} saving={saving.busy} status={status} />}
      >
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
                  <th scope="row" className={`${CELL} sticky left-0 min-w-32 bg-surface font-semibold`}>
                    {spec.irreversible ? `${spec.label} · ${AGENTS.CANT_UNDO}` : spec.label}
                  </th>
                  {AGENT_KINDS.map((agent) => {
                    if (!usesKind(settings.kinds, agent, spec.kind)) {
                      return (
                        <td key={agent} className={`${CELL} text-ink-muted`}>
                          {AGENTS.NOT_USED}
                        </td>
                      );
                    }
                    if (spec.locked) {
                      return (
                        <td key={agent} className={`${CELL} text-ink-muted`}>
                          {AGENTS.ALWAYS_ASKS}
                        </td>
                      );
                    }
                    const message = refusal.levels[agent]?.[spec.kind];
                    const options = levelsUpTo(capFor(settings.kinds, spec.kind));
                    const stored = draft[agent][spec.kind] ?? 'ask';
                    const id = `level-${agent}-${spec.kind}`;
                    return (
                      <td key={agent} className={CELL}>
                        {/* UI broken-things fix 6: a fixed 7rem floor holds "Never" and the chevron; the grid scrolls sideways inside its card. */}
                        <Select
                          id={id}
                          label={`${spec.label} for the ${AGENT_LABEL[agent]}`}
                          labelPosition="hidden"
                          value={options.includes(stored) ? stored : options[0]}
                          invalid={Boolean(message)}
                          describedBy={message ? `${id}-error` : undefined}
                          onChange={(level) => {
                            setStatus('');
                            setRefusal(NO_AGENT_REFUSAL);
                            setDraft((current) => ({ ...current, [agent]: { ...current[agent], [spec.kind]: level } }));
                          }}
                          options={options.map((level) => ({ value: level, label: LEVEL_LABEL[level] }))}
                          className="w-28 min-w-28"
                        />
                        {message ? (
                          <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
                            {message}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
      <ActionsExplained settings={settings} />
    </form>
  );
}
