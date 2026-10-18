import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../store';
import authReducer, { type User } from '../features/auth/authSlice';
import platformReducer from '../features/platform/platformSlice';
import { KeepLocation } from '../pages/settings/redirects';
import { GmailAccountRow } from '../components/integrations/GmailAccountRow';
import CommunicationsPage from '../pages/communications/CommunicationsPage';
import { RequirePlatform } from '../components/auth/RequirePlatform';
import { PlatformLayout } from '../layouts/PlatformLayout';
import { PlatformOverview } from '../pages/platform/PlatformOverview';
import { PlatformOrganisations } from '../pages/platform/PlatformOrganisations';
import { PlatformOrganisationDetail } from '../pages/platform/PlatformOrganisationDetail';
import { calls } from '../features/agents/testAgents';
import { GOOGLE, MAIL_SUMMARY, stubMail } from '../features/mail/testMail';
import { CSP_BLOCKED, CSP_IMAGES } from '../pages/communications/mailHtml';

// End-to-end tier (jsdom, no browser; .claude/skills/testing): the real
// routes, store and pages for two-way Gmail delivery 1. Only fetch is
// stubbed, with the contract's shapes (stubMail; a small portal stub below).

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,stub' } }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function app(url: string, store = configureStore({ reducer: rootReducer })) {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/integrations" element={<KeepLocation to="/settings/connections" />} />
          <Route path="/settings/connections" element={<ul>
                <GmailAccountRow />
              </ul>} />
          <Route path="/communications" element={<CommunicationsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { assign, store };
}

const fact = (name: string) => screen.getByText(name, { selector: 'dt' }).nextElementSibling?.textContent ?? null;

