import { useId, useRef, useState } from 'react';
import { fetchMe } from '../../features/auth/authSlice';
import type { AgentTone } from '../../features/auth/authSlice';
import { NO_AGENT_REFUSAL, patchAgentSettings, readAgentRefusal, type AgentRefusal } from '../../features/agents/agentsApi';
import { AGENTS, agentsDraftOf, agentsPatchOf, validateAgents, type AgentsDraft } from '../../features/agents/agentsText';
import { AGENT_KINDS, type AgentCard as Card, type AgentKind, type AgentSettings, type AgentSettingsPatch } from '../../features/agents/agentTypes';
import { useAppDispatch } from '../../hooks';
import { FORM_ALERT, INPUT, INVALID, NUM, Select, SettingsRow, SettingsSection, Switch, useInstantSave, useSettingsDraft, useSettingsDraftSave } from '../ui';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import type { SettingsUpdate } from '../../pages/settings/AgentSettingsFrame';
import { AgentCard } from './AgentCard';
import { AiOffNotice } from './AiOffNotice';
import { FastLane } from './FastLane';
import { MessageSources } from './MessageSources';

const BUDGET = `${INPUT} ${INVALID} ${NUM} sm:w-28`;
const TONES: { value: AgentTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
];

/** Settings › Agents for an admin (Decision 7; settings production spec §6):
 *  the AI switch, the tone and each agent's switch save at once, with an
 *  Undo; monthly credits go through the page's save bar; each card's Run now
 *  sends at once. */
