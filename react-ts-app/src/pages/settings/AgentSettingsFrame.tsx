import { useEffect, useState, type ReactNode } from 'react';
import { Card, ErrorState, LoadingState, SettingsFrame } from '../../components/ui';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { fetchAgentSettings } from '../../features/agents/agentsApi';
import { AGENTS } from '../../features/agents/agentsText';
import type { AgentSettings } from '../../features/agents/agentTypes';

/** A new settings value, or a change of the current one (so two Run now answers cannot overwrite each other). */
export type SettingsUpdate = AgentSettings | ((current: AgentSettings) => AgentSettings);

/** A Settings › Agents page: the settings frame (UI foundations spec §6.3: a thin data wrapper),
 *  GET /agents/settings/ with a skeleton (also on Try again) and an error,
 *  then the page's own body, which may replace the settings after a save. */
export function AgentSettingsFrame({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: (settings: AgentSettings, onSaved: (next: SettingsUpdate) => void) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchAgentSettings().then(
      (data) => {
        if (!alive) return;
        setSettings(data);
        setError(null);
      },
      (err: unknown) => {
        if (alive) setError(errorMessage(err, AGENTS.LOAD));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const update = (next: SettingsUpdate) => setSettings((current) => (current && typeof next === 'function' ? next(current) : typeof next === 'function' ? current : next));

  const retry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  let body: ReactNode;
  if (!settings && error)
    body = (
      <Card pad="none">
        <ErrorState message={error} onRetry={retry} />
      </Card>
    );
  else if (!settings)
    body = (
      <Card pad="none">
        <LoadingState label={AGENTS.LOADING} variant="block" />
      </Card>
    );
  else body = children(settings, update);

  return (
    <SettingsFrame title={title} intro={intro}>
      {body}
    </SettingsFrame>
  );
}
