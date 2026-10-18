import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { NO_FAST_LANE_REFUSAL, patchAgentSettings, readFastLaneRefusal, type FastLaneRefusal } from '../../features/agents/agentsApi';
import { SIGNALS_TEXT } from '../../features/agents/agentsText';
import type { AgentSettings, AgentSettingsPatch, FastLaneRules, FastLaneSettings } from '../../features/agents/agentTypes';
import { FAST_LANE, rulesSummary, usedLine } from '../../features/agents/fastLaneText';
import type { SettingsUpdate } from '../../pages/settings/AgentSettingsFrame';
import { BUTTON, CHECKBOX, CHOICE, FOCUS, FORM_ALERT, INPUT, INVALID, NUM, Select, SettingsRow, SettingsSection, Switch, TYPE, useInstantSave } from '../ui';

type Save = (key: string, patch: AgentSettingsPatch, back: AgentSettingsPatch) => Promise<boolean>;
type RuleSwitch = 'jira_priority' | 'poor_health';
type TagRule = 'words' | 'senders';

const lanePatch = (fast_lane: NonNullable<AgentSettingsPatch['fast_lane']>): AgentSettingsPatch => ({ fast_lane });
const rulePatch = (rules: Partial<FastLaneRules>): AgentSettingsPatch => lanePatch({ rules });
const upTo = (max: number) => Array.from({ length: max + 1 }, (_, n) => ({ value: String(n), label: String(n) }));
/** A chip's remove button (as `RemovableChip`'s): 44px on phones, small inside the chip from sm. */
const CHIP_REMOVE = `inline-flex min-h-11 min-w-11 sm:min-h-6 sm:min-w-6 items-center justify-center rounded-full text-ink-muted hover:bg-line-subtle hover:text-ink ${FOCUS}`;
const joinIds = (...ids: (string | false | null)[]) => ids.filter(Boolean).join(' ') || undefined;

/** Settings › Agents › Fast lane for an admin (round 2 D3 frontend Decision 7;
 *  contract §5): the rules-only fast lane, its rules and its caps, each saved
 *  at once with Undo, and what it used. Nothing when an older backend sends
 *  no fast lane. */
export function FastLane({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: SettingsUpdate) => void }) {
  const lane = settings.signals.fast_lane;
  return lane ? <FastLaneForm lane={lane} onSaved={onSaved} /> : null;
}

function FastLaneForm({ lane, onSaved }: { lane: FastLaneSettings; onSaved: (next: SettingsUpdate) => void }) {
  const ids = useId();
  const instant = useInstantSave();
  const [refusal, setRefusal] = useState<FastLaneRefusal>(NO_FAST_LANE_REFUSAL);
  const save: Save = (key, patch, back) => {
    setRefusal(NO_FAST_LANE_REFUSAL);
    return instant.run({
      key,
      request: () => patchAgentSettings(patch),
      onSaved: (next: AgentSettings) => onSaved(next),
      undo: () => patchAgentSettings(back),
      onUndone: (next: AgentSettings) => onSaved(next),
      onError: (error) => setRefusal(readFastLaneRefusal(error, SIGNALS_TEXT.SAVE_FAILED)),
    });
  };
  const { rules } = lane;
  const ruleSwitch = (key: RuleSwitch, label: string, hint: string) => {
    const hintId = `${ids}-${key}-hint`;
    const error = refusal[key];
    return (
      <SettingsRow label={label} hint={hint} hintId={hintId} error={error || undefined} errorId={`${hintId}-error`}>
        <Switch
          checked={rules[key]}
          busy={instant.busyKey === key}
          label={label}
          describedBy={joinIds(hintId, Boolean(error) && `${hintId}-error`)}
          onChange={(next) => void save(key, rulePatch({ [key]: next }), rulePatch({ [key]: rules[key] }))}
        />
      </SettingsRow>
    );
  };
  const onId = `${ids}-on-hint`;
  const slackId = `${ids}-slack-hint`;
  const limitsId = `${ids}-limits`;
  const limitsError = [refusal.per_hour, refusal.per_day].filter(Boolean).join(' ');
  const setDay = (day: number) => {
    // A day below the hour takes the hour down with it; Undo restores both.
    const patch = day < lane.per_hour ? { per_day: day, per_hour: day } : { per_day: day };
    const back = day < lane.per_hour ? { per_day: lane.per_day, per_hour: lane.per_hour } : { per_day: lane.per_day };
    void save('per_day', lanePatch(patch), lanePatch(back));
  };
  return (
    <SettingsSection title={FAST_LANE.TITLE}>
      <SettingsRow label={FAST_LANE.SWITCH} hint={FAST_LANE.HINT} hintId={onId} error={refusal.on || undefined} errorId={`${onId}-error`}>
        <Switch
          checked={lane.on}
          busy={instant.busyKey === 'on'}
          label={FAST_LANE.SWITCH}
          describedBy={joinIds(onId, Boolean(refusal.on) && `${onId}-error`)}
          onChange={(next) => void save('on', lanePatch({ on: next }), lanePatch({ on: lane.on }))}
        />
      </SettingsRow>
      {lane.on ? (
        <>
          {ruleSwitch('jira_priority', FAST_LANE.JIRA, FAST_LANE.JIRA_HINT)}
          <SettingsRow label={FAST_LANE.SLACK} hint={FAST_LANE.SLACK_HINT} hintId={slackId} group error={refusal.slack_connectors || undefined} errorId={`${slackId}-error`}>
            {lane.slack_choices.length === 0 ? (
              <p className={TYPE.bodyMuted}>{FAST_LANE.NO_SLACK}</p>
            ) : (
              lane.slack_choices.map((choice) => {
                const picked = rules.slack_connectors.includes(choice.id);
                const next = picked ? rules.slack_connectors.filter((id) => id !== choice.id) : [...rules.slack_connectors, choice.id];
                return (
                  <label key={choice.id} className={CHOICE}>
                    <input
                      type="checkbox"
                      checked={picked}
                      aria-describedby={joinIds(slackId, Boolean(refusal.slack_connectors) && `${slackId}-error`)}
                      onChange={() => {
                        if (instant.busyKey !== 'slack_connectors') void save('slack_connectors', rulePatch({ slack_connectors: next }), rulePatch({ slack_connectors: rules.slack_connectors }));
                      }}
                      className={CHECKBOX}
                    />
                    {choice.name}
                  </label>
                );
              })
            )}
          </SettingsRow>
          <TagList rule="words" label={FAST_LANE.WORDS} hint={FAST_LANE.WORDS_HINT} values={rules.words} max={lane.limits.words} error={refusal.words} busy={instant.busyKey === 'words'} save={save} />
          <TagList rule="senders" label={FAST_LANE.SENDERS} hint={FAST_LANE.SENDERS_HINT} values={rules.senders} max={lane.limits.senders} error={refusal.senders} busy={instant.busyKey === 'senders'} save={save} />
          {ruleSwitch('poor_health', FAST_LANE.HEALTH, FAST_LANE.HEALTH_HINT)}
          <SettingsRow label={FAST_LANE.LIMITS} group error={limitsError || undefined} errorId={`${limitsId}-error`}>
            <div className="flex flex-wrap gap-3">
              <Select
                label={FAST_LANE.PER_HOUR}
                labelPosition="inline"
                value={String(lane.per_hour)}
                invalid={Boolean(refusal.per_hour)}
                describedBy={refusal.per_hour ? `${limitsId}-error` : undefined}
                onChange={(value) => void save('per_hour', lanePatch({ per_hour: Number(value) }), lanePatch({ per_hour: lane.per_hour }))}
                options={upTo(lane.limits.per_hour)}
              />
              <Select
                label={FAST_LANE.PER_DAY}
                labelPosition="inline"
                value={String(lane.per_day)}
                invalid={Boolean(refusal.per_day)}
                describedBy={refusal.per_day ? `${limitsId}-error` : undefined}
                onChange={(value) => setDay(Number(value))}
                options={upTo(lane.limits.per_day)}
              />
            </div>
          </SettingsRow>
          <p className={`px-4 py-3 ${TYPE.meta}`}>{usedLine(lane)}</p>
        </>
      ) : null}
      {refusal.form ? (
        <p role="alert" className={`px-4 pb-3 ${FORM_ALERT}`}>
          {refusal.form}
        </p>
      ) : null}
    </SettingsSection>
  );
}

