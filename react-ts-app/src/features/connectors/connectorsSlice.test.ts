import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import reducer, { connectConnector, createConnector, disconnectConnector, setConnectorAgents, startConnectorOAuth, updateConnector } from './connectorsSlice';
import { hostOnly, uniqueName } from './connectorForm';

// Agent bundles D3 contract §5.3, D3-22. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

function answer(status: number, body: unknown) {
  const spy = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('connectors slice: agents', () => {
  const store = () => configureStore({ reducer: { connectors: reducer } });

  it('posts the switch with credentials and keeps the answered connector', async () => {
    const spy = answer(200, { id: 5, name: 'Slack', agents: { kinds: ['slack.reply'], can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' } });
    const s = store();
    const result = await s.dispatch(setConnectorAgents({ id: 5, canAct: true }));
    expect(setConnectorAgents.fulfilled.match(result)).toBe(true);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/connectors\/5\/agents\/$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({ can_act: true });
    expect(s.getState().connectors.items[0].agents?.can_act).toBe(true);
  });

  it('hands back a consent link without touching the store', async () => {
    answer(200, { authorize_url: 'https://slack.com/oauth/v2/authorize?x=1' });
    const s = store();
    const result = await s.dispatch(setConnectorAgents({ id: 5, canAct: true }));
    expect(result.payload).toEqual({ authorize_url: 'https://slack.com/oauth/v2/authorize?x=1' });
    expect(s.getState().connectors.items).toEqual([]);
  });

  it('rejects with the server sentence', async () => {
    answer(409, { code: 'JIRA_CANT_ACT', detail: "This Jira account can't create and assign issues in SUP. Give it those permissions in Jira, then try again." });
    const result = await store().dispatch(setConnectorAgents({ id: 6, canAct: true }));
    expect(result.payload).toBe("This Jira account can't create and assign issues in SUP. Give it those permissions in Jira, then try again.");
  });

  it('starts a connector sign-in with credentials', async () => {
    const spy = answer(200, { authorize_url: 'https://slack.com/oauth/v2/authorize' });
    await store().dispatch(startConnectorOAuth({ id: 5, form: { channel: 'C0SUPPORT' } }));
    expect((spy.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe('include');
  });
});

// Backend FR-7 (contract §4.3): a disconnect also turns the agents switch off.
describe('connectors slice: disconnect switches agents off', () => {
  const on = { can_act: true, needs: null, allowed_by: { id: 1, name: 'Alice' }, allowed_at: '2026-10-13T10:00:00Z' };
  async function disconnect(connector: Record<string, unknown>) {
    const spy = vi.fn(async () => ({ ok: true, status: 204, json: async () => ({}) }));
    vi.stubGlobal('fetch', spy);
    const s = configureStore({
      reducer: { connectors: reducer },
      preloadedState: { connectors: { items: [connector as never], isLoading: false, error: null, saving: false, saveError: null } },
    });
    await s.dispatch(disconnectConnector(connector.id as number));
    return s.getState().connectors.items[0];
  }

  it.each([
    ['slack', ['slack.reply'], 'token'],
    ['jira', ['jira.create', 'jira.assign'], 'permission'],
    ['zendesk', [], null],
  ])('reads %s as read only afterwards', async (provider, kinds, needs) => {
    const after = await disconnect({ id: 5, provider, has_credentials: true, status: 'connected', config: { via: 'oauth' }, agents: { kinds, ...on } });
    expect(after.agents).toEqual({ kinds, can_act: false, needs, allowed_by: null, allowed_at: null });
  });

  it('leaves a connector without an agents block alone', async () => {
    const after = await disconnect({ id: 5, provider: 'zendesk', has_credentials: true, status: 'connected', config: {} });
    expect(after.agents).toBeUndefined();
  });
});

// Live-test fixes: a form's refusal belongs to that form, not the page.
describe('connectors slice: refusals stay with their form', () => {
  const store = () => configureStore({ reducer: { connectors: reducer } });

  it('hands back a create refusal with its field messages, and leaves the page alert alone', async () => {
    answer(400, { name: ['You already have a connector with this name for this provider.'] });
    const s = store();
    const result = await s.dispatch(createConnector({ provider: 'jira', name: 'Jira Software', department: '' }));
    expect(result.payload).toEqual({
      message: 'You already have a connector with this name for this provider.',
      fields: { name: 'You already have a connector with this name for this provider.' },
    });
    expect(s.getState().connectors.saveError).toBeNull();
    expect(s.getState().connectors.saving).toBe(false);
  });

  it('keeps a detail refusal as the message with no fields', async () => {
    answer(400, { detail: 'No room.' });
    const result = await store().dispatch(createConnector({ provider: 'jira', name: 'Jira Software' }));
    expect(result.payload).toEqual({ message: 'No room.', fields: {} });
  });

  it('leaves a connect refusal to the form', async () => {
    answer(400, { detail: "'x' is not a valid atlassian.net tenant." });
    const s = store();
    const result = await s.dispatch(connectConnector({ id: 6, form: { site: 'x' } }));
    expect(result.payload).toBe("'x' is not a valid atlassian.net tenant.");
    expect(s.getState().connectors.saveError).toBeNull();
  });

  it('leaves a department refusal to its form, but still shows an enable refusal on the page', async () => {
    answer(400, { department: ['Choose a department.'] });
    const s = store();
    await s.dispatch(updateConnector({ id: 6, department: 'cs' }));
    expect(s.getState().connectors.saveError).toBeNull();
    answer(400, { detail: 'Not allowed.' });
    await s.dispatch(updateConnector({ id: 6, is_enabled: false }));
    expect(s.getState().connectors.saveError).toBe('Not allowed.');
  });
});

describe('connector form helpers', () => {
  it('names a new connection after its provider, numbered when taken', () => {
    expect(uniqueName('Jira Software', [])).toBe('Jira Software');
    expect(uniqueName('Jira Software', ['jira software '])).toBe('Jira Software 2');
    expect(uniqueName('Jira Software', ['Jira Software', 'Jira Software 2'])).toBe('Jira Software 3');
  });

  it('keeps just the host of a pasted URL', () => {
    expect(hostOnly('https://Acme.atlassian.net/jira/software/projects/SUP/boards/1?x=1')).toBe('acme.atlassian.net');
    expect(hostOnly(' acme.atlassian.net/ ')).toBe('acme.atlassian.net');
    expect(hostOnly('acme')).toBe('acme');
    expect(hostOnly('http://acme.zendesk.com#top')).toBe('acme.zendesk.com');
  });
});
