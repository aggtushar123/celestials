import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import authReducer, { FUNCTION_LABELS } from '../features/auth/authSlice';
import userManagementReducer from '../features/userManagement/userManagementSlice';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { NO_HEADS, TEAM_MEMBERS, stubAccountTeam } from '../features/knowledge/testHeads';
import { stubOrganizationPage } from '../features/organizations/testStory';
import { makeDetailStore, renderOrganizationPage } from '../pages/organizations/testDetail';
import { UserManagement } from '../pages/users/UserManagement';
import { ToastProvider } from '../components/ui';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real pages and store; only fetch is stubbed,
// in the Slack escalations D2 contract's shapes. Fake people. No em dash.

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** People & teams' own reads (/auth/users/, roles, capabilities); everything else passes on. */
function stubPeoplePage() {
  const next = globalThis.fetch;
  const users = TEAM_MEMBERS.map((m) => ({
    ...m,
    email: `${m.name.split(' ')[0].toLowerCase()}@alfiee.example`,
    avatar: '',
    role: 'csm',
    role_id: 2,
    role_name: 'CSM',
    permissions: [],
    function_display: FUNCTION_LABELS[m.function],
    reports_to: null,
    organisation: { id: 1, name: 'Alfiee QA', slug: 'alfiee-qa' },
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
      if (path === '/auth/users/') return ok({ count: users.length, next: null, previous: null, results: users });
      if (path === '/auth/roles/') return ok([{ id: 2, name: 'CSM', slug: 'csm', permissions: [], is_system: true, users_count: users.length, created_at: '2026-09-07T00:00:00Z' }]);
      if (path === '/auth/capabilities/') return ok([]);
      return next(input, init);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('Account team and department heads, end to end', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('a head named in Settings takes an empty row on the organisation page', { timeout: 60000 }, async () => {
    stubOrganizationPage();
    stubPeoplePage();
    const { headPatches, teamPatches } = stubAccountTeam({ heads: NO_HEADS, owner: { id: 11, name: 'Faiz Jamal', function: 'cs' } });

    // 1. Settings › People & teams: Jesh heads Engineering.
    render(
      <Provider store={configureStore({ reducer: { userManagement: userManagementReducer, auth: authReducer }, preloadedState: { auth: makeDetailStore().getState().auth } })}>
        <ToastProvider>
          <UserManagement />
        </ToastProvider>
      </Provider>,
    );
    const heads = await screen.findByRole('region', { name: 'Department heads' });
    await userEvent.selectOptions(await within(heads).findByRole('combobox', { name: 'Engineering' }), '12');
    await waitFor(() => expect(headPatches).toEqual([{ function: 'engineering', user_id: 12 }]));
    cleanup();

    // 2. Pizza Hut's page, Details: the empty Engineering row names Jesh.
    renderOrganizationPage('/organizations/7');
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    const team = await screen.findByRole('region', { name: 'Account team' });
    expect(await within(team).findByText('Nobody yet · Jesh Sanghvi (Engineering head) takes it')).toBeInTheDocument();
    expect(within(team).getByText('Account owner')).toBeInTheDocument();

    // 3. Erin joins the account team: the row is hers; the Knowledge tab agrees.
    await userEvent.selectOptions(within(team).getByRole('combobox', { name: 'Engineering on the account team' }), '13');
    await waitFor(() => expect(teamPatches).toEqual([{ function: 'engineering', user_id: 13 }]));
    await waitFor(() => expect(within(team).queryByText(/takes it/)).toBeNull());
    await userEvent.click(screen.getByRole('tab', { name: 'Knowledge' }));
    expect(await screen.findByRole('combobox', { name: 'Engineering owner' })).toHaveValue('13');
  });
});
