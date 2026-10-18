import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { WORKSPACE_SETTINGS_NAV } from './workspaceSettingsNav';
import { settingsRoutes } from './routes';
import app from '../../App.tsx?raw';

// Each page is stubbed: this is about where URLs land, not what renders
// (the same shape as pages/dashboard/routes.test.tsx). The catch-all stands
// in for /work (the home page), where RequireCapability sends someone it refuses.

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname + location.search + location.hash}</span>;
}

function renderAt(url: string, role: 'admin' | 'csm' = 'admin') {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1, role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
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
        <Routes>
          {settingsRoutes(() => <Where />)}
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return screen.getByTestId('where').textContent;
}

describe('settings routes (settings spec 2026-10-06 §1)', () => {
  it('sends the old AI agent address to Settings > Agents', () => {
    expect(renderAt('/settings/ai-agent')).toBe('/settings/agents');
  });

  it('keeps the query on that redirect', () => {
    expect(renderAt('/settings/ai-agent?x=1')).toBe('/settings/agents?x=1');
  });

  it.each(WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items.flatMap((item) => (item.tabs ? item.tabs.map((tab) => tab.path) : [item.path]))))(
    '%s opens its page for an admin, never bouncing',
    (path) => {
      expect(renderAt(path)).toBe(path);
    },
  );

  it.each([
    ['/settings', '/settings/general'],
    ['/settings/currency', '/settings/defaults'],
    ['/settings/global-presets', '/settings/defaults'],
    ['/settings/activities', '/settings/general'],
    ['/settings/connect-widget', '/settings/general'],
    ['/users', '/settings/people'],
    ['/integrations', '/settings/connections'],
    ['/integrations?connected=gmail', '/settings/connections?connected=gmail'],
    ['/integrations?connector=error&detail=Bad%20key#mailbox', '/settings/connections?connector=error&detail=Bad%20key#mailbox'],
    // Account settings folded into Settings (owner, 2026-10-17); billing once, under Workspace.
    ['/account-settings', '/settings/account'],
    ['/account-settings/account', '/settings/account'],
    ['/account-settings/billing', '/settings/billing'],
    ['/account-settings/integrations?mailbox=connected', '/settings/connections?mailbox=connected'],
    ['/account-settings/personalization', '/settings/personalization'],
    ['/account-settings/skills', '/settings/skills'],
    ['/account-settings/about', '/settings/about'],
    ['/account-settings/anything-else', '/settings/account'],
  ])('%s lands on %s', (from, to) => {
    expect(renderAt(from)).toBe(to);
  });

  it.each(['/settings/people', '/settings/ai/skills', '/settings/ai/usage', '/settings/ai/feedback', '/settings/ai-skills', '/users'])(
    '%s keeps its guard: a member without the capability is sent home to /work',
    (url) => {
      expect(renderAt(url, 'csm')).toBe('/work');
    },
  );

  it('is the only settings tree in App.tsx', () => {
    expect(app).toContain('{settingsRoutes()}');
    expect(app).not.toContain('<Route path="settings">');
    expect(app).not.toContain('<Route path="users"');
    expect(app).not.toContain('<Integrations />');
  });
});

describe('merged pages (settings production spec §4.2)', () => {
  it.each([
    ['/settings/recommendations', '/settings/work/recommendations'],
    ['/settings/work-tasks', '/settings/work/tasks'],
    ['/settings/work-notifications', '/settings/work/notifications'],
    ['/settings/brief-delivery', '/settings/work/briefs'],
    ['/settings/agent-actions', '/settings/agents/actions'],
    ['/settings/ai-attributes', '/settings/ai/attributes'],
    ['/settings/ai-skills', '/settings/ai/skills'],
    ['/settings/ai-usage', '/settings/ai/usage'],
    ['/settings/ai-feedback', '/settings/ai/feedback'],
    ['/settings/webhooks', '/settings/developers/webhooks'],
    ['/settings/agent-access', '/settings/developers/agent-access'],
    ['/settings/work', '/settings/work/recommendations'],
    ['/settings/ai', '/settings/ai/attributes'],
    ['/settings/developers', '/settings/developers/webhooks'],
  ])('sends %s to %s', (from, to) => {
    expect(renderAt(from)).toBe(to);
  });

  it('keeps the query and hash on an old address', () => {
    expect(renderAt('/settings/work-notifications?from=email#digest')).toBe('/settings/work/notifications?from=email#digest');
  });

  it('opens the Agents tab at the item address itself', () => {
    expect(renderAt('/settings/agents')).toBe('/settings/agents');
  });

  it('still bounces a member from a gated tab', () => {
    expect(renderAt('/settings/ai/usage', 'csm')).not.toBe('/settings/ai/usage');
  });
});