/** Words or senders: an input with Add (and Enter), each value a chip with
 *  its remove button. The server checks each value; its sentence shows
 *  under the row. The field clears once a value is saved. */
function TagList({ rule, label, hint, values, max, error, busy, save }: { rule: TagRule; label: string; hint: string; values: string[]; max: number; error: string | null; busy: boolean; save: Save }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const send = (next: string[]) => save(rule, rulePatch({ [rule]: next }), rulePatch({ [rule]: values }));
  const add = async () => {
    const value = draft.trim();
    if (!value || busy) return;
    if (await send([...values, value])) setDraft('');
  };
  return (
    <SettingsRow label={label} hint={hint} hintId={hintId} group error={error || undefined} errorId={errorId}>
      <div className="flex w-full gap-2">
        <input
          type="text"
          value={draft}
          aria-label={label}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={joinIds(hintId, Boolean(error) && errorId)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void add();
          }}
          className={`${INPUT} ${INVALID}`}
        />
        <button type="button" onClick={() => void add()} aria-busy={busy || undefined} className={`${BUTTON} shrink-0`}>
          {FAST_LANE.ADD}
        </button>
      </div>
      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5 sm:justify-end">
          {values.map((value) => (
            <li key={value} className={`inline-flex min-h-11 sm:min-h-8 items-center gap-1 rounded-full bg-subtle pl-3 pr-1 ${TYPE.body}`}>
              {value}
              <button type="button" aria-label={FAST_LANE.REMOVE(value)} onClick={() => void (busy || send(values.filter((v) => v !== value)))} className={CHIP_REMOVE}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={`mt-1 ${TYPE.meta} ${NUM}`}>{`${values.length} of ${max}`}</p>
    </SettingsRow>
  );
}

/** The fast lane as text, for a member: On or Off, and when on its rules and
 *  what it used. Nothing when an older backend sends no fast lane. */
export function FastLaneSummary({ settings }: { settings: AgentSettings }) {
  const lane = settings.signals.fast_lane;
  if (!lane) return null;
  return (
    <SettingsSection title={FAST_LANE.TITLE}>
      <SettingsRow label={FAST_LANE.SWITCH}>
        <p className={TYPE.body}>{lane.on ? FAST_LANE.ON : FAST_LANE.OFF}</p>
      </SettingsRow>
      {lane.on ? (
        <>
          <p className={`px-4 py-3 ${TYPE.body}`}>{rulesSummary(lane)}</p>
          <p className={`px-4 py-3 ${TYPE.meta}`}>{usedLine(lane)}</p>
        </>
      ) : null}
    </SettingsSection>
  );
}
