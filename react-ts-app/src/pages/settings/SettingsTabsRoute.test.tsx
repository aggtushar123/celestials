import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer, { type Capability } from '../../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { SettingsFrame } from '../../components/ui';
import { SettingsTabsRoute } from './SettingsTabsRoute';

function store(permissions: Capability[]) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role: 'admin', role_id: 1, role_name: 'Admin', permissions,
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
}

function renderAt(url: string, permissions: Capability[] = ALL_CAPABILITIES) {
  render(
    <Provider store={store(permissions)}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="settings/ai" element={<SettingsTabsRoute />}>
            <Route path="*" element={<SettingsFrame title="AI">{null}</SettingsFrame>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('SettingsTabsRoute (settings production spec §4.2, §10.3)', () => {
  it('puts the item tab row under the page heading, the current tab marked', () => {
    renderAt('/settings/ai/usage');
    const nav = screen.getByRole('navigation', { name: 'AI sections' });
    const links = Array.from(nav.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')]);
    expect(links).toEqual([
      ['Attributes', '/settings/ai/attributes', null],
      ['Skills', '/settings/ai/skills', null],
      ['Usage', '/settings/ai/usage', 'page'],
      ['Feedback', '/settings/ai/feedback', null],
    ]);
  });

  it('shows a member only the tabs they may open', () => {
    renderAt('/settings/ai/attributes', []);
    const nav = screen.getByRole('navigation', { name: 'AI sections' });
    expect(Array.from(nav.querySelectorAll('a')).map((a) => a.textContent)).toEqual(['Attributes']);
  });
});
