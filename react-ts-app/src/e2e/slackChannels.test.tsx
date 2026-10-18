import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import connectorsReducer from '../features/connectors/connectorsSlice';
import mailReducer from '../features/mail/mailSlice';
import { stubSlackChannels } from '../features/connectors/testSlackChannels';
import { Integrations } from '../pages/integrations/Integrations';
import { capabilitiesForRole } from '../test/capabilities';

// End-to-end tier (jsdom): the real page and store; only fetch is stubbed,
// in the Slack escalations D3 contract's shapes. Fake channels; nothing is
// sent to Slack. No em dash.

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

const SLACK = {
  id: 7, provider: 'slack', provider_display: 'Slack', name: 'Slack', is_enabled: true,
  customers: [], accounts: [], is_organisation_wide: true, ticket_count: 12, conversation_count: 12, call_count: 0,
  last_record_at: null, created_at: '2026-08-01T00:00:00Z', department: '', department_display: '', has_credentials: true,
  config: {}, status: 'connected', error: '', last_synced_at: '2026-10-17T09:30:00Z', last_sync_note: '',
  setup: { key: 'slack', label: 'Slack', uses_oauth: true, help: '', fields: [{ name: 'bot_token', label: 'Bot token', secret: true, placeholder: 'xoxb-…', required: false }] },
  slack_channels: { synced: 3, total: 4, can_join: true, events_at: '2026-10-17T09:25:00Z' },
};

describe('Slack escalations D3, end to end', () => {
  it('an admin sees events arrive, excludes #random and sets #globex-escalations to Globex (QA) (LC-D3a, LC-D3b, LC-D3d)', { timeout: 60000 }, async () => {
    let synced = 3;
    const { patches } = stubSlackChannels({
      fallback: (url) => {
        if (url.pathname.includes('/connectors/jira-link/')) return ok({ configured: false, connectors: [], link: null });
        if (url.pathname.endsWith('/customers/') && url.searchParams.has('search')) return ok({ results: [{ id: 29, name: 'Globex (QA)' }] });
        if (url.pathname.endsWith('/accounts/') && url.searchParams.has('search')) return ok({ results: [] });
        if (url.pathname.endsWith('/connectors/')) return ok([{ ...SLACK, slack_channels: { synced, total: 4, can_join: true, events_at: '2026-10-17T09:25:00Z' } }]);
        return ok({ results: [] });
      },
    });
    const store = configureStore({
      reducer: { auth: authReducer, connectors: connectorsReducer, mail: mailReducer },
      preloadedState: {
        auth: {
          user: {
            id: 1, email: 'tushar@alfee.io', name: 'Tushar Aggarwal', avatar: '', role: 'admin' as const, role_id: 1,
            role_name: 'Admin', permissions: capabilitiesForRole('admin'), function: 'leadership' as const, function_display: 'Leadership', reports_to: null,
            organisation: { id: 4, name: 'Alfiee', slug: 'alfiee', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional' },
            is_active: true,
          },
          accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
        },
      },
    });
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Integrations />
        </MemoryRouter>
      </Provider>,
    );
    const slackCard = await screen.findByRole('list', { name: 'Slack' });
    const card = within(slackCard).getByRole('group', { name: 'Workspace' }).closest('li') as HTMLElement;
    expect(await within(card).findByText(/syncs 3 of 4 public channels/)).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'More for Slack (workspace)' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Choose channels' }));
    expect(await within(card).findByText(/^Events: receiving\./)).toBeInTheDocument();
    const random = (await within(card).findByText('#random')).closest('li') as HTMLElement;
    synced = 2;
    await userEvent.click(within(random).getByRole('switch', { name: 'Sync #random' }));
    expect(await within(card).findByText('Stopped syncing #random.')).toBeInTheDocument();
    expect(await within(card).findByText(/syncs 2 of 4 public channels/)).toBeInTheDocument();

    const globex = within(card).getByText('#globex-escalations').closest('li') as HTMLElement;
    await userEvent.click(within(globex).getByRole('button', { name: 'Choose the customer of #globex-escalations' }));
    await userEvent.click(within(globex).getByRole('radio', { name: 'Always this customer:' }));
    await userEvent.type(within(globex).getByRole('searchbox', { name: 'Organisation or account' }), 'glo');
    await userEvent.click(await within(globex).findByRole('button', { name: /^Globex \(QA\)$/ }));
    await userEvent.click(within(globex).getByRole('button', { name: 'Save' }));
    expect(await within(card).findByText('#globex-escalations now files under Globex (QA).')).toBeInTheDocument();
    expect(patches).toEqual([
      { channel: 'C0RANDOM', body: { included: false } },
      { channel: 'C0GLOBEX', body: { record: { type: 'customer', id: 29 } } },
    ]);
  });
});