describe('Two-way Gmail D1 journeys', () => {
  it('a refused connect says the domain is wrong, and Connect Google tries again', { timeout: 30000 }, async () => {
    stubMail({ connection: null });
    const { assign } = app(`/integrations?mailbox=refused&code=WRONG_DOMAIN&detail=${encodeURIComponent('Connect your pizzahut.com account.')}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connect your pizzahut.com account.');
    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Workspace / Gmail' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example/google?state=x'));
  });

  it('after connecting, the import runs to done and Sync now waits for the tick', { timeout: 30000 }, async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { state, spy } = stubMail();
    app('/integrations?mailbox=connected');
    // By text: the loading skeleton is a status region too while the card loads.
    expect(await screen.findByText('Mailbox connected.')).toBeInTheDocument();
    await waitFor(() => expect(fact('Import')).toBe('Importing mail: 4,210 of about 18,000'));
    state.connection!.import = { state: 'done', imported: 9800, total_estimate: 18000, done_at: '2026-10-10T11:00:00Z' };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    await waitFor(() => expect(fact('Import')).toBe('Mail from the last 12 months is imported.'));
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByRole('button', { name: 'Syncing…' })).toHaveAttribute('aria-disabled', 'true');
    state.connection!.last_synced_at = '2026-10-10T11:05:00Z';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(await screen.findByRole('button', { name: 'Sync now' })).not.toHaveAttribute('aria-disabled');
    expect(calls(spy, 'POST', '/mail/sync/')).toHaveLength(1);
  });

  it('a Google mailbox says whether Calendar is connected', { timeout: 30000 }, async () => {
    stubMail({ calendar: { calendar: 'connected', last_synced_at: '2026-10-17T09:19:00Z' } });
    app('/settings/connections');
    await waitFor(() => expect(fact('Calendar')).toBe('Connected · synced 17 Oct 2026'));
    expect(screen.queryByRole('button', { name: 'Add Calendar' })).toBeNull();
  });

  it('Gmail connected before Calendar existed offers Add Calendar, which reruns Google consent', { timeout: 30000 }, async () => {
    stubMail({ calendar: { calendar: 'needs_consent', last_synced_at: null } });
    const { assign } = app('/settings/connections');
    await waitFor(() => expect(fact('Calendar')).toContain('Not added'));
    await userEvent.click(screen.getByRole('button', { name: 'Add Calendar' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example/google?state=x'));
  });

  it('no Calendar line when the backend has no Calendar', { timeout: 30000 }, async () => {
    stubMail();
    app('/settings/connections');
    await waitFor(() => expect(fact('Two-way')).not.toBeNull());
    expect(screen.queryByText('Calendar', { selector: 'dt' })).toBeNull();
  });

  it('a workspace switched off pauses the mailbox: Connections, the inbox and a reply all say why', { timeout: 30000 }, async () => {
    stubMail({ connection: { ...GOOGLE, paused_reason: 'workspace_off' }, summary: { ...MAIL_SUMMARY, paused_reason: 'workspace_off' } });
    const { store } = app('/settings/connections');
    await waitFor(() => expect(fact('Status')).toBe("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support."));
    expect(screen.getByRole('button', { name: 'Sync now' })).toHaveAttribute('aria-disabled', 'true');

    cleanup();
    app('/communications?source=mailbox:google', store);
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    expect(await within(mailbox).findByText("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.")).toBeInTheDocument();
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Ann Lee' }));
    const message = await within(mailbox).findByRole('region', { name: 'Conversation' });
    // Two-way Gmail writes through the composer (D3); a draft may be saved while paused, the send says why.
    await userEvent.click(within(message).getByRole('button', { name: 'Reply' }));
    const composer = await within(mailbox).findByRole('region', { name: 'Reply' });
    await within(composer).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(composer).getByRole('button', { name: 'Send' }));
    expect(await within(composer).findByRole('alert')).toHaveTextContent(
      "Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.",
    );
  });

  it('an HTML message opens with remote images blocked, and Show images lets them in', { timeout: 30000 }, async () => {
    stubMail();
    app('/communications?source=mailbox:google');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const list = await within(mailbox).findByRole('region', { name: 'Mail' });
    expect(within(list).getAllByRole('group', { name: 'Labels: Q4, Renewals, Vendors/Billing' }).length).toBeGreaterThan(0);
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Ann Lee' }));
    const message = await within(mailbox).findByRole('region', { name: 'Conversation' });
    const frame = await within(message).findByTitle('Message: Renewal quote');
    expect(frame.getAttribute('srcdoc')).toContain(CSP_BLOCKED);
    expect(within(message).getByText('Cc Sam Pizza')).toBeInTheDocument();
    expect(within(message).getByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    await userEvent.click(within(message).getByRole('button', { name: 'Show images' }));
    expect(within(message).getByTitle('Message: Renewal quote').getAttribute('srcdoc')).toContain(CSP_IMAGES);
  });
});

// The portal journey: its own small stub, stateful on the one switch.

const staff = {
  id: 9, email: 'staff@revenact.io', name: 'Staff', avatar: '', role: '', role_id: null, role_name: '', permissions: [],
  function: 'other', function_display: 'Other', reports_to: null, organisation: null, is_active: true, is_superuser: true, mfa_enrolled: true,
} as unknown as User;

function stubPortal() {
  const gmail = { enabled: false, connected: 0, paused: 0 };
  const acme = {
    id: 1, name: 'Acme Inc', slug: 'acme-inc', status: 'active', created_at: '2026-09-01T00:00:00Z', owner: { id: 2, name: 'Owner', email: 'owner@acme.io' },
    // Waiting is 1, so the Gmail cell's 0 is the only 0 in the row.
    members_active: 2, pending_requests: 1, domains: [{ domain: 'acme.io', verification_status: 'verified' }], plan: null,
  };
  const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => JSON.parse(JSON.stringify(body)) });
  const spy = vi.fn((input: string, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
    if (path === '/platform/overview/') {
      return json(200, {
        organisations: { total: 1, pending: 0, active: 1, suspended: 0, archived: 0 }, members_active: 2, pending_requests: 0, open_invitations: 0, verified_domains: 1, staff: 1,
        gmail: { enabled_workspaces: gmail.enabled ? 1 : 0, connected: 37, test_user_cap: 100 },
      });
    }
    if (path === '/platform/organisations/1/gmail/' && init?.method === 'POST') {
      gmail.enabled = JSON.parse(String(init.body)).enabled;
      return json(200, { gmail });
    }
    if (path === '/platform/organisations/1/billing/') return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'No billing.' } });
    if (path === '/platform/organisations/1/') return json(200, { ...acme, gmail, open_invitations: 0, memberships: [], domains: [{ id: 5, domain: 'acme.io', is_primary: true, verification_status: 'verified', verified_at: null }], recent_events: [] });
    if (path === '/platform/organisations/') return json(200, [{ ...acme, gmail }]);
    return json(200, {});
  });
  vi.stubGlobal('fetch', spy);
  return { spy };
}

describe('Platform portal journey', () => {
  it('staff see the cap, turn Gmail on for a workspace with a reason, and the list says so', { timeout: 30000 }, async () => {
    const { spy } = stubPortal();
    const store = configureStore({
      reducer: { auth: authReducer, platform: platformReducer },
      preloadedState: {
        auth: { user: staff, accessToken: 'a', refreshToken: 'r', isAuthenticated: true, isLoading: false, error: null, mfaChallenge: null, mfaVerified: true },
      },
    });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/platform']}>
          <Routes>
            <Route path="/platform" element={<RequirePlatform><PlatformLayout /></RequirePlatform>}>
              <Route index element={<PlatformOverview />} />
              <Route path="organisations" element={<PlatformOrganisations />} />
              <Route path="organisations/:id" element={<PlatformOrganisationDetail />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(await screen.findByText('of 100 test users · 0 workspaces on')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Organisations' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Acme Inc' }));
    const card = await screen.findByRole('region', { name: 'Google two-way mail' });
    await userEvent.type(within(card).getByLabelText('Reason for turning it on'), 'Pilot approved');
    await userEvent.click(within(card).getByRole('button', { name: 'Turn on' }));
    expect(await within(card).findByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/gmail/')).toEqual(['/platform/organisations/1/gmail/']);
    await userEvent.click(screen.getAllByRole('link', { name: 'Organisations' })[0]);
    const row = (await screen.findByRole('link', { name: 'Acme Inc' })).closest('tr') as HTMLElement;
    expect(within(row).queryByText('Off')).toBeNull();
    expect(within(row).getByText('0')).toBeInTheDocument();
  });
});
