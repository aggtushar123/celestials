import { useId, useState } from 'react';
import { patchAgentSettings, readSignalRefusal } from '../../features/agents/agentsApi';
import { SIGNALS_TEXT, lastReadText } from '../../features/agents/agentsText';
import type { AgentSettings, AgentSettingsPatch, SignalSource } from '../../features/agents/agentTypes';
import type { SettingsUpdate } from '../../pages/settings/AgentSettingsFrame';
import { FORM_ALERT, Select, SettingsRow, SettingsSection, Switch, TYPE, useInstantSave } from '../ui';

type Refusal = ReturnType<typeof readSignalRefusal>;
const NONE: Refusal = { interval: null, sources: {}, form: null };

/** Settings › Agents › Reading messages for an admin (spec §4.3, §4.4;
 *  Decision 12): how often agents read messages and which sources they
 *  read, each saved at once with Undo. */
export function MessageSources({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: SettingsUpdate) => void }) {
  const ids = useId();
  const instant = useInstantSave();
  const [refusal, setRefusal] = useState<Refusal>(NONE);
  const signals = settings.signals;
  const save = (key: string, patch: AgentSettingsPatch, back: AgentSettingsPatch) => {
    setRefusal(NONE);
    void instant.run({
      key,
      request: () => patchAgentSettings(patch),
      onSaved: (next: AgentSettings) => onSaved(next),
      undo: () => patchAgentSettings(back),
      onUndone: (next: AgentSettings) => onSaved(next),
      onError: (error) => setRefusal(readSignalRefusal(error, SIGNALS_TEXT.SAVE_FAILED)),
    });
  };
  const intervalId = `${ids}-interval`;
  return (
    <SettingsSection title={SIGNALS_TEXT.TITLE}>
      <SettingsRow label={SIGNALS_TEXT.INTERVAL} htmlFor={intervalId} hint={SIGNALS_TEXT.HINT} hintId={`${intervalId}-hint`} error={refusal.interval || undefined} errorId={`${intervalId}-error`}>
        <Select
          id={intervalId}
          label={SIGNALS_TEXT.INTERVAL}
          labelPosition="external"
          value={signals.interval}
          invalid={Boolean(refusal.interval)}
          describedBy={refusal.interval ? `${intervalId}-hint ${intervalId}-error` : `${intervalId}-hint`}
          onChange={(value) => save('signal_interval', { signal_interval: value }, { signal_interval: signals.interval })}
          options={signals.intervals}
          className="sm:w-56"
        />
      </SettingsRow>
      {signals.sources.map((source) => {
        const error = refusal.sources[source.key as SignalSource];
        const hintId = `${ids}-${source.key}-hint`;
        return (
          <SettingsRow key={source.key} label={source.label} hint={source.connected ? undefined : SIGNALS_TEXT.NOT_CONNECTED} hintId={hintId} error={error || undefined} errorId={`${hintId}-error`}>
            <Switch
              checked={source.enabled}
              busy={instant.busyKey === source.key}
              label={source.label}
              describedBy={[source.connected ? null : hintId, error ? `${hintId}-error` : null].filter(Boolean).join(' ') || undefined}
              onChange={(next) => save(source.key, { signal_sources: { [source.key]: next } }, { signal_sources: { [source.key]: source.enabled } })}
            />
          </SettingsRow>
        );
      })}
      <p className={`px-4 py-3 ${TYPE.meta}`}>{lastReadText(signals.last_run_at)}</p>
      {refusal.form ? (
        <p role="alert" className={`px-4 pb-3 ${FORM_ALERT}`}>
          {refusal.form}
        </p>
      ) : null}
    </SettingsSection>
  );
}

/** The same values as text, for a member (Decision 12). */
export function MessageSourcesSummary({ settings }: { settings: AgentSettings }) {
  const signals = settings.signals;
  const interval = signals.intervals.find((option) => option.value === signals.interval)?.label ?? signals.interval;
  return (
    <SettingsSection title={SIGNALS_TEXT.TITLE}>
      <SettingsRow label={SIGNALS_TEXT.INTERVAL}>
        <p className={TYPE.body}>{interval}</p>
      </SettingsRow>
      {signals.sources.map((source) => (
        <SettingsRow key={source.key} label={source.label}>
          <p className={TYPE.body}>{`${source.enabled ? SIGNALS_TEXT.ON : SIGNALS_TEXT.OFF}${source.connected ? '' : ` · ${SIGNALS_TEXT.NOT_CONNECTED}`}`}</p>
        </SettingsRow>
      ))}
      <p className={`px-4 py-3 ${TYPE.meta}`}>{lastReadText(signals.last_run_at)}</p>
    </SettingsSection>
  );
}
