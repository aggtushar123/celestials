import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import connectorsReducer from '../../features/connectors/connectorsSlice';
import mailReducer from '../../features/mail/mailSlice';
import { Integrations } from './Integrations';
import { capabilitiesForRole } from '../../test/capabilities';

// Unit + integration tier for Settings › Connections (spec 2026-10-16):
// Your accounts (Gmail, Slack link, Jira link), Workspace (Slack, Jira) for
// manage_integrations only, and Coming soon without buttons. Only fetch is
// stubbed, with the API's shapes.

const slackSetup = {
  key: 'slack', label: 'Slack', uses_oauth: true, help: 'Invite the bot to the channel.',
  fields: [{ name: 'channel', label: 'Channel ID', secret: false, placeholder: 'C0123ABCD', required: true }],
};
const jiraSetup = {
  key: 'jira', label: 'Jira Software', uses_oauth: false, help: '',
  fields: [
    { name: 'site', label: 'Jira site', secret: false, placeholder: 'acme', required: true },
    { name: 'email', label: 'Atlassian account email', secret: false, placeholder: '', required: true },
    { name: 'api_token', label: 'API token', secret: true, placeholder: '', required: true },
  ],
};
const base = {
  is_enabled: true, customers: [], accounts: [], is_organisation_wide: true, call_count: 0, last_record_at: null,
  created_at: '2026-10-01T00:00:00Z', department: '' as const, department_display: '', config: {}, error: '',
  last_sync_note: '', last_synced_at: null,
};
/** The seeded Slack connection: demo conversations, no credentials. */
const seededSlack = {
  ...base, id: 11, provider: 'slack' as const, provider_display: 'Slack', name: 'Slack', ticket_count: 158,
  has_credentials: false, status: 'not_connected' as const, setup: slackSetup,
};
const connectedSlack = { ...seededSlack, has_credentials: true, status: 'connected' as const, last_synced_at: '2026-10-16T09:00:00Z' };
const zoom = { ...base, id: 12, provider: 'zoom' as const, provider_display: 'Zoom', name: 'Zoom', ticket_count: 169, call_count: 180, has_credentials: false, status: 'not_connected' as const, setup: null };

const GMAIL_PROVIDERS = [
  { key: 'google', label: 'Google Workspace / Gmail', uses_oauth: true, gate: 'GMAIL_NOT_ENABLED' },
  { key: 'imap', label: 'IMAP/SMTP', uses_oauth: false, gate: null },
];
const IMAP_CONNECTION = {
  id: 1, provider: 'imap', provider_display: 'IMAP/SMTP', address: 'tushar@gmail.com', status: 'connected', error: '',
  last_synced_at: '2026-10-16T09:00:00Z', paused_reason: null, two_way: false, push: null, import: null, needs_reconnect: false, signature: '',
};

type Opts = {
  connectors?: unknown[];
  mail?: unknown;
  slackLink?: unknown | 'missing';
  jiraLink?: unknown;
};

