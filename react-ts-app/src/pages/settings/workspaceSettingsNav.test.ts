import { describe, expect, it } from 'vitest';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { WORKSPACE_SETTINGS_NAV, settingsTabsFor, settingsTitle, visibleSettingsNav, type WorkspaceSettingsGroup } from './workspaceSettingsNav';

const shape = (groups: readonly WorkspaceSettingsGroup[]) =>
  groups.map((group) => [group.label, group.items.map((item) => `${item.label} ${item.path}${item.tabs ? ` [${item.tabs.map((tab) => tab.label).join(', ')}]` : ''}`)]);

// Settings production spec 2026-10-11 §4.2: 12 items in four groups.
describe('WORKSPACE_SETTINGS_NAV', () => {
  it('lists the four groups, their items and the merged pages tabs, in order', () => {
    expect(shape(WORKSPACE_SETTINGS_NAV)).toEqual([
      ['You', ['Account /settings/account', 'Personalization /settings/personalization', 'Your skills & tasks /settings/skills', 'About /settings/about']],
      ['Workspace', ['General /settings/general', 'People & teams /settings/people', 'Connections /settings/connections', 'Plan & billing /settings/billing']],
      ['Data', ['Attributes /settings/data', 'Defaults /settings/defaults', 'Products /settings/products', 'Imports /settings/entity-uploads']],
      [
        'Automation',
        [
          'Work /settings/work [Recommendations, Tasks, Notifications, Briefs]',
          'Agents /settings/agents [Agents, Actions & approvals]',
          'AI /settings/ai [Attributes, Skills, Usage, Feedback]',
        ],
      ],
      ['Developers', ['Webhooks & API access /settings/developers [Webhooks, Agent access]']],
    ]);
  });

  it('keeps every route guard, on the item or on its tab', () => {
    const gated = WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items).flatMap((item) => [
      ...(item.capability ? [[item.path, item.capability]] : []),
      ...(item.tabs ?? []).filter((tab) => tab.capability).map((tab) => [tab.path, tab.capability]),
    ]);
    expect(gated).toEqual([
      ['/settings/people', 'manage_users'],
      ['/settings/ai/skills', 'view_all_accounts'],
      ['/settings/ai/usage', 'view_all_accounts'],
      ['/settings/ai/feedback', 'view_all_accounts'],
    ]);
  });
});

describe('visibleSettingsNav', () => {
  it('drops gated items and gated tabs for a member', () => {
    const items = visibleSettingsNav([]).flatMap((group) => group.items);
    expect(items.map((item) => item.label)).not.toContain('People & teams');
    expect(items.find((item) => item.label === 'AI')?.tabs?.map((tab) => tab.label)).toEqual(['Attributes']);
    expect(items.find((item) => item.label === 'Work')?.tabs).toHaveLength(4);
  });

  it('shows an admin everything', () => {
    expect(shape(visibleSettingsNav(ALL_CAPABILITIES))).toEqual(shape(WORKSPACE_SETTINGS_NAV));
  });
});

describe('settingsTitle', () => {
  it('names an item by its own path and by any of its tabs', () => {
    expect(settingsTitle('/settings/general')).toBe('General');
    expect(settingsTitle('/settings/work/tasks')).toBe('Work');
    expect(settingsTitle('/settings/agents')).toBe('Agents');
    expect(settingsTitle('/settings/agents/actions')).toBe('Agents');
    expect(settingsTitle('/settings/developers/agent-access')).toBe('Webhooks & API access');
  });

  it('refuses a path that is not in the nav', () => {
    expect(() => settingsTitle('/settings/work-tasks')).toThrow();
  });
});

describe('settingsTabsFor', () => {
  it('finds the item and the current tab, the longest match winning', () => {
    const agents = settingsTabsFor('/settings/agents/actions', ALL_CAPABILITIES);
    expect(agents?.item.label).toBe('Agents');
    expect(agents?.current).toBe('/settings/agents/actions');
    expect(settingsTabsFor('/settings/agents', ALL_CAPABILITIES)?.current).toBe('/settings/agents');
    expect(settingsTabsFor('/settings/work/briefs', ALL_CAPABILITIES)?.current).toBe('/settings/work/briefs');
  });

  it('answers null for an item without tabs, and hides tabs a member cannot open', () => {
    expect(settingsTabsFor('/settings/general', ALL_CAPABILITIES)).toBeNull();
    expect(settingsTabsFor('/settings/ai/attributes', [])?.tabs.map((tab) => tab.label)).toEqual(['Attributes']);
  });
});
