import { useEffect, useState, type FormEvent } from 'react';
import { useAppDispatch } from '../../hooks';
import { createConnector, fetchConnectors, syncConnector, updateConnector, type Connector } from '../../features/connectors/connectorsSlice';
import { TOOL, WORKSPACE_TOOLS, primaryConnector } from '../../features/connectors/connectionsText';
import { FUNCTION_LABELS, type UserFunction } from '../../features/auth/authSlice';
import { CHANNELS, scopeText } from '../../features/connectors/slackChannels';
import { formatDate } from '../../features/customers/formatters';
import { AgentAccess } from './AgentAccess';
import { ConnectSourceForm } from './ConnectSourceForm';
import { ConnectionRow } from './ConnectionRow';
import { SlackChannelsPanel } from './SlackChannelsPanel';
import { PROVIDER_LOGOS } from './providerLogos';
import { BUTTON, FIELD_ERROR, FORM_ALERT, PRIMARY, QUIET, Select, type UiAction } from '../ui';

const DEPARTMENTS: (UserFunction | '')[] = ['cs', 'engineering', 'sales', 'analytics', 'leadership', 'other', ''];
const departmentLabel = (d: UserFunction | '') => (d ? FUNCTION_LABELS[d] : 'Whole company');
const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: departmentLabel(d) }));

/** Who may read a source's records: its department and Leadership, or everyone. */
function visibleLabel(d: UserFunction | ''): string {
  if (!d) return 'visible to the whole company';
  if (d === 'leadership') return 'visible to Leadership';
  return `visible to ${FUNCTION_LABELS[d]} and Leadership`;
}

/** How a Slack connection files messages (Slack escalations D1 Decision 6). */
function slackScope(c: Connector): string | null {
  if (c.provider !== 'slack') return null;
  const counts = scopeText(c);
  if (counts) return counts;
  if (c.is_organisation_wide) return 'files each message under the customer it names';
  const one = c.customers.length + c.accounts.length === 1 ? (c.customers[0] ?? c.accounts[0]) : null;
  return one ? `files messages under ${one.name}` : null;
}

function countText(c: Connector): string | null {
  const n = c.ticket_count || 0;
  if (!n) return null;
  const noun = c.provider === 'slack' ? (n === 1 ? 'conversation' : 'conversations') : n === 1 ? 'ticket' : 'tickets';
  return `${n} ${noun}`;
}

function stateOf(c: Connector | null): { text: string; danger: boolean } {
  if (!c) return { text: TOOL.NOT_CONNECTED, danger: false };
  const count = countText(c);
  if (!c.is_enabled) return { text: ['Disabled', count].filter(Boolean).join(' · '), danger: false };
  if (c.status === 'error') return { text: `Stopped working: ${c.error}`, danger: true };
  if (!c.has_credentials) return { text: [TOOL.NOT_CONNECTED, count ? `${count} ${TOOL.ALREADY_HERE}` : null].filter(Boolean).join(' · '), danger: false };
  const synced = c.last_synced_at ? `synced ${formatDate(c.last_synced_at.slice(0, 10))}` : 'first sync within 10 minutes';
  return { text: ['Connected', synced, count, slackScope(c), visibleLabel(c.department)].filter(Boolean).join(' · '), danger: false };
}