function mockApi(opts: Opts = {}) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: true, status, json: async () => body });
    const method = init?.method ?? 'GET';
    if (url.includes('/connectors/slack-link/')) {
      if (opts.slackLink === 'missing') return Promise.resolve({ ok: false, status: 404, json: async () => ({ detail: 'Not found.' }) });
      if (method === 'POST') return ok({ authorize_url: 'https://slack.com/oauth/v2/authorize?state=x' });
      if (method === 'DELETE') return Promise.resolve({ ok: true, status: 204, json: async () => undefined });
      return ok(opts.slackLink ?? { configured: true, workspace_connected: true, link: null });
    }
    if (url.includes('/connectors/jira-link/')) return ok(opts.jiraLink ?? { configured: true, connectors: [], link: null });
    if (url.includes('/mail/connect/imap/')) {
      const body = JSON.parse(String(init?.body));
      return ok({ ...IMAP_CONNECTION, address: body.address });
    }
    if (url.includes('/mail/connection/')) return ok(opts.mail ?? { connection: null, disconnected: null, providers: GMAIL_PROVIDERS });
    if (method === 'POST' && /\/connectors\/\d+\/connect\/$/.test(url)) return ok({ authorize_url: 'https://slack.com/oauth/v2/authorize?state=ws' });
    if (method === 'POST' && url.endsWith('/sync/')) return ok({ ...connectedSlack, created: 1, updated: 0, unmatched: 0 });
    if (method === 'POST' && url.endsWith('/connectors/')) {
      const body = JSON.parse(String(init?.body));
      return ok({ ...base, id: 21, provider: body.provider, provider_display: 'Jira Software', name: body.name, ticket_count: 0, has_credentials: false, status: 'not_connected', setup: jiraSetup }, 201);
    }
    return ok(opts.connectors ?? [seededSlack, zoom]);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderPage(role: 'admin' | 'csm' = 'admin', url = '/settings/connections') {
  window.history.replaceState({}, '', url);
  const store = configureStore({
    reducer: { auth: authReducer, connectors: connectorsReducer, mail: mailReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'tushar@alfee.io', name: 'Tushar', avatar: '', role, role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Alfee', slug: 'alfee', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Integrations />
      </MemoryRouter>
    </Provider>,
  );
}

const section = (name: string) => screen.getByRole('list', { name });
const row = (list: string, name: string) => within(section(list)).getByRole('group', { name });
const calls = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === method && url.includes(path));

describe('Settings › Connections', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows one card per tool (Gmail, Slack, Jira), each with its parts, then Coming soon tiles without buttons', async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(within(row('Gmail', 'Your account')).getByRole('button', { name: 'Connect Gmail' })).toBeInTheDocument());
    const cards = screen.getAllByRole('region').map((r) => within(r).getByRole('heading', { level: 2 }).textContent);
    expect(cards).toEqual(['Gmail', 'Slack', 'Jira', 'Coming soon']);
    expect(within(section('Gmail')).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Your account']);
    expect(within(section('Slack')).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Workspace', 'Your account']);
    expect(within(section('Jira')).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Workspace', 'Your account']);
    const soon = section('Coming soon');
    expect(within(soon).getAllByRole('listitem')).toHaveLength(10);
    expect(within(soon).getByText('Zoom')).toBeInTheDocument();
    expect(within(soon).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add another' })).toBeNull();
  });

  it('hides the Workspace section from someone without manage_integrations, and never loads connectors for them', async () => {
    const spy = mockApi();
    renderPage('csm');

    await screen.findByRole('button', { name: 'Connect Gmail' });
    expect(screen.queryByRole('group', { name: 'Workspace' })).toBeNull();
    expect(within(section('Slack')).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Your account']);
    expect(calls(spy, 'GET', '/connectors/').filter(([url]) => /\/connectors\/$/.test(url))).toHaveLength(0);
  });

  it('connects Gmail with an app password: Gmail hosts filled in, password never kept', async () => {
    const spy = mockApi();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Gmail' }));
    const form = screen.getByRole('form', { name: 'Connect Gmail' });
    expect(within(form).getByRole('link', { name: 'Create an app password' })).toHaveAttribute('href', 'https://myaccount.google.com/apppasswords');
    await userEvent.type(within(form).getByLabelText('Gmail address'), 'tushar@gmail.com');
    await userEvent.type(within(form).getByLabelText('App password'), 'abcd efgh ijkl mnop');
    await userEvent.click(within(form).getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(calls(spy, 'POST', '/mail/connect/imap/')).toHaveLength(1));
    expect(JSON.parse(String(calls(spy, 'POST', '/mail/connect/imap/')[0][1]?.body))).toEqual({
      address: 'tushar@gmail.com', password: 'abcd efgh ijkl mnop', imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587,
    });
    expect(await within(row('Gmail', 'Your account')).findByText(/tushar@gmail\.com · synced/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Connect Gmail' })).toBeNull();
  });

  it('says why Google sign-in is not offered yet while the workspace is not enabled for two-way Gmail', async () => {
    mockApi();
    renderPage();

    const gmail = await waitFor(() => row('Gmail', 'Your account'));
    await within(gmail).findByRole('button', { name: 'Connect Gmail' });
    expect(within(section('Gmail')).getByText(/isn't enabled for Gmail yet.*Until then, connect with an app password\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Connect Google/ })).toBeNull();
  });

  it('a connected mailbox offers Sync now, with Disconnect in its menu behind a confirm', async () => {
    const spy = mockApi({ mail: { connection: IMAP_CONNECTION, disconnected: null, providers: GMAIL_PROVIDERS } });
    renderPage();

    const gmail = await waitFor(() => row('Gmail', 'Your account'));
    await within(gmail).findByRole('button', { name: 'Sync now' });
    await userEvent.click(within(gmail).getByRole('button', { name: 'More for Gmail' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disconnect tushar@gmail.com?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls(spy, 'DELETE', '/mail/connection/')).toHaveLength(0);
  });

  it('Workspace › Slack connects the seeded connection, keeping its demo conversations, without making another', async () => {
    const spy = mockApi();
    renderPage();

    const slack = await waitFor(() => row('Slack', 'Workspace'));
    expect(within(slack).getByText('Not connected · 158 conversations already here')).toBeInTheDocument();
    await userEvent.click(within(slack).getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('form', { name: 'Connect Slack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Slack' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/connectors/').filter(([url]) => /\/connectors\/$/.test(url))).toHaveLength(0);
  });

  it('Sign in with Slack asks for the channel first, then signs in with it (no trip to Slack that can only fail)', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const spy = mockApi();
    renderPage();

    const slack = await waitFor(() => row('Slack', 'Workspace'));
    await userEvent.click(within(slack).getByRole('button', { name: 'Connect' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Slack' }));
    expect(screen.getByLabelText('Channel ID')).toBeInvalid();
    expect(calls(spy, 'POST', '/connect/')).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Channel ID'), 'C0123ABCD');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Slack' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://slack.com/oauth/v2/authorize?state=ws'));
    expect(JSON.parse(String(calls(spy, 'POST', '/connect/')[0][1]?.body))).toEqual({ channel: 'C0123ABCD', oauth: true });
  });

  it('Workspace › Jira with no connection makes one, then asks for its credentials', async () => {
    const spy = mockApi();
    renderPage();

    const jira = await waitFor(() => row('Jira', 'Workspace'));
    expect(within(jira).getByText('Not connected')).toBeInTheDocument();
    await userEvent.click(within(jira).getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(calls(spy, 'POST', '/connectors/').filter(([url]) => /\/connectors\/$/.test(url))).toHaveLength(1));
    expect(JSON.parse(String(calls(spy, 'POST', '/connectors/')[0][1]?.body))).toEqual({ provider: 'jira', name: 'Jira', department: '' });
    expect(await screen.findByLabelText('API token')).toBeInTheDocument();
  });

  it('a connected workspace Slack says so in words, syncs on demand, and asks before disconnecting', async () => {
    const spy = mockApi({ connectors: [connectedSlack] });
    renderPage();

    const slack = await waitFor(() => row('Slack', 'Workspace'));
    await waitFor(() => expect(within(slack).getByText(/^Connected · synced .* · 158 conversations · files each message under the customer it names · visible to the whole company$/)).toBeInTheDocument());
    await userEvent.click(within(slack).getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(calls(spy, 'POST', '/sync/')).toHaveLength(1));
    await userEvent.click(within(slack).getByRole('button', { name: 'More for Slack (workspace)' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));
    expect(await screen.findByRole('dialog', { name: 'Disconnect Slack?' })).toBeInTheDocument();
  });

  it('Your accounts › Slack links the person, and an older backend shows it as not available', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const spy = mockApi();
    renderPage();

    const slack = await waitFor(() => row('Slack', 'Your account'));
    await userEvent.click(await within(slack).findByRole('button', { name: 'Link Slack' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://slack.com/oauth/v2/authorize?state=x'));
    expect(calls(spy, 'POST', '/connectors/slack-link/')).toHaveLength(1);
  });

  it('Your accounts › Slack before the backend has it: no button, plain words', async () => {
    mockApi({ slackLink: 'missing' });
    renderPage();

    const slack = await waitFor(() => row('Slack', 'Your account'));
    expect(await within(slack).findByText('Not available on this deployment yet')).toBeInTheDocument();
    expect(within(slack).queryByRole('button')).toBeNull();
  });

  it('Your accounts › Slack waits for the workspace connection, and shows a linked person with Unlink', async () => {
    mockApi({ slackLink: { configured: true, workspace_connected: false, link: null } });
    renderPage();
    const waiting = await waitFor(() => row('Slack', 'Your account'));
    expect(await within(waiting).findByText('Available once an admin connects Slack for the workspace')).toBeInTheDocument();
  });

  it('a linked Slack account shows who, with Unlink behind a confirm', async () => {
    mockApi({ slackLink: { configured: true, workspace_connected: true, link: { name: 'Tushar', slack_user_id: 'U1', team_id: 'T1', status: 'linked', linked_at: '2026-10-16T10:00:00Z' } } });
    renderPage();
    const slack = await waitFor(() => row('Slack', 'Your account'));
    expect(await within(slack).findByText('Linked as Tushar')).toBeInTheDocument();
    await userEvent.click(within(slack).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByRole('dialog', { name: 'Unlink your Slack account?' })).toBeInTheDocument();
  });

  it('a linked Jira account shows who and where it acts', async () => {
    mockApi({
      jiraLink: {
        configured: true,
        connectors: [{ id: 6, name: 'Jira', host: 'alfiee.atlassian.net' }],
        link: { name: 'Tushar', email: '', status: 'linked', sites: [], covers: [6], linked_at: '2026-10-16T10:00:00Z' },
      },
    });
    renderPage();
    const jira = await waitFor(() => row('Jira', 'Your account'));
    expect(await within(jira).findByText('Linked as Tushar · Jira')).toBeInTheDocument();
    expect(within(jira).getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
  });

  it('says when Slack sends the person back linked, in the one status region', async () => {
    mockApi();
    renderPage('admin', '/settings/connections?slack_link=linked');
    expect(await screen.findByText('Slack account linked.')).toHaveAttribute('role', 'status');
  });
});
