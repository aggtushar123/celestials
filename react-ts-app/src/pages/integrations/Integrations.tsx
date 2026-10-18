import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { clearConnectorSaveError, disconnectConnector, fetchConnectors, updateConnector } from '../../features/connectors/connectorsSlice';
import type { Connector, Provider } from '../../features/connectors/connectorsSlice';
import { AGENT_ACCESS } from '../../features/connectors/agentAccess';
import { outcomeLine } from '../../features/connectors/jiraLinkText';
import { COMING_SOON, CONNECTIONS, TOOL_CARDS, WORKSPACE_TOOLS, slackLinkOutcome } from '../../features/connectors/connectionsText';
import { GmailAccountRow } from '../../components/integrations/GmailAccountRow';
import { SlackAccountRow } from '../../components/integrations/SlackAccountRow';
import { JiraAccountRow } from '../../components/integrations/JiraAccountRow';
import { WorkspaceToolRow } from '../../components/integrations/WorkspaceToolRow';
import { ConnectionPart } from '../../components/integrations/ConnectionRow';
import { PROVIDER_LOGOS } from '../../components/integrations/providerLogos';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { FORM_ALERT, FORM_OK, SettingsCard, SettingsFrame, TYPE } from '../../components/ui';
import { settingsTitle } from '../settings/workspaceSettingsNav';

/**
 * Settings › Connections (spec 2026-10-16): three tools, two kinds of
 * connection. "Your accounts" is every member's own (Gmail, a Slack link,
 * a Jira link: they act as the person). "Workspace" is what an admin
 * (manage_integrations) connects once for the company (Slack, Jira). The
 * other tools the backend knows are listed as coming soon, without buttons;
 * records they already brought in stay on customers.
 */
export function Integrations() {
  const dispatch = useAppDispatch();
  const canManage = useCapability('manage_integrations');
  const { items, error, saveError } = useAppSelector((s) => s.connectors);
  // The one confirm on screen: a disconnect (credentials removed) or a
  // disable (sync stops until enabled again). Never a native dialog.
  const [confirming, setConfirming] = useState<{ kind: 'disconnect' | 'disable'; connector: Connector } | null>(null);

  useEffect(() => {
    if (canManage) dispatch(fetchConnectors());
  }, [dispatch, canManage]);

  // A provider sign-in lands back here with ?connector=, ?jira_link= or ?slack_link=.
  const query = new URLSearchParams(window.location.search);
  const outcome = query.get('connector');
  const outcomeDetail = query.get('detail');
  const lines = [outcomeLine(query), slackLinkOutcome(query)].filter((line): line is { text: string; failed: boolean } => line !== null);
  const done = [...(outcome === 'connected' ? ['Connected.'] : []), ...(outcome === 'agents_on' ? [AGENT_ACCESS.DONE] : []), ...lines.filter((l) => !l.failed).map((l) => l.text)];
  const failures = [...(outcome === 'error' ? [`Could not connect: ${outcomeDetail || 'the provider refused.'}`] : []), ...lines.filter((l) => l.failed).map((l) => l.text)];

  const byProvider = new Map<Provider, Connector[]>();
  items.forEach((c) => byProvider.set(c.provider, [...(byProvider.get(c.provider) ?? []), c]));

  return (
    <SettingsFrame title={settingsTitle('/settings/connections')} intro={CONNECTIONS.INTRO}>
      {/* One status region, always mounted (sr-only while it has nothing to say). */}
      <p role="status" className={done.length ? FORM_OK : 'sr-only'}>
        {done.join(' ')}
      </p>
      {failures.map((text) => (
        <p key={text} role="alert" className={FORM_ALERT}>
          {text}
        </p>
      ))}
      {error || (saveError && !confirming) ? (
        <p role="alert" className={FORM_ALERT}>
          {error ?? saveError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <SettingsCard title={TOOL_CARDS.gmail.name} description={TOOL_CARDS.gmail.desc} logo={PROVIDER_LOGOS.gmail} list={TOOL_CARDS.gmail.name}>
          <ConnectionPart label={CONNECTIONS.PART_YOURS}>
            <GmailAccountRow />
          </ConnectionPart>
        </SettingsCard>

        {WORKSPACE_TOOLS.map((tool) => (
          <SettingsCard key={tool.id} title={TOOL_CARDS[tool.id].name} description={TOOL_CARDS[tool.id].desc} logo={PROVIDER_LOGOS[tool.id]} list={TOOL_CARDS[tool.id].name}>
            {canManage ? (
              <ConnectionPart label={CONNECTIONS.PART_WORKSPACE}>
                <WorkspaceToolRow
                  tool={tool}
                  connectors={byProvider.get(tool.id) ?? []}
                  onDisconnect={(connector) => setConfirming({ kind: 'disconnect', connector })}
                  onDisable={(connector) => setConfirming({ kind: 'disable', connector })}
                />
              </ConnectionPart>
            ) : null}
            <ConnectionPart label={CONNECTIONS.PART_YOURS}>{tool.id === 'slack' ? <SlackAccountRow /> : <JiraAccountRow />}</ConnectionPart>
          </SettingsCard>
        ))}

        <SettingsCard title={CONNECTIONS.SOON} description={CONNECTIONS.SOON_HINT}>
          <ul role="list" aria-label={CONNECTIONS.SOON} className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:px-5 lg:grid-cols-5">
            {COMING_SOON.map((tool) => (
              <li key={tool.id} data-soon={tool.id} aria-disabled="true" className="flex min-h-12 items-center gap-2 rounded-lg bg-subtle px-3 py-2 opacity-70">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center grayscale">
                  {PROVIDER_LOGOS[tool.id]}
                </span>
                <div className="flex min-w-0 flex-col">
                  <p className={`${TYPE.bodyMuted} truncate`}>{tool.name}</p>
                  <p className={`${TYPE.meta} truncate`}>{tool.category}</p>
                </div>
              </li>
            ))}
          </ul>
        </SettingsCard>
      </div>

      {confirming ? (
        confirming.kind === 'disconnect' ? (
          <ConfirmDialog
            title={`Disconnect ${confirming.connector.name}?`}
            message="It stops syncing, its credentials are removed, and agents can no longer act through it. Records already filed stay where they are."
            confirmLabel="Disconnect"
            danger
            onConfirm={async () => {
              await dispatch(disconnectConnector(confirming.connector.id)).unwrap();
            }}
            onClose={() => {
              // A refusal belongs to the dialog: it leaves with it.
              dispatch(clearConnectorSaveError());
              setConfirming(null);
            }}
          />
        ) : (
          <ConfirmDialog
            title={`Disable ${confirming.connector.name}?`}
            message="It stops syncing until you enable it again. Its credentials and the records it brought in stay."
            confirmLabel="Disable"
            onConfirm={async () => {
              await dispatch(updateConnector({ id: confirming.connector.id, is_enabled: false })).unwrap();
            }}
            onClose={() => {
              dispatch(clearConnectorSaveError());
              setConfirming(null);
            }}
          />
        )
      ) : null}
    </SettingsFrame>
  );
}
