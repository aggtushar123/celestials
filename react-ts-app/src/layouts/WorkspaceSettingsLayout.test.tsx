import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import authReducer, { type Capability } from '../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../test/capabilities';
import { resetViewport, setViewport } from '../test/viewport';
import { SettingsDraftScope, useSettingsDraft } from '../components/ui';
import { WorkspaceSettingsLayout } from './WorkspaceSettingsLayout';

// Integration tier (see the `testing` skill): the real auth slice for the
// capability gates, the real router for NavLink and the phone select.

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

/** A page with one draft field inside its own scope, below the layout. */
function DraftPage() {
  const [value, setValue] = useState('');
  useSettingsDraft({ dirty: value !== '', saving: false, save: async () => true, discard: () => setValue('') });
  return <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />;
}

function makeStore(permissions: Capability[]) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role: 'admin', role_id: 1, role_name: 'Admin',
          permissions,
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

function renderLayout(url: string, permissions: Capability[] = ALL_CAPABILITIES) {
  render(
    <Provider store={makeStore(permissions)}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="settings" element={<WorkspaceSettingsLayout />}>
            <Route
              path="general"
              element={
                <SettingsDraftScope>
                  <DraftPage />
                  <Where />
                </SettingsDraftScope>
              }
            />
            <Route path="*" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

const linksIn = (group: string) =>
  within(screen.getByRole('group', { name: group })).getAllByRole('link').map((link) => link.textContent);

const ALL_ITEMS = [
  'Account', 'Personalization', 'Your skills & tasks', 'About',
  'General', 'People & teams', 'Connections', 'Plan & billing',
  'Attributes', 'Defaults', 'Products', 'Imports',
  'Work', 'Agents', 'AI',
  'Webhooks & API access',
];

afterEach(() => resetViewport());

describe('WorkspaceSettingsLayout from md (settings production spec §4.1)', () => {
  it('draws the four groups with their items in order, under a Settings heading', () => {
    setViewport(1440);
    renderLayout('/settings/general');
    const nav = screen.getByRole('navigation', { name: 'Workspace settings' });
    expect(within(nav).getByText('Settings')).toBeInTheDocument();
    expect(linksIn('Workspace')).toEqual(['General', 'People & teams', 'Connections', 'Plan & billing']);
    expect(linksIn('Data')).toEqual(['Attributes', 'Defaults', 'Products', 'Imports']);
    expect(linksIn('Automation')).toEqual(['Work', 'Agents', 'AI']);
    expect(linksIn('Developers')).toEqual(['Webhooks & API access']);
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/general');
  });

  it('marks Work current on any of its tabs', () => {
    setViewport(1440);
    renderLayout('/settings/work/tasks');
    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts no Settings title in the bar from md; the nav carries it', () => {
    setViewport(1440);
    renderLayout('/settings/general');
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('labels the groups without headings, so the page h1 comes first', () => {
    setViewport(1280);
    renderLayout('/settings/general');
    const nav = screen.getByRole('navigation', { name: 'Workspace settings' });
    expect(within(nav).queryAllByRole('heading')).toEqual([]);
    expect(within(nav).getAllByRole('group').map((group) => group.getAttribute('aria-labelledby'))).toEqual([
      'settings-nav-you', 'settings-nav-workspace', 'settings-nav-data', 'settings-nav-automation', 'settings-nav-developers',
    ]);
  });

  it('hides People & teams from a member without the capability', () => {
    setViewport(1280);
    renderLayout('/settings/general', []);
    expect(screen.queryByRole('link', { name: 'People & teams' })).toBeNull();
    expect(screen.getByRole('link', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument();
  });

  it('marks the current item with aria-current="page" and the active style', () => {
    setViewport(1280);
    renderLayout('/settings/defaults');
    const active = screen.getByRole('link', { name: 'Defaults' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('bg-subtle', 'text-ink', 'font-semibold', 'min-h-9');
    expect(screen.getByRole('link', { name: 'General' })).not.toHaveAttribute('aria-current');
  });

  it('draws no phone select', () => {
    setViewport(1280);
    renderLayout('/settings/general');
    expect(screen.queryByRole('combobox', { name: 'Settings section' })).toBeNull();
  });
});

describe('WorkspaceSettingsLayout below md (settings spec 2026-10-06 §2.1)', () => {
  it('replaces the column with a grouped select listing the same items', () => {
    setViewport(375);
    renderLayout('/settings/developers/webhooks');
    expect(screen.queryByRole('navigation', { name: 'Workspace settings' })).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(select).toHaveClass('min-h-11');
    expect(select).toHaveValue('/settings/developers');
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toEqual(['You', 'Workspace', 'Data', 'Automation', 'Developers']);
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(ALL_ITEMS);
  });

  it('navigates when a section is chosen', async () => {
    setViewport(375);
    renderLayout('/settings/general');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Settings section' }), '/settings/developers');
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/developers');
  });

  it('asks before a section change discards unsaved edits, and stays on Cancel', async () => {
    setViewport(375);
    renderLayout('/settings/general');
    await userEvent.type(screen.getByLabelText('Draft'), 'x');
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    await userEvent.selectOptions(select, '/settings/developers');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Leave without saving/i);
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/general');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/general');
    expect(screen.getByLabelText('Draft')).toHaveValue('x');
    expect(select).toHaveValue('/settings/general');
  });

  it('leaves for the chosen section once the user confirms', async () => {
    setViewport(375);
    renderLayout('/settings/general');
    await userEvent.type(screen.getByLabelText('Draft'), 'x');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Settings section' }), '/settings/developers');
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/settings/developers');
  });

  it('lists only what a member may open', () => {
    setViewport(375);
    renderLayout('/settings/general', []);
    const options = within(screen.getByRole('combobox', { name: 'Settings section' })).getAllByRole('option').map((option) => option.textContent);
    expect(options).not.toContain('People & teams');
  });
});

describe('WorkspaceSettingsLayout on the primitives (Settings PR)', () => {
  it('says Settings as text, so each page h1 is the only heading 1', () => {
    setViewport(1280);
    renderLayout('/settings/general');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('Settings', { selector: 'p' })).toHaveClass('text-[15px]', 'font-semibold');
  });

  it('keeps Settings in the bar on a phone, where there is no nav column', () => {
    setViewport(375);
    renderLayout('/settings/general');
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Workspace settings' })).toBeNull();
  });

  it('labels the nav groups as eyebrows and gives the scroll column its hairline sentinel', () => {
    setViewport(1280);
    renderLayout('/settings/general');
    const label = document.getElementById('settings-nav-workspace')!;
    expect(label).toHaveClass('text-[11px]', 'font-semibold', 'uppercase', 'tracking-wider', 'text-ink-muted');
    const column = screen.getByTestId('where').closest('.overflow-y-auto')!;
    expect(column.firstElementChild).toHaveAttribute('data-part', 'scroll-sentinel');
  });

  it('draws the phone picker with the ui Select: its chevron and frame', () => {
    setViewport(375);
    renderLayout('/settings/developers/webhooks');
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(select).toHaveClass('appearance-none', 'border-line', 'bg-surface');
    expect(select.parentElement!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
