import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import connectorsReducer, { type Connector } from '../../features/connectors/connectorsSlice';
import { WORKSPACE_TOOLS } from '../../features/connectors/connectionsText';
import { stubSlackChannels } from '../../features/connectors/testSlackChannels';
import { WorkspaceToolRow } from './WorkspaceToolRow';

afterEach(() => vi.unstubAllGlobals());

const SLACK = {
  id: 7, provider: 'slack', provider_display: 'Slack', name: 'Slack', is_enabled: true,
  department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true,
  ticket_count: 12, conversation_count: 12, call_count: 0, last_record_at: null, created_at: '2026-10-01T00:00:00Z',
  has_credentials: true, config: {}, status: 'connected', error: '', last_synced_at: '2026-10-17T09:30:00Z', last_sync_note: '',
  setup: { key: 'slack', label: 'Slack', uses_oauth: true, help: '', fields: [{ name: 'bot_token', label: 'Bot token', secret: true, placeholder: 'xoxb-…', required: false }] },
  slack_channels: { synced: 3, total: 4, can_join: true, events_at: '2026-10-17T09:25:00Z' },
} as unknown as Connector;

function renderRow(connector: Connector) {
  const store = configureStore({ reducer: { auth: authReducer, connectors: connectorsReducer } });
  const tool = WORKSPACE_TOOLS.find((t) => t.id === 'slack')!;
  render(
    <Provider store={store}>
      <ul>
        <WorkspaceToolRow tool={tool} connectors={[connector]} onDisconnect={vi.fn()} onDisable={vi.fn()} />
      </ul>
    </Provider>,
  );
}

describe('The Slack row (frontend Decisions 1 and 5)', () => {
  it('says how many channels it syncs and opens Choose channels', async () => {
    stubSlackChannels();
    renderRow(SLACK);
    expect(screen.getByText(/syncs 3 of 4 public channels/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More for Slack (workspace)' }));
    expect(screen.queryByRole('menuitem', { name: 'Choose its customer' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose channels' }));
    expect(await screen.findByText('#all-alfiee')).toBeInTheDocument();
  });

  it('an older backend keeps the D1 words', () => {
    renderRow({ ...SLACK, slack_channels: undefined } as Connector);
    expect(screen.getByText(/files each message under the customer it names/)).toBeInTheDocument();
  });

  it('Approve again opens the reconnect form', async () => {
    stubSlackChannels({ canJoin: false });
    renderRow({ ...SLACK, slack_channels: { synced: 2, total: 4, can_join: false, events_at: null } } as Connector);
    await userEvent.click(screen.getByRole('button', { name: 'More for Slack (workspace)' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose channels' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve again' }));
    expect(within(screen.getByRole('group', { name: /Slack|Workspace/ }).closest('li') as HTMLElement).getByRole('button', { name: /Sign in with Slack/ })).toBeInTheDocument();
  });

  it('Done closes Choose channels, shows Agent access again and returns focus to the menu', async () => {
    stubSlackChannels();
    renderRow({ ...SLACK, agents: { can_act: false, kinds: ['reply'], needs: null } } as unknown as Connector);
    const trigger = screen.getByRole('button', { name: 'More for Slack (workspace)' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose channels' }));
    await screen.findByText('#all-alfiee');
    expect(screen.queryByText(/Agents: Read only/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('#all-alfiee')).toBeNull();
    expect(screen.getByText(/Agents: Read only/)).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