export function AgentsForm({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: SettingsUpdate) => void }) {
  const ids = useId();
  const dispatch = useAppDispatch();
  const canRun = settings.can_run;
  const [draft, setDraft] = useState<AgentsDraft>(() => agentsDraftOf(settings));
  const [refusal, setRefusal] = useState<AgentRefusal>(NO_AGENT_REFUSAL);
  const [local, setLocal] = useState<Partial<Record<AgentKind, string>>>({});
  const saving = useSubmitOnce();
  const instant = useInstantSave();
  const budgets = useRef<Partial<Record<AgentKind, HTMLInputElement | null>>>({});
  // The AI switch, tone and agent switches save on their own; the bar holds budgets.
  const savedCard = (kind: AgentKind) => settings.agents.find((c) => c.kind === kind);
  const typed = (d: AgentsDraft): AgentsDraft => {
    const next: AgentsDraft = { ...d, ai_enabled: settings.ai_enabled, tone: settings.tone };
    for (const kind of AGENT_KINDS) next[kind] = { ...d[kind], enabled: savedCard(kind)?.enabled ?? d[kind].enabled };
    return next;
  };
  const pending = agentsPatchOf(settings, typed(draft));
  // Only a budget the user typed is checked: a saved budget above a lowered
  // plan is the server's to judge, not an unsaved edit that pins the bar.
  const edited = (d: AgentsDraft) => AGENT_KINDS.filter((kind) => d[kind].budget !== String(savedCard(kind)?.monthly_credits ?? 0));
  const editErrors = (d: AgentsDraft): Partial<Record<AgentKind, string>> => {
    const all = validateAgents(d, settings.plan_monthly_credits);
    return Object.fromEntries(edited(d).flatMap((kind) => (all[kind] ? [[kind, all[kind]]] : [])));
  };
  // A typed budget that is not a whole number is still an unsaved edit: Save tells the user why.
  const dirty = Object.keys(pending).length > 0 || Object.keys(editErrors(draft)).length > 0;

  // Typing a budget retires only that agent's own budget message.
  const editBudget = (kind: AgentKind, value: string) => {
    setLocal((current) => ({ ...current, [kind]: undefined }));
    setRefusal((current) => {
      const own = current.agents[kind];
      if (own === undefined) return current;
      const agents = { ...current.agents };
      if (typeof own === 'string') delete agents[kind];
      else {
        const rest = { ...own };
        delete rest.monthly_credits;
        if (Object.keys(rest).length > 0) agents[kind] = rest;
        else delete agents[kind];
      }
      return { ...current, agents };
    });
    setDraft((current) => ({ ...current, [kind]: { ...current[kind], budget: value } }));
  };

  const budgetError = (kind: AgentKind): string | null => {
    const server = refusal.agents[kind];
    if (typeof server === 'string') return server;
    return local[kind] ?? server?.monthly_credits ?? null;
  };

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const errors = editErrors(draft);
    if (Object.keys(errors).length > 0) {
      setLocal(errors);
      budgets.current[AGENT_KINDS.find((kind) => errors[kind]) ?? 'cs']?.focus();
      return false;
    }
    setLocal({});
    setRefusal(NO_AGENT_REFUSAL);
    const outcome = await saving.run(() => patchAgentSettings(pending));
    if (!outcome) return false;
    if (!outcome.ok) {
      setRefusal(readAgentRefusal(outcome.error, AGENTS.SAVE_FAILED));
      return false;
    }
    setDraft(agentsDraftOf(outcome.value));
    onSaved(outcome.value);
    return true;
  }

  // Enter in a field saves the way the page bar does (spec §5.4).
  const saveAll = useSettingsDraftSave();
  useSettingsDraft({
    dirty,
    saving: saving.busy,
    save,
    discard: () => {
      setDraft(agentsDraftOf(settings));
      setLocal({});
      setRefusal(NO_AGENT_REFUSAL);
    },
  });

  // An instant change: its own earlier refusal is retired, the saved switches,
  // AI setting and tone are merged into the draft so typed budgets survive,
  // and Undo reverses it.
  const saveNow = (key: 'ai_enabled' | 'tone' | AgentKind, patch: AgentSettingsPatch, back: AgentSettingsPatch, refreshMe = false) => {
    setRefusal((current) => {
      if (key === 'ai_enabled' || key === 'tone') {
        const top = { ...current.top };
        delete top[key];
        return { ...current, top };
      }
      const own = current.agents[key];
      if (own === undefined) return current;
      const agents = { ...current.agents };
      if (typeof own === 'string') delete agents[key];
      else {
        const rest = { ...own };
        delete rest.enabled;
        if (Object.keys(rest).length > 0) agents[key] = rest;
        else delete agents[key];
      }
      return { ...current, agents };
    });
    const synced = (next: AgentSettings) => {
      onSaved(next);
      const saved = agentsDraftOf(next);
      setDraft((current) => ({
        ...saved,
        cs: { ...current.cs, enabled: saved.cs.enabled },
        sales: { ...current.sales, enabled: saved.sales.enabled },
        ops: { ...current.ops, enabled: saved.ops.enabled },
      }));
      if (refreshMe) void dispatch(fetchMe());
    };
    void instant.run({
      key,
      request: () => patchAgentSettings(patch),
      onSaved: synced,
      undo: () => patchAgentSettings(back),
      onUndone: synced,
      onError: (error) =>
        setRefusal((current) => {
          const refused = readAgentRefusal(error, AGENTS.SAVE_FAILED);
          return { ...current, top: { ...current.top, ...refused.top }, agents: { ...current.agents, ...refused.agents }, form: refused.form ?? current.form };
        }),
    });
  }

  const ran = (next: Card) => onSaved((current) => ({ ...current, agents: current.agents.map((c) => (c.kind === next.kind ? next : c)) }));
  const toneId = `${ids}-tone`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void saveAll();
      }}
      noValidate
      aria-label={AGENTS.SETTINGS_TITLE}
      className="flex flex-col gap-6"
    >
      <SettingsSection title={AGENTS.WORKSPACE_AI}>
        <SettingsRow label={AGENTS.AI_SWITCH} hint={AGENTS.AI_DETAIL} hintId={`${ids}-ai-detail`} error={refusal.top.ai_enabled || undefined} errorId={`${ids}-ai-error`}>
          <Switch
            checked={settings.ai_enabled}
            busy={instant.busyKey === 'ai_enabled'}
            label={AGENTS.AI_SWITCH}
            describedBy={refusal.top.ai_enabled ? `${ids}-ai-detail ${ids}-ai-error` : `${ids}-ai-detail`}
            onChange={(next) => saveNow('ai_enabled', { ai_enabled: next }, { ai_enabled: settings.ai_enabled }, true)}
          />
        </SettingsRow>
        <SettingsRow label={AGENTS.TONE} htmlFor={toneId} error={refusal.top.tone || undefined} errorId={`${toneId}-error`}>
          <Select
            id={toneId}
            label={AGENTS.TONE}
            labelPosition="external"
            value={settings.tone}
            invalid={Boolean(refusal.top.tone)}
            describedBy={refusal.top.tone ? `${toneId}-error` : undefined}
            onChange={(value) => saveNow('tone', { tone: value }, { tone: settings.tone }, true)}
            options={TONES}
            className="sm:w-56"
          />
        </SettingsRow>
      </SettingsSection>
      {settings.ai_enabled ? null : <AiOffNotice />}
      <MessageSources settings={settings} onSaved={onSaved} />
      <FastLane settings={settings} onSaved={onSaved} />
      {AGENT_KINDS.map((kind) => {
        const card = settings.agents.find((c) => c.kind === kind);
        if (!card) return null;
        const budgetId = `${ids}-${kind}-budget`;
        const message = budgetError(kind);
        const serverAgent = refusal.agents[kind];
        const enabledMessage = typeof serverAgent === 'object' ? (serverAgent.enabled ?? null) : null;
        return (
          <AgentCard key={kind} card={card} canRun={canRun} onRan={ran}>
            <SettingsRow label={AGENTS.AGENT_SWITCH} error={enabledMessage || undefined} errorId={`${budgetId}-enabled-error`}>
              <Switch
                checked={card.enabled}
                busy={instant.busyKey === kind}
                label={card.label}
                describedBy={enabledMessage ? `${budgetId}-enabled-error` : undefined}
                onChange={(next) => saveNow(kind, { agents: { [kind]: { enabled: next } } }, { agents: { [kind]: { enabled: card.enabled } } })}
              />
            </SettingsRow>
            <SettingsRow label={AGENTS.BUDGET} htmlFor={budgetId} error={message || undefined} errorId={`${budgetId}-error`}>
              <input
                id={budgetId}
                ref={(node) => {
                  budgets.current[kind] = node;
                }}
                inputMode="numeric"
                aria-label={`Monthly credits for the ${card.label}`}
                value={draft[kind].budget}
                aria-invalid={Boolean(message)}
                aria-describedby={message ? `${budgetId}-error` : undefined}
                onChange={(event) => editBudget(kind, event.target.value)}
                className={BUDGET}
              />
            </SettingsRow>
          </AgentCard>
        );
      })}
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
