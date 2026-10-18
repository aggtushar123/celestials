import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import mailReducer from '../../features/mail/mailSlice';
import connectorsReducer from '../../features/connectors/connectorsSlice';
import { SourcesGroup } from './SourcesGroup';

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

function WhereAmI() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderGroup(
  path = '/dashboard',
  mailbox: unknown = { id: 1, provider: 'google', provider_display: 'Google', address: 'a@acme.io', status: 'connected' },
  expanded = false,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/mail/connection/')) return Promise.resolve(jsonResponse(200, { connection: mailbox, providers: [] }));
      if (url.includes('/connectors/')) {
        return Promise.resolve(
          jsonResponse(200, [
            { id: 4, provider: 'intercom', provider_display: 'Intercom', name: 'Intercom', status: 'connected', is_enabled: true, department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true, ticket_count: 0, call_count: 0, last_record_at: null, has_credentials: true, config: {} },
            { id: 5, provider: 'slack', provider_display: 'Slack', name: 'Slack', status: 'connected', is_enabled: true, department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true, ticket_count: 0, call_count: 0, last_record_at: null, has_credentials: true, config: {} },
            { id: 6, provider: 'zendesk', provider_display: 'Zendesk', name: 'Zendesk', status: 'not_connected', is_enabled: true, department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true, ticket_count: 0, call_count: 0, last_record_at: null, has_credentials: false, config: {} },
            { id: 7, provider: 'salesforce', provider_display: 'Salesforce', name: 'Salesforce', status: 'not_connected', is_enabled: true, department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true, ticket_count: 0, call_count: 0, last_record_at: null, has_credentials: false, config: {} },
          ])
        );
      }
      throw new Error(`unexpected request: ${url}`);
    })
  );
  const store = configureStore({ reducer: { mail: mailReducer, connectors: connectorsReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<><SourcesGroup expanded={expanded} /><WhereAmI /></>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('Sidebar Communications group', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the inbox, Gmail, Slack and Jira, all at once, and nothing else', async () => {
    renderGroup();
    const group = screen.getByRole('group', { name: 'Communications' });
    expect(await within(group).findByRole('button', { name: 'Gmail' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Slack' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Connect Jira' })).toBeInTheDocument();
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Communications', 'Gmail', 'Slack', 'Connect Jira']);
    expect(within(group).queryByRole('button', { name: /Intercom|Zendesk|Salesforce|Outlook|Calls|Show all sources/ })).not.toBeInTheDocument();
  });

  it('with no mailbox, Gmail is dimmed and connects from Settings', async () => {
    renderGroup('/dashboard', null);
    const group = screen.getByRole('group', { name: 'Communications' });
    await userEvent.click(await within(group).findByRole('button', { name: 'Connect Gmail' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/connections');
  });

  it('resting on a source shows its name in a pill', async () => {
    renderGroup();
    const group = screen.getByRole('group', { name: 'Communications' });
    const gmail = await within(group).findByRole('button', { name: 'Gmail' });
    expect(within(group).queryByText('Gmail')).not.toBeInTheDocument();
    await userEvent.hover(gmail);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Gmail');
    await userEvent.unhover(gmail);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('the inbox goes to Communications and a source narrows it by the URL', async () => {
    renderGroup();
    const group = screen.getByRole('group', { name: 'Communications' });
    await userEvent.click(within(group).getByRole('button', { name: 'Communications' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/communications');
    await userEvent.click(await within(group).findByRole('button', { name: 'Gmail' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/communications?source=mailbox%3Agoogle');
    expect(within(group).getByRole('button', { name: 'Gmail' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(group).getByRole('button', { name: 'Slack' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/communications?source=connector%3A5');
    await userEvent.click(within(group).getByRole('button', { name: 'Connect Jira' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/connections');
  });
});

// Phone drawer (phone shell spec 2026-10-06): a phone has no hover, so with
// the drawer open below `md` each source shows its name as visible text
// next to its icon, the same way NavItem does for `expanded`. Desktop
// (`expanded` false, the default above) is unchanged — icon only, name in
// a hover pill.
describe('Sidebar Communications group in the open phone drawer', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows each shown source\'s label next to its icon, hidden again at md and up', async () => {
    renderGroup('/dashboard', undefined, true);
    const group = screen.getByRole('group', { name: 'Communications' });
    const gmail = await within(group).findByRole('button', { name: 'Gmail' });
    const label = within(gmail).getByText('Gmail');
    expect(label).toBeInTheDocument();
    expect(label.className).toMatch(/\bmd:hidden\b/);
  });

  it('labels every source once expanded, including the unconnected ones', async () => {
    renderGroup('/dashboard', undefined, true);
    const group = screen.getByRole('group', { name: 'Communications' });
    expect(within(await within(group).findByRole('button', { name: 'Slack' })).getByText('Slack')).toBeInTheDocument();
    expect(within(within(group).getByRole('button', { name: 'Connect Jira' })).getByText('Connect Jira')).toBeInTheDocument();
  });
});
