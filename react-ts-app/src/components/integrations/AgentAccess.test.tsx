import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import connectorsReducer, { disconnectConnector, type Connector } from '../../features/connectors/connectorsSlice';
import { AgentAccess } from './AgentAccess';

// Agent bundles D3 contract §5.3; frontend Decision 10. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

const jira = { id: 6, provider: 'jira', provider_display: 'Jira Software', name: 'Jira', agents: { kinds: ['jira.create', 'jira.assign'], can_act: false, needs: 'permission', allowed_by: null, allowed_at: null } } as Connector;
const slack = { id: 5, provider: 'slack', provider_display: 'Slack', name: 'Support Slack', agents: { kinds: ['slack.reply'], can_act: false, needs: 'consent', allowed_by: null, allowed_at: null } } as Connector;

function answer(status: number, body: unknown) {
  const spy = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function show(connector: Connector, canManage = true) {
  const store = configureStore({ reducer: { connectors: connectorsReducer }, preloadedState: { connectors: { items: [connector], isLoading: false, error: null, saving: false, saveError: null } } });
  render(
    <Provider store={store}>
      <AgentAccess connector={store.getState().connectors.items[0]} canManage={canManage} />
    </Provider>,
  );
  return store;
}

describe('AgentAccess', () => {
  it('allows Jira to act', async () => {
    answer(200, { ...jira, agents: { ...jira.agents, can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' } });
    const store = show(jira);
    await userEvent.click(screen.getByRole('button', { name: 'Allow agents to act' }));
    expect(await screen.findByRole('button', { name: 'Make read only' })).toBeInTheDocument();
    expect(store.getState().connectors.items[0].agents?.can_act).toBe(true);
  });

  it("shows Jira's refusal verbatim", async () => {
    answer(409, { code: 'JIRA_CANT_ACT', detail: "This Jira account can't create and assign issues in SUP. Give it those permissions in Jira, then try again." });
    show(jira);
    await userEvent.click(screen.getByRole('button', { name: 'Allow agents to act' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("This Jira account can't create and assign issues in SUP.");
  });

  it("sends the browser to Slack's consent", async () => {
    answer(200, { authorize_url: 'https://slack.com/oauth/v2/authorize?state=s' });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    show(slack);
    await userEvent.click(screen.getByRole('button', { name: 'Allow agents to act' }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://slack.com/oauth/v2/authorize?state=s'));
    // Still busy during the redirect, so a second click can't start another consent.
    expect(screen.getByRole('button', { name: 'Allowing…' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a member reads the state, with no button', () => {
    show(jira, false);
    expect(screen.getByText('Agents: Read only')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('a member sees no action hint without the switch', () => {
    const token = { ...slack, agents: { ...slack.agents!, needs: 'token' } } as Connector;
    show(token, false);
    expect(screen.getByText('Agents: Read only')).toBeInTheDocument();
    expect(screen.queryByText(/Needs a Slack bot token/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('a manager sees the hint beside the switch', () => {
    const token = { ...slack, agents: { ...slack.agents!, needs: 'token' } } as Connector;
    show(token, true);
    expect(screen.getByText('Needs a Slack bot token that can post (chat:write).')).toBeInTheDocument();
  });
  it('a tool agents cannot act in yet has no switch', () => {
    const zendesk = { ...jira, id: 3, provider: 'zendesk', provider_display: 'Zendesk', name: 'Zendesk', agents: { kinds: [], can_act: false, needs: null, allowed_by: null, allowed_at: null } } as Connector;
    show(zendesk, true);
    expect(screen.getByText('Agents: Read only')).toBeInTheDocument();
    expect(screen.getByText("Agents can't act in Zendesk yet.")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reads Read only once the connection is disconnected', async () => {
    const live = { ...slack, has_credentials: true, agents: { ...slack.agents!, can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' } } as Connector;
    const store = configureStore({ reducer: { connectors: connectorsReducer }, preloadedState: { connectors: { items: [live], isLoading: false, error: null, saving: false, saveError: null } } });
    const Row = () => <AgentAccess connector={useSelector((s: ReturnType<typeof store.getState>) => s.connectors.items[0])} canManage />;
    render(<Provider store={store}><Row /></Provider>);
    expect(screen.getByText('Agents: Can act · Allowed by Alice')).toBeInTheDocument();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204, json: async () => ({}) })));
    await act(async () => { await store.dispatch(disconnectConnector(5)); });
    expect(screen.getByText('Agents: Read only')).toBeInTheDocument();
  });

  it('shows the reconnect hint and no Allow button while the tool is broken (R2D1-10)', () => {
    show({ ...slack, agents: { ...slack.agents!, can_act: false, needs: 'reconnect' } } as Connector);
    expect(screen.getByText('Reconnect Slack before agents can act.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow agents to act' })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a tool that can act but is broken shows the hint and still offers Make read only', () => {
    show({ ...slack, agents: { ...slack.agents!, can_act: true, needs: 'reconnect', allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' } } as Connector);
    expect(screen.getByText('Reconnect Slack before agents can act.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make read only' })).toBeInTheDocument();
  });

  it('shows the reconnect hint to managers only', () => {
    show({ ...slack, agents: { ...slack.agents!, can_act: false, needs: 'reconnect' } } as Connector, false);
    expect(screen.queryByText('Reconnect Slack before agents can act.')).toBeNull();
  });
});