/** "Change who sees it": a source's department, after it is made. */
function DepartmentForm({ connector, onDone }: { connector: Connector; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const [department, setDepartment] = useState<UserFunction | ''>(connector.department);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const selectId = `who-sees-${connector.id}`;

  useEffect(() => {
    document.getElementById(selectId)?.focus();
  }, [selectId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (department === connector.department) return onDone();
    setBusy(true);
    setRefused(null);
    const result = await dispatch(updateConnector({ id: connector.id, department }));
    setBusy(false);
    if (updateConnector.fulfilled.match(result)) onDone();
    else setRefused(result.payload ?? 'Could not change who sees it.');
  }

  return (
    <form onSubmit={save} aria-label={`Change who sees ${connector.name}`} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-col gap-1.5 sm:w-56">
        <Select
          id={selectId}
          label={`Who sees ${connector.name}`}
          value={department}
          onChange={(value) => {
            setDepartment(value);
            setRefused(null);
          }}
          options={DEPARTMENT_OPTIONS}
          invalid={Boolean(refused)}
        />
        {refused ? (
          <p role="alert" className={FIELD_ERROR}>
            {refused}
          </p>
        ) : null}
      </div>
      <button type="button" onClick={onDone} className={QUIET}>
        Cancel
      </button>
      <button type="submit" aria-disabled={busy || undefined} className={PRIMARY}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

type Panel = null | 'connect' | 'channels' | 'department';

/**
 * "Workspace › Slack" or "Workspace › Jira" (spec 2026-10-16 §2–3): the one
 * connection an admin makes for the whole company. Connect hands the
 * existing connection (seeded ones included) its credentials; there is no
 * "Add another" here. Shown to manage_integrations only.
 */
export function WorkspaceToolRow({
  tool,
  connectors,
  onDisconnect,
  onDisable,
}: {
  tool: (typeof WORKSPACE_TOOLS)[number];
  connectors: Connector[];
  onDisconnect: (connector: Connector) => void;
  onDisable: (connector: Connector) => void;
}) {
  const dispatch = useAppDispatch();
  const connector = primaryConnector(connectors);
  const [panel, setPanel] = useState<Panel>(null);
  const [creating, setCreating] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const state = stateOf(connector);

  async function connect() {
    setRefused(null);
    if (connector) return setPanel('connect');
    if (creating) return;
    setCreating(true);
    const result = await dispatch(createConnector({ provider: tool.id, name: tool.name, department: '' }));
    setCreating(false);
    if (createConnector.fulfilled.match(result)) setPanel('connect');
    else setRefused(result.payload?.message ?? `Could not connect ${tool.name}.`);
  }

  const connected = Boolean(connector?.has_credentials) && connector?.status !== 'error';
  let action = null;
  if (connector && !connector.is_enabled) {
    action = (
      <button type="button" onClick={() => void dispatch(updateConnector({ id: connector.id, is_enabled: true }))} className={BUTTON}>
        Enable
      </button>
    );
  } else if (connected && connector) {
    action = (
      <button type="button" onClick={() => void dispatch(syncConnector(connector.id))} className={BUTTON}>
        {TOOL.SYNC}
      </button>
    );
  } else if (panel !== 'connect') {
    action = (
      <button type="button" onClick={() => void connect()} aria-disabled={creating || undefined} className={PRIMARY}>
        {connector?.status === 'error' ? TOOL.RECONNECT : TOOL.CONNECT}
      </button>
    );
  }

  const menu: UiAction[] = connector
    ? [
        ...(connected && panel !== 'connect' ? [{ key: 'reconnect', label: TOOL.RECONNECT, onSelect: () => setPanel('connect') }] : []),
        ...(tool.id === 'slack' && connector.has_credentials ? [{ key: 'channels', label: CHANNELS.MENU, onSelect: () => setPanel('channels') }] : []),
        { key: 'department', label: 'Change who sees it', onSelect: () => setPanel('department') },
        ...(connector.is_enabled ? [{ key: 'disable', label: 'Disable', onSelect: () => (connected ? onDisable(connector) : void dispatch(updateConnector({ id: connector.id, is_enabled: false }))) }] : []),
        ...(connector.has_credentials ? [{ key: 'disconnect', label: 'Disconnect', onSelect: () => onDisconnect(connector), danger: true }] : []),
      ]
    : [];

  const close = () => setPanel(null);
  const menuLabel = `More for ${tool.name} (workspace)`;
  const closeChannels = () => {
    close();
    // The menu's button stays mounted; hand focus back to it.
    document.querySelector<HTMLElement>(`[aria-label="${menuLabel}"]`)?.focus();
  };
  const body =
    refused || (connector && (panel || (connector.has_credentials && connector.agents))) ? (
      <div className="flex flex-col gap-3">
        {refused ? (
          <p role="alert" className={FORM_ALERT}>
            {refused}
          </p>
        ) : null}
        {connector && panel === 'connect' ? <ConnectSourceForm connector={connector} onDone={close} /> : null}
        {connector && panel === 'channels' ? (
          <SlackChannelsPanel connectorId={connector.id} onReconnect={() => setPanel('connect')} onChanged={() => void dispatch(fetchConnectors())} onDone={closeChannels} />
        ) : null}
        {connector && panel === 'department' ? <DepartmentForm connector={connector} onDone={close} /> : null}
        {connector?.has_credentials && connector.agents && !panel ? <AgentAccess connector={connector} canManage /> : null}
      </div>
    ) : null;

  return (
    <ConnectionRow
      id={`workspace-${tool.id}`}
      logo={PROVIDER_LOGOS[tool.id]}
      name={tool.name}
      state={state.text}
      stateTone={state.danger ? 'danger' : 'neutral'}
      desc={tool.desc}
      action={action}
      menu={menu}
      menuLabel={menuLabel}
    >
      {body}
    </ConnectionRow>
  );
}

