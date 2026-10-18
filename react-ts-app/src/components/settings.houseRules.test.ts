import { describe, expect, it } from 'vitest';
import { houseRuleSuite, sizeOffenders, uiRuleSuite } from '../test/houseRules';

// The Settings surface (UI foundations spec §9.2 row 4): every page under
// WorkspaceSettingsLayout and the components only they render, on every
// house rule and every foundations rule (§9.4). The You pages (Account,
// Personalization, Your skills & tasks, About), folded in from account
// settings on 2026-10-17, keep their own look for now, with their Personal
// column, and /profile is out of scope (owner, 2026-10-09 and 2026-10-10):
// named below, never globbed.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(
    import.meta.glob(
      [
        '../pages/settings/*.{ts,tsx}',
        '!../pages/settings/*.test.{ts,tsx}',
        '!../pages/settings/testAttributes.ts',
        '!../pages/settings/AccountSettingsPage.tsx',
        '!../pages/settings/PersonalizationPage.tsx',
        '!../pages/settings/SkillsTasksPage.tsx',
        '!../pages/settings/AboutSettingsPage.tsx',
        '!../pages/settings/Personal.tsx',
      ],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
  ...raw(import.meta.glob(['../pages/users/*.tsx', '!../pages/users/*.test.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['../pages/integrations/*.tsx', '!../pages/integrations/*.test.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./integrations/*.tsx', '!./integrations/*.test.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['../pages/brain/Agents.tsx', '../pages/brain/Skills.tsx', '../pages/brain/Feedback.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../layouts/WorkspaceSettingsLayout.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(
    import.meta.glob(
      [
        './work/WorkSettingsForm.tsx',
        './work/WorkSettingsSummary.tsx',
        './work/WorkTasksForm.tsx',
        './work/WorkTasksSummary.tsx',
        './work/WorkNotificationsForm.tsx',
        './work/WorkNotificationsSummary.tsx',
        './agents/AgentCard.tsx',
        './agents/AgentsForm.tsx',
        './agents/AgentsSummary.tsx',
        './agents/ActionsGridForm.tsx',
        './agents/ActionsGridSummary.tsx',
        './agents/AiOffNotice.tsx',
        './agents/FastLane.tsx',
      ],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
};

// The brands' own marks keep their colours (owner-visible choice, Settings
// PR): exempt by name from the whole house rules suite (houseRuleSuite: the
// token rule is the one they need it for), never from the foundations rules;
// the type-scale test below puts their sizes back under check.
const LOGOS = ['./integrations/providerLogos.tsx'];
// Out of scope, never in this suite (the account settings round).
const ACCOUNT = /AccountSettingsPage|PersonalizationPage|SkillsTasksPage|AboutSettingsPage|BillingSettingsPage|components\/settings\/|^\.\/settings\/|pages\/profile\/|layouts\/SettingsLayout/;
// The twenty pages of the settings nav (their route elements in routes.tsx).
const PAGES = [
  '../pages/settings/GeneralSettingsPage.tsx',
  '../pages/users/UserManagement.tsx',
  '../pages/integrations/Integrations.tsx',
  '../pages/settings/PlanBillingPage.tsx',
  '../pages/settings/SettingsPage.tsx',
  '../pages/settings/DefaultsPage.tsx',
  '../pages/settings/ProductsPage.tsx',
  '../pages/settings/EntityUploadsPage.tsx',
  '../pages/settings/WorkRecommendationsPage.tsx',
  '../pages/settings/WorkTasksPage.tsx',
  '../pages/settings/WorkNotificationsPage.tsx',
  '../pages/settings/BriefDeliveryPage.tsx',
  '../pages/settings/AgentsSettingsPage.tsx',
  '../pages/settings/AgentActionsPage.tsx',
  '../pages/settings/AIAttributesPage.tsx',
  '../pages/brain/Skills.tsx',
  '../pages/brain/Agents.tsx',
  '../pages/brain/Feedback.tsx',
  '../pages/settings/WebhooksPage.tsx',
  '../pages/settings/AgentAccessPage.tsx',
];
// The only tables: real matrices and logs (spec §4.2).
const TABLES = [
  '../pages/users/UserManagement.tsx',
  '../pages/settings/PlanBillingPage.tsx',
  '../pages/settings/EntityUploadsPage.tsx',
  '../pages/brain/Agents.tsx',
  './agents/ActionsGridForm.tsx',
  './agents/ActionsGridSummary.tsx',
];
const CONDITIONAL_STATUS = /(?:\?|&&)\s*\(?\s*<\w+[^>]*\brole="status"/;
const HIDDEN_STATUS = /role="status"[^>]*\bempty:hidden\b/;

const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
const tsx = sources.filter(([file]) => file.endsWith('.tsx'));
const outside = (names: string[]) => Object.fromEntries(Object.entries(files).filter(([file]) => !names.includes(file)));

houseRuleSuite('Settings: house rules', outside(LOGOS));
uiRuleSuite('Settings: foundations rules', files);

describe('Settings: frame, copy, live regions and scope', () => {
  it('never reads an account settings file', () => {
    expect(Object.keys(files).filter((file) => ACCOUNT.test(file))).toEqual([]);
  });

  it('guards every account settings path, as this file globs them, and none of the workspace ones', () => {
    // From src/components, ./settings/ is components/settings (SettingsSidebar, AccountSecurity).
    for (const file of ['./settings/SettingsSidebar.tsx', './settings/AccountSecurity.tsx', '../pages/profile/Profile.tsx', '../layouts/SettingsLayout.tsx', '../pages/settings/BillingSettingsPage.tsx']) {
      expect(ACCOUNT.test(file), file).toBe(true);
    }
    for (const file of ['../pages/settings/WebhooksPage.tsx', '../pages/settings/PlanBillingPage.tsx', './integrations/GmailAccountRow.tsx', '../layouts/WorkspaceSettingsLayout.tsx']) {
      expect(ACCOUNT.test(file), file).toBe(false);
    }
  });

  it('keeps the brand marks on the type scale', () => {
    for (const file of LOGOS) expect(sizeOffenders(files[file]), file).toEqual([]);
  });

  it('heads every page with a SettingsFrame titled from the nav', () => {
    for (const page of PAGES) {
      expect(files[page], page).toMatch(/<(Work|Agent)?SettingsFrame\b/);
      expect(files[page], page).toContain('settingsTitle(');
    }
  });

  it('writes no page heading or page wrapper by hand', () => {
    const offenders = tsx.filter(([, source]) => /<h1\b|text-\[20px\]|\bmx-auto\b|\bmax-w-(?:2xl|4xl|7xl)\b|className="[^"]*\bp-6\b/.test(source)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('writes no em dash in a settings UI file, comments included', () => {
    expect(tsx.filter(([, source]) => source.includes('\u2014')).map(([file]) => file)).toEqual([]);
  });

  it('never hides or unmounts a role="status" region between updates', () => {
    expect(tsx.filter(([, source]) => CONDITIONAL_STATUS.test(source) || HIDDEN_STATUS.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('draws a table only for a real matrix or log', () => {
    expect(tsx.filter(([file, source]) => /<table\b/.test(source) && !TABLES.includes(file)).map(([file]) => file)).toEqual([]);
  });

  it('uses the ui Select and Switch: no bare select, no hand-made switch', () => {
    expect(tsx.filter(([, source]) => /<select\b/.test(source)).map(([file]) => file)).toEqual([]);
    expect(tsx.filter(([, source]) => /role="switch"/.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('covers every page and the pieces only they render', () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining([...PAGES, '../layouts/WorkspaceSettingsLayout.tsx', './integrations/GmailAccountRow.tsx', './agents/AgentCard.tsx', './work/WorkSettingsForm.tsx', '../pages/settings/GlobalConfigSection.tsx']));
  });
});
