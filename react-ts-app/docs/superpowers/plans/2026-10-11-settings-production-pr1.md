# Settings production redesign, PR 1 (frame, shared parts, nav merge, simple pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give workspace Settings a production frame (solid canvas, 12-item nav, one width, two-column sections) and the hybrid save model (instant toggles/selects with an Undo toast, one sticky unsaved-changes bar for typed fields), wired into the simple pages.

**Architecture:** The frame lives in `WorkspaceSettingsLayout` and `components/ui/SettingsFrame.tsx`; every Settings page already renders `SettingsFrame`/`SettingsSection`/`SettingsRow`, so restyling those restyles every page. Merged pages become nested routes under a `SettingsTabsRoute` that puts a tab row in a React context which `SettingsFrame` draws. Saving gets three new ui modules: `Toast` (provider + hook), `useInstantSave` (one request, a "Saved" toast with Undo), and `SettingsDraft` (forms register `{dirty, saving, save, discard}`; one bar saves or discards them all and guards leaving). `SettingsFrame` mounts the toast provider and the draft scope, so every page gets both.

**Tech Stack:** React 19, TypeScript, react-router 7 (BrowserRouter, so no `useBlocker`), Tailwind v4 tokens in `src/index.css`, Vitest + Testing Library + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-11-settings-production-design.md` (read §4, §5, §6 and the amendments in §10; §10 overrides earlier sections).

## Global Constraints

- Frontend only. No backend or API change; every request a page sends today stays the same (field names, paths, methods).
- Account settings (`/account-settings/*`, `/profile`) are not touched.
- Tokens only: no raw hex/rgb in `src/**/*.tsx`. Cards: solid surface, 1px `border-line`, `rounded-xl`, no shadow (overlays may use `OVERLAY`). Numbers use the body font with `tabular-nums` (`NUM`); DM Mono (`CODE`) only for IDs/code.
- Type scale: only `TYPE.*` from `src/components/ui/type.ts` (four sizes). Sentence-case copy, no em dashes in new UI copy.
- Motion: only the existing `animate-fade-up` (200ms ease-out); `motion-safe:` prefix; nothing on keyboard-driven changes.
- Every new interactive element: focus-visible (`FOCUS`), 44px target below `sm` (`min-h-11 sm:min-h-9`).
- The style ratchet in `src/test/uiRatchet.test.ts` must not rise; if a task lowers a count, re-record the baseline downward as that test's failure message instructs.
- Work in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/settings-prod-fe` (branch `feat/settings-production`). Run tests with `npx vitest run <path>`; the full suite with `npx vitest run`; also `npm run lint` and `npm run build` in the final task.
- Commits: conventional commits (`feat(settings): …`, `test(settings): …`), each ending with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/pages/settings/workspaceSettingsNav.ts` | modify | 12 items in 4 groups; items may carry `tabs`; `visibleSettingsNav`, `settingsTitle`, new `settingsTabsFor` |
| `src/pages/settings/SettingsTabsRoute.tsx` | create | route element for a tabbed item: builds the tab row, provides it through `SettingsTabsSlot`, renders `<Outlet />` |
| `src/pages/settings/routes.tsx` | modify | nested tab routes, index redirects, old-path redirects |
| `src/components/ui/SettingsFrame.tsx` | modify | one width, header + tabs slot, two-column `SettingsSection`, new `SettingsRow` layout; mounts `ToastProvider` + `SettingsDraftScope` |
| `src/components/ui/Toast.tsx` | create | `ToastProvider`, `useToast` |
| `src/components/ui/useInstantSave.ts` | create | `useInstantSave` |
| `src/components/ui/SettingsDraft.tsx` | create | `SettingsDraftScope`, `useSettingsDraft`, the bar, the leave guard |
| `src/components/ui/DayChips.tsx` | create | seven day toggles |
| `src/components/ui/Banner.tsx` | create | one-sentence info/warning banner |
| `src/components/ui/Switch.tsx` | modify | optional `busy` |
| `src/components/ui/index.ts` | modify | export the new modules |
| `src/layouts/WorkspaceSettingsLayout.tsx` | modify | "Settings" nav heading; bar title on phones only; scrollbars |
| `src/layouts/DashboardLayout.tsx` | modify | `bg-base` instead of `rv-canvas` on `/settings/*` |
| `src/components/work/WorkNotificationsForm.tsx` | modify | instant switch + select |
| `src/components/work/WorkTasksForm.tsx` | modify | instant timezone; escalate + days as a draft |
| `src/components/work/WorkSettingsForm.tsx` | modify | instant radios + switches; thresholds + cooldown as a draft |
| `src/components/agents/AgentsForm.tsx` | modify | instant AI switch, tone, agent switches; budgets as a draft |
| `src/pages/settings/CurrencySection.tsx` | modify | currency as a draft (it clears rates) |
| `src/pages/settings/LifecycleDefaultSection.tsx` | modify | instant select |
| `src/pages/settings/GeneralSettingsPage.tsx` | modify | "Danger zone" section |
| pages calling `settingsTitle(old path)` | modify | new paths |
| `src/components/shared/AIAttributesPanel.tsx`, `src/pages/brain/BrainRoutes.tsx`, `src/pages/brain/Skills.tsx` | modify | links to new paths |
| `src/pages/dev/UiGallery.tsx` | modify | gallery entries for the new parts; drop removed ones |

---

### Task 1: Nav model with tabs

**Files:**
- Modify: `src/pages/settings/workspaceSettingsNav.ts`
- Test: `src/pages/settings/workspaceSettingsNav.test.ts` (rewrite)

**Interfaces:**
- Produces:
  - `interface WorkspaceSettingsTab { label: string; path: string; capability?: Capability }`
  - `interface WorkspaceSettingsItem { label: string; path: string; icon: LucideIcon; capability?: Capability; tabs?: readonly WorkspaceSettingsTab[] }`
  - `WORKSPACE_SETTINGS_NAV: readonly WorkspaceSettingsGroup[]`
  - `visibleSettingsNav(permissions: readonly Capability[]): WorkspaceSettingsGroup[]` (tabs filtered too; an item with tabs and none visible is dropped)
  - `settingsTitle(path: string): string` (item label for an item path or any of its tab paths; throws otherwise)
  - `settingsTabsFor(pathname: string, permissions: readonly Capability[]): { item: WorkspaceSettingsItem; tabs: WorkspaceSettingsTab[]; current: string } | null` (`current` is the longest visible tab path that `pathname` equals or starts with followed by `/`)

- [ ] **Step 1: Write the failing test** (replace the file)

```ts
import { describe, expect, it } from 'vitest';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { WORKSPACE_SETTINGS_NAV, settingsTabsFor, settingsTitle, visibleSettingsNav, type WorkspaceSettingsGroup } from './workspaceSettingsNav';

const shape = (groups: readonly WorkspaceSettingsGroup[]) =>
  groups.map((group) => [group.label, group.items.map((item) => `${item.label} ${item.path}${item.tabs ? ` [${item.tabs.map((tab) => tab.label).join(', ')}]` : ''}`)]);

// Settings production spec 2026-10-11 §4.2: 12 items in four groups.
describe('WORKSPACE_SETTINGS_NAV', () => {
  it('lists the four groups, their items and the merged pages tabs, in order', () => {
    expect(shape(WORKSPACE_SETTINGS_NAV)).toEqual([
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/settings/workspaceSettingsNav.test.ts`
Expected: FAIL (`settingsTabsFor` is not exported; the shape differs).

- [ ] **Step 3: Implement**

Replace the icon import list and everything from `export interface WorkspaceSettingsItem` to the end of the file with:

```ts
import { Bot, Building2, CreditCard, Database, ListTodo, Package, Plug, SlidersHorizontal, Sparkles, Upload, Users, Webhook, type LucideIcon } from 'lucide-react';
import type { Capability } from '../../features/auth/authSlice';

export interface WorkspaceSettingsTab {
  label: string;
  path: string;
  /** The capability the tab's own RequireCapability asks for. */
  capability?: Capability;
}

export interface WorkspaceSettingsItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** The capability the route's own RequireCapability asks for. An item is
   *  never drawn for someone the route would bounce. */
  capability?: Capability;
  /** A merged page (settings production spec §4.2): its tabs, each a route. */
  tabs?: readonly WorkspaceSettingsTab[];
}

export interface WorkspaceSettingsGroup {
  label: string;
  items: readonly WorkspaceSettingsItem[];
}

/** Settings' grouped navigation (settings production spec 2026-10-11 §4.2):
 *  twelve items in four groups. Work, Agents, AI and Developers are pages
 *  with tabs; their old one-page addresses redirect (routes.tsx). */
export const WORKSPACE_SETTINGS_NAV: readonly WorkspaceSettingsGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'General', path: '/settings/general', icon: Building2 },
      { label: 'People & teams', path: '/settings/people', icon: Users, capability: 'manage_users' },
      { label: 'Connections', path: '/settings/connections', icon: Plug },
      { label: 'Plan & billing', path: '/settings/billing', icon: CreditCard },
    ],
  },
  {
    label: 'Data',
    items: [
      { label: 'Attributes', path: '/settings/data', icon: Database },
      { label: 'Defaults', path: '/settings/defaults', icon: SlidersHorizontal },
      { label: 'Products', path: '/settings/products', icon: Package },
      { label: 'Imports', path: '/settings/entity-uploads', icon: Upload },
    ],
  },
  {
    label: 'Automation',
    items: [
      {
        label: 'Work',
        path: '/settings/work',
        icon: ListTodo,
        tabs: [
          { label: 'Recommendations', path: '/settings/work/recommendations' },
          { label: 'Tasks', path: '/settings/work/tasks' },
          { label: 'Notifications', path: '/settings/work/notifications' },
          { label: 'Briefs', path: '/settings/work/briefs' },
        ],
      },
      {
        label: 'Agents',
        path: '/settings/agents',
        icon: Bot,
        tabs: [
          { label: 'Agents', path: '/settings/agents' },
          { label: 'Actions & approvals', path: '/settings/agents/actions' },
        ],
      },
      {
        label: 'AI',
        path: '/settings/ai',
        icon: Sparkles,
        tabs: [
          { label: 'Attributes', path: '/settings/ai/attributes' },
          { label: 'Skills', path: '/settings/ai/skills', capability: 'view_all_accounts' },
          { label: 'Usage', path: '/settings/ai/usage', capability: 'view_all_accounts' },
          { label: 'Feedback', path: '/settings/ai/feedback', capability: 'view_all_accounts' },
        ],
      },
    ],
  },
  {
    label: 'Developers',
    items: [
      {
        label: 'Webhooks & API access',
        path: '/settings/developers',
        icon: Webhook,
        tabs: [
          { label: 'Webhooks', path: '/settings/developers/webhooks' },
          { label: 'Agent access', path: '/settings/developers/agent-access' },
        ],
      },
    ],
  },
];

const allowed = (permissions: readonly Capability[]) => (entry: { capability?: Capability }) => !entry.capability || permissions.includes(entry.capability);

/** The groups as one person sees them: gated items and tabs dropped, an
 *  item left with no tab dropped, and a group left with nothing dropped. */
export function visibleSettingsNav(permissions: readonly Capability[]): WorkspaceSettingsGroup[] {
  const can = allowed(permissions);
  return WORKSPACE_SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items
      .filter(can)
      .map((item) => (item.tabs ? { ...item, tabs: item.tabs.filter(can) } : item))
      .filter((item) => !item.tabs || item.tabs.length > 0),
  })).filter((group) => group.items.length > 0);
}

const ITEMS = WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items);

/** A settings page's h1 (UI foundations spec §6.3: it equals the nav
 *  label), read from the nav so the two never drift apart. A tab's page
 *  carries its item's name ("Work"); the tab row says which part it is. */
export function settingsTitle(path: string): string {
  const item = ITEMS.find((entry) => entry.path === path || entry.tabs?.some((tab) => tab.path === path));
  if (!item) throw new Error(`No settings page at ${path}`);
  return item.label;
}

const under = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

/** The tab row for the page at `pathname`: its item, the tabs this person
 *  may open, and the current one (the longest tab path the address is
 *  under, so /settings/agents/actions is not read as /settings/agents). */
export function settingsTabsFor(pathname: string, permissions: readonly Capability[]) {
  const item = visibleSettingsNav(permissions)
    .flatMap((group) => group.items)
    .find((entry) => entry.tabs && under(pathname, entry.path));
  if (!item?.tabs) return null;
  const tabs = [...item.tabs];
  const current = tabs
    .filter((tab) => under(pathname, tab.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path ?? tabs[0].path;
  return { item, tabs, current };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/pages/settings/workspaceSettingsNav.test.ts`
Expected: PASS. (Other suites that call `settingsTitle` with old paths now throw; Task 3 fixes them. Do not run the full suite yet.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/workspaceSettingsNav.ts src/pages/settings/workspaceSettingsNav.test.ts
git commit -m "feat(settings): twelve-item nav with tabbed pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tabs slot in SettingsFrame, SettingsTabsRoute, nested routes and redirects

**Files:**
- Modify: `src/components/ui/SettingsFrame.tsx` (add the slot only; layout changes are Task 5)
- Create: `src/pages/settings/SettingsTabsRoute.tsx`
- Modify: `src/pages/settings/routes.tsx`
- Modify (paths only): `src/pages/settings/WorkRecommendationsPage.tsx`, `WorkTasksPage.tsx`, `WorkNotificationsPage.tsx`, `BriefDeliveryPage.tsx`, `AgentsSettingsPage.tsx`, `AgentActionsPage.tsx`, `AIAttributesPage.tsx`, `WebhooksPage.tsx`, `AgentAccessPage.tsx`, `src/pages/brain/Skills.tsx`, `src/pages/brain/Feedback.tsx`, `src/pages/brain/Agents.tsx`
- Modify (links): `src/components/shared/AIAttributesPanel.tsx`, `src/pages/brain/BrainRoutes.tsx`, `src/pages/brain/Skills.tsx`
- Test: `src/pages/settings/routes.test.tsx` (extend), `src/pages/settings/SettingsTabsRoute.test.tsx` (create)

**Interfaces:**
- Consumes: `settingsTabsFor`, `settingsTitle` (Task 1); `Tabs` from `components/ui/Tabs.tsx` (link mode: `label`, `items: {key, label, to}[]`, `value`).
- Produces: `SettingsTabsSlot` (React context of `ReactNode`, default `null`) exported from `components/ui/SettingsFrame.tsx`; `SettingsFrame` renders the slot's node under its header. `SettingsTabsRoute()` route element.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/settings/SettingsTabsRoute.test.tsx`:

```tsx
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
```

Add to `src/pages/settings/routes.test.tsx`, inside a new `describe` block at the end (it reuses the file's `renderAt(url, role)`):

```tsx
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
```

Also delete or update every existing case in `routes.test.tsx` that expects an old path to render in place (for example a case asserting `/settings/ai-usage` stays): change its expectation to the new path from the table above.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/SettingsTabsRoute.test.tsx src/pages/settings/routes.test.tsx`
Expected: FAIL (module `./SettingsTabsRoute` not found; redirects missing).

- [ ] **Step 3: Implement the slot in `SettingsFrame.tsx`**

Add to the imports: `createContext, useContext` from `react`. Add above `SettingsFrame`:

```tsx
/** A tabbed settings page's tab row (settings production spec §10.3),
 *  provided by the route (pages/settings/SettingsTabsRoute) and drawn by
 *  SettingsFrame under the heading, so the pages themselves stay unaware. */
export const SettingsTabsSlot = createContext<ReactNode>(null);
```

In `SettingsFrame`, read `const tabs = useContext(SettingsTabsSlot);` and render, right after the heading row `div` (before `{children}`):

```tsx
      {tabs ? <div className="-mt-2 h-11 border-b border-line">{tabs}</div> : null}
```

- [ ] **Step 4: Create `src/pages/settings/SettingsTabsRoute.tsx`**

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import type { Capability } from '../../features/auth/authSlice';
import { SettingsTabsSlot, Tabs } from '../../components/ui';
import { settingsTabsFor } from './workspaceSettingsNav';

const NO_PERMISSIONS: Capability[] = [];

/** The route element of a merged settings page (settings production spec
 *  §4.2, §10.3): its tab row, one link per tab this person may open, handed
 *  to the page's SettingsFrame through SettingsTabsSlot. */
export function SettingsTabsRoute() {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? NO_PERMISSIONS);
  const { pathname } = useLocation();
  const found = settingsTabsFor(pathname, permissions);
  const row = found ? (
    <Tabs label={`${found.item.label} sections`} value={found.current} items={found.tabs.map((tab) => ({ key: tab.path, label: tab.label, to: tab.path }))} />
  ) : null;
  return (
    <SettingsTabsSlot.Provider value={row}>
      <Outlet />
    </SettingsTabsSlot.Provider>
  );
}
```

- [ ] **Step 5: Rewrite the route tree in `routes.tsx`**

Add `import { SettingsTabsRoute } from './SettingsTabsRoute';`. Replace the block from the Work comment through `<Route path="agent-access" … />` with:

```tsx
        {/* Merged pages (settings production spec §4.2): an item with tabs, each tab a child route. */}
        <Route path="work" element={<SettingsTabsRoute />}>
          <Route index element={<Navigate to="/settings/work/recommendations" replace />} />
          <Route path="recommendations" element={el(<WorkRecommendationsPage />)} />
          <Route path="tasks" element={el(<WorkTasksPage />)} />
          <Route path="notifications" element={el(<WorkNotificationsPage />)} />
          <Route path="briefs" element={el(<BriefDeliveryPage />)} />
        </Route>
        <Route path="agents" element={<SettingsTabsRoute />}>
          <Route index element={el(<AgentsSettingsPage />)} />
          <Route path="actions" element={el(<AgentActionsPage />)} />
        </Route>
        <Route path="ai" element={<SettingsTabsRoute />}>
          <Route index element={<Navigate to="/settings/ai/attributes" replace />} />
          <Route path="attributes" element={el(<AIAttributesPage />)} />
          <Route path="skills" element={gated('view_all_accounts', <SkillsPage />)} />
          <Route path="usage" element={gated('view_all_accounts', <AgentsPage />)} />
          <Route path="feedback" element={gated('view_all_accounts', <FeedbackLogPage />)} />
        </Route>
        <Route path="developers" element={<SettingsTabsRoute />}>
          <Route index element={<Navigate to="/settings/developers/webhooks" replace />} />
          <Route path="webhooks" element={el(<WebhooksPage />)} />
          <Route path="agent-access" element={el(<AgentAccessPage />)} />
        </Route>

        {/* The one-page addresses before the merge: bookmarks, emails, old links. */}
        <Route path="recommendations" element={<KeepLocation to="/settings/work/recommendations" />} />
        <Route path="work-tasks" element={<KeepLocation to="/settings/work/tasks" />} />
        <Route path="work-notifications" element={<KeepLocation to="/settings/work/notifications" />} />
        <Route path="brief-delivery" element={<KeepLocation to="/settings/work/briefs" />} />
        <Route path="agent-actions" element={<KeepLocation to="/settings/agents/actions" />} />
        <Route path="ai-attributes" element={<KeepLocation to="/settings/ai/attributes" />} />
        <Route path="ai-skills" element={<KeepLocation to="/settings/ai/skills" />} />
        <Route path="ai-usage" element={<KeepLocation to="/settings/ai/usage" />} />
        <Route path="ai-feedback" element={<KeepLocation to="/settings/ai/feedback" />} />
        <Route path="webhooks" element={<KeepLocation to="/settings/developers/webhooks" />} />
        <Route path="agent-access" element={<KeepLocation to="/settings/developers/agent-access" />} />
```

Keep the existing `ai-agent`, `currency`, `global-presets`, `activities`, `connect-widget`, `users` and `integrations` redirects as they are.

- [ ] **Step 6: Move every `settingsTitle` call and in-app link to the new paths**

Run: `grep -rn "settingsTitle('/settings/\|to=\"/settings/\|'/settings/ai-\|'/settings/work-\|'/settings/agent-\|'/settings/webhooks\|'/settings/brief-\|'/settings/recommendations" src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -v "pages/settings/routes.tsx"`

Change each old path to its new one (table in Step 1). Known sites: `WorkRecommendationsPage.tsx:12`, `WorkTasksPage.tsx:11`, `WorkNotificationsPage.tsx:12`, `BriefDeliveryPage.tsx:163`, `AgentActionsPage.tsx:11`, `AIAttributesPage.tsx:130`, `WebhooksPage.tsx:101`, `AgentAccessPage.tsx:114`, `brain/Skills.tsx:123` and its link at `:129` (`/settings/ai/usage`), `brain/Feedback.tsx:86`, `brain/Agents.tsx:164`, `brain/BrainRoutes.tsx:35-37`, `shared/AIAttributesPanel.tsx:95,113`. `AgentsSettingsPage.tsx` keeps `settingsTitle('/settings/agents')`.

Then update the tests that expect a page h1 equal to the old label: run `npx vitest run src/pages/settings src/pages/brain src/components/shared` and, for each failure of the form `Unable to find role "heading" … name "Tasks"`, change the expected h1 to the item label (`Work`, `Agents`, `AI`, `Webhooks & API access`); for each failure on an old URL in a `renderPage(…, URL)` call, change the URL constant to the new path.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/pages/settings src/pages/brain src/components/shared src/layouts`
Expected: PASS except `WorkspaceSettingsLayout.test.tsx`, which still lists 20 items (Task 4 rewrites it). If anything else fails, fix it before committing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(settings): tabbed Work, Agents, AI and Developers pages with redirects

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Switch `busy`

**Files:**
- Modify: `src/components/ui/Switch.tsx`
- Test: `src/components/ui/Switch.test.tsx` (extend)

**Interfaces:**
- Produces: `Switch` accepts `busy?: boolean`: sets `aria-busy="true"`, ignores clicks while busy, keeps focus (it is not `disabled`).

- [ ] **Step 1: Write the failing test** (append to `Switch.test.tsx`; use its existing imports, add `vi` and `userEvent` if missing)

```tsx
describe('Switch busy (settings production spec §10.5)', () => {
  it('is aria-busy and ignores presses while a save runs, keeping focus', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Daily digest" busy onChange={onChange} />);
    const button = screen.getByRole('switch', { name: 'Daily digest' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    button.focus();
    await userEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/ui/Switch.test.tsx`
Expected: FAIL (`aria-busy` missing).

- [ ] **Step 3: Implement**

In `Switch`, add `busy = false` to the destructured props and `busy?: boolean;` to the prop type with the doc comment `/** A save is running: aria-busy, presses ignored, focus kept. */`. On the button add `aria-busy={busy || undefined}` and change the handler to `onClick={() => { if (!busy) onChange(!checked); }}`. Append `aria-busy:cursor-progress` to the `SWITCH` string.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/components/ui/Switch.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Switch.tsx src/components/ui/Switch.test.tsx
git commit -m "feat(ui): Switch busy state for instant saves

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The frame (layout, nav heading, solid canvas, scrollbars)

**Files:**
- Modify: `src/layouts/WorkspaceSettingsLayout.tsx`
- Modify: `src/layouts/DashboardLayout.tsx:137`
- Test: `src/layouts/WorkspaceSettingsLayout.test.tsx` (rewrite the nav expectations), `src/layouts/DashboardLayout.test.tsx` (extend)

**Interfaces:**
- Consumes: `visibleSettingsNav` (Task 1), `MD`/`useMediaQuery`, `PageHeader`.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing tests**

In `WorkspaceSettingsLayout.test.tsx`, replace `ALL_ITEMS` and the group/items test with:

```tsx
const ALL_ITEMS = [
  'General', 'People & teams', 'Connections', 'Plan & billing',
  'Attributes', 'Defaults', 'Products', 'Imports',
  'Work', 'Agents', 'AI',
  'Webhooks & API access',
];

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
  });

  it('marks Work current on any of its tabs', () => {
    setViewport(1440);
    renderLayout('/settings/work/tasks');
    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts no Settings title in the bar from md; the nav carries it', () => {
    setViewport(1440);
    renderLayout('/settings/general');
    expect(screen.queryByTestId('page-header-title')).toBeNull();
  });
});
```

Check how `PageHeader` renders its title (`src/components/ui/PageHeader.tsx`): if it has no test id, assert instead with `expect(screen.getAllByText('Settings')).toHaveLength(1)`. Keep the file's phone-width tests, updating any 20-item expectations to the 12 items above (the phone `Select` lists groups and items; `Work` replaces the four Work items, and so on). Add a phone case:

```tsx
  it('keeps Settings in the bar on a phone, where there is no nav column', () => {
    setViewport(375);
    renderLayout('/settings/general');
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Workspace settings' })).toBeNull();
  });
```

In `DashboardLayout.test.tsx`, add (reusing its render helper; read the top of the file for its name):

```tsx
  it('gives Settings a solid canvas without the glow (settings production spec §10.1)', () => {
    // render the layout at /settings/general with the file's own helper
    const wrapper = document.querySelector('[data-part="content-canvas"]');
    expect(wrapper).toHaveClass('bg-base');
    expect(wrapper).not.toHaveClass('rv-canvas');
  });

  it('keeps the glow elsewhere', () => {
    // render the layout at /dashboard with the file's own helper
    expect(document.querySelector('[data-part="content-canvas"]')).toHaveClass('rv-canvas');
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/layouts/WorkspaceSettingsLayout.test.tsx src/layouts/DashboardLayout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `DashboardLayout`**

At line 137 change the content wrapper to:

```tsx
        <div inert={isDrawerOpen} data-part="content-canvas" className={`flex-1 flex flex-col relative w-full h-full overflow-hidden ${isSettings ? 'bg-base' : 'rv-canvas'}`}>
```

(`isSettings` is already defined at line 32.)

- [ ] **Step 4: Implement `WorkspaceSettingsLayout`**

- Render `<PageHeader title="Settings" titleAs="p" />` only when `!isMdUp`.
- The nav gets a heading as its first child and the solid surface:

```tsx
          <nav aria-label="Workspace settings" className="flex w-56 shrink-0 flex-col gap-5 overflow-y-auto rv-scrollbar border-r border-line bg-base px-3 py-4">
            <p className={`px-2 ${TYPE.title}`}>Settings</p>
            {groups.map((group) => ( /* unchanged */ ))}
          </nav>
```

- The content column gets the thin scrollbar: `className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rv-scrollbar"`.
- Update the component's doc comment: "Settings" moved from the bar into the nav from md (settings production spec §4.1, §10.2).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/layouts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/layouts
git commit -m "feat(settings): solid canvas and a Settings heading in the nav

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: SettingsFrame, SettingsSection, SettingsRow layout

**Files:**
- Modify: `src/components/ui/SettingsFrame.tsx`
- Modify: every caller passing `width="wide"` (find with `grep -rn 'width="wide"' src | grep -v test`)
- Test: `src/components/ui/SettingsFrame.test.tsx` (extend; fix cases that asserted old classes)

**Interfaces:**
- Produces:
  - `SettingsFrame` props: `title, intro?, note?, action?, headingRef?, children` (the `width` prop is removed).
  - `SettingsSection` gains `variant?: 'default' | 'danger'`. A section with `list` or `header` is stacked; otherwise two columns from `lg`.
  - `SettingsRow` unchanged props; new layout.

- [ ] **Step 1: Write the failing tests** (append to `SettingsFrame.test.tsx`; reuse its imports)

```tsx
describe('production layout (settings production spec §5.1-§5.3)', () => {
  it('caps every page at one width', () => {
    const { container } = render(<SettingsFrame title="General">{null}</SettingsFrame>);
    expect(container.firstElementChild).toHaveClass('max-w-[960px]');
  });

  it('lays a form section out in two columns from lg, help on the left', () => {
    render(
      <SettingsFrame title="General">
        <SettingsSection title="Workspace" description="Name and address people see.">
          <SettingsRow label="Name">x</SettingsRow>
        </SettingsSection>
      </SettingsFrame>,
    );
    const section = screen.getByRole('region', { name: 'Workspace' });
    expect(section).toHaveClass('lg:grid-cols-[260px_minmax(0,1fr)]');
  });

  it('keeps a list section stacked at every width', () => {
    render(
      <SettingsSection title="Products" list="Products">
        <li>One</li>
      </SettingsSection>,
    );
    expect(screen.getByRole('region', { name: 'Products' })).not.toHaveClass('lg:grid-cols-[260px_minmax(0,1fr)]');
  });

  it('colours a danger section title', () => {
    render(
      <SettingsSection title="Danger zone" variant="danger">
        <SettingsRow label="New owner">x</SettingsRow>
      </SettingsSection>,
    );
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toHaveClass('text-danger-ink');
  });

  it('puts the control at the end of the row from sm', () => {
    render(
      <SettingsSection title="Digest">
        <SettingsRow label="Daily digest">
          <span data-testid="control">c</span>
        </SettingsRow>
      </SettingsSection>,
    );
    expect(screen.getByTestId('control').parentElement).toHaveClass('sm:items-end');
  });
});
```

`<section aria-labelledby>` has the implicit role `region` once named, which is why `getByRole('region', { name })` works.

- [ ] **Step 2: Run them**

Run: `npx vitest run src/components/ui/SettingsFrame.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`SettingsFrame`: remove `width` from props and type. Its root:

```tsx
    <div className="flex w-full max-w-[960px] flex-col gap-8 px-4 pt-8 pb-6 md:px-6">
```

Children go in `<div className="flex flex-col gap-8">{children}</div>` after the tabs slot. Update the doc comment: one width for every page (spec §5.1); the `wide` list in the comment goes.

`SettingsSection`: add `variant = 'default'` to props (`variant?: 'default' | 'danger'`). Compute `const stacked = Boolean(list || header);`. The heading class is `${TYPE.title}` for default and, for danger, the same string with `text-ink` replaced: use `TYPE.title.replace('text-ink', 'text-danger-ink')` (TYPE strings must not get a second colour appended). Return:

```tsx
    <section
      aria-labelledby={headingId}
      className={`@container [section+&]:border-t [section+&]:border-line [section+&]:pt-8 ${stacked ? 'flex flex-col gap-3' : 'grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8'}`}
    >
      <div className={stacked ? 'flex flex-wrap items-end justify-between gap-3' : 'flex min-w-0 flex-col gap-1'}>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 /* id, ref, tabIndex as today */ className={/* heading class, plus `rounded-sm ${FOCUS}` when headingRef */}>{title}</h2>
          {description ? <div className={`${TYPE.bodyMuted} ${stacked ? 'max-w-[68ch]' : 'max-w-[40ch]'}`}>{description}</div> : null}
        </div>
        {action ? <div className={stacked ? 'flex shrink-0 items-center gap-2' : 'mt-2 flex items-center gap-2'}>{action}</div> : null}
      </div>
      <Card as="div" pad="none" className={`min-w-0 ${list ? 'overflow-hidden' : ''}`}>
        {header}
        {body}
        {footer ? <CardFooter>{footer}</CardFooter> : null}
      </Card>
    </section>
```

`SettingsRow` (non-stacked): replace the grid class with
`'flex min-h-14 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6'`; the label block gets `min-w-0 sm:flex-1`; the control block becomes
`<div className="flex w-full min-w-0 flex-col sm:w-auto sm:min-w-64 sm:max-w-sm sm:items-end">`, with the error paragraph inside it as today. Stacked rows keep `'flex flex-col gap-2 px-4 py-3'`.

Remove `width="wide"` from every caller found by the grep.

- [ ] **Step 4: Run the ui and settings tests**

Run: `npx vitest run src/components/ui src/pages/settings src/pages/brain src/pages/users src/pages/integrations`
Expected: PASS. A failure that asserted the old grid classes (`sm:grid-cols-[minmax(0,14rem)_1fr]`, `max-w-3xl`, `max-w-5xl`) is updated to the new classes; a failure on behaviour is a bug to fix.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): one width, two-column sections, end-aligned controls

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Toast

**Files:**
- Create: `src/components/ui/Toast.tsx`
- Modify: `src/components/ui/index.ts` (add `export * from './Toast';`)
- Test: `src/components/ui/Toast.test.tsx`

**Interfaces:**
- Produces:
  - `interface ToastSpec { message: string; action?: { label: string; onAction: () => void } }`
  - `ToastProvider({ children })`
  - `useToast(): (toast: ToastSpec) => void` (a no-op outside a provider)
  - `TOAST_MS = 5000`

- [ ] **Step 1: Write the failing test**

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TOAST_MS, ToastProvider, useToast } from './Toast';

function Shout({ withUndo = false, onUndo = () => {} }: { withUndo?: boolean; onUndo?: () => void }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ message: 'Saved', action: withUndo ? { label: 'Undo', onAction: onUndo } : undefined })}>
      Go
    </button>
  );
}

afterEach(() => vi.useRealTimers());

describe('Toast (settings production spec §5.4)', () => {
  it('announces its message politely and leaves after five seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <Shout />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('runs its action once and closes', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Shout withUndo onUndo={onUndo} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('does nothing outside a provider', async () => {
    render(<Shout />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/ui/Toast.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/components/ui/Toast.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { OVERLAY, QUIET } from './styles';
import { TYPE } from './type';

export interface ToastSpec {
  message: string;
  action?: { label: string; onAction: () => void };
}

export const TOAST_MS = 5000;

const ToastContext = createContext<(toast: ToastSpec) => void>(() => {});

/** "Saved", with an Undo (settings production spec §5.4). One toast at a
 *  time, top right under the bar so it never covers the save bar; the
 *  region is always mounted so a new message is announced. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const next = useRef(0);
  const show = useCallback((spec: ToastSpec) => {
    window.clearTimeout(timer.current);
    next.current += 1;
    setToast({ ...spec, id: next.current });
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 top-16 z-50 flex flex-col items-end">
        {toast ? (
          <div key={toast.id} className={`pointer-events-auto flex items-center gap-2 py-1 pl-4 pr-1 motion-safe:animate-fade-up ${OVERLAY}`}>
            <span className={TYPE.body}>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className={QUIET}
                onClick={() => {
                  const action = toast.action;
                  window.clearTimeout(timer.current);
                  setToast(null);
                  action?.onAction();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

/** Show a toast; outside a ToastProvider it does nothing. */
export const useToast = () => useContext(ToastContext);
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/components/ui/Toast.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Toast.tsx src/components/ui/Toast.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): toast with one action

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: useInstantSave

**Files:**
- Create: `src/components/ui/useInstantSave.ts`
- Modify: `src/components/ui/index.ts` (add `export * from './useInstantSave';`)
- Test: `src/components/ui/useInstantSave.test.tsx`

**Interfaces:**
- Consumes: `useToast` (Task 6).
- Produces:

```ts
export interface InstantChange<S> {
  /** Which control is saving, for `busyKey`. */
  key: string;
  request: () => Promise<S>;
  onSaved: (saved: S) => void;
  /** Sends the previous value back; with it the toast offers Undo. */
  undo?: () => Promise<S>;
  onUndone?: (restored: S) => void;
  onError: (error: unknown) => void;
}
export function useInstantSave(): { busyKey: string | null; run: <S>(change: InstantChange<S>) => Promise<boolean> };
export const INSTANT = { SAVED: 'Saved', UNDO: 'Undo', UNDONE: 'Change undone', UNDO_FAILED: 'Could not undo that change.' } as const;
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './Toast';
import { INSTANT, useInstantSave, type InstantChange } from './useInstantSave';

function Probe({ change }: { change: InstantChange<string> }) {
  const { busyKey, run } = useInstantSave();
  return (
    <>
      <button type="button" onClick={() => void run(change)}>
        Change
      </button>
      <p data-testid="busy">{busyKey ?? ''}</p>
    </>
  );
}

const renderProbe = (change: InstantChange<string>) =>
  render(
    <ToastProvider>
      <Probe change={change} />
    </ToastProvider>,
  );

describe('useInstantSave (settings production spec §5.4, §10.5)', () => {
  it('saves, reports the answer, then offers Undo that sends the previous value', async () => {
    const onSaved = vi.fn();
    const onUndone = vi.fn();
    const undo = vi.fn().mockResolvedValue('old');
    renderProbe({ key: 'tone', request: () => Promise.resolve('new'), onSaved, undo, onUndone, onError: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onSaved).toHaveBeenCalledWith('new');
    expect(screen.getByRole('status')).toHaveTextContent(INSTANT.SAVED);
    await userEvent.click(screen.getByRole('button', { name: INSTANT.UNDO }));
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith('old'));
    expect(screen.getByRole('status')).toHaveTextContent(INSTANT.UNDONE);
  });

  it('marks the control busy while it runs and sends one request at a time', async () => {
    let finish: (value: string) => void = () => {};
    const request = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    renderProbe({ key: 'tone', request, onSaved: vi.fn(), onError: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByTestId('busy')).toHaveTextContent('tone');
    expect(request).toHaveBeenCalledTimes(1);
    finish('done');
    await waitFor(() => expect(screen.getByTestId('busy')).toHaveTextContent(''));
  });

  it('hands a refusal to onError and shows no toast', async () => {
    const onError = vi.fn();
    const failure = new Error('no');
    renderProbe({ key: 'tone', request: () => Promise.reject(failure), onSaved: vi.fn(), onError });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('says so when the undo fails', async () => {
    renderProbe({ key: 'tone', request: () => Promise.resolve('new'), onSaved: vi.fn(), undo: () => Promise.reject(new Error('x')), onError: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: INSTANT.UNDO }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(INSTANT.UNDO_FAILED));
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/ui/useInstantSave.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/components/ui/useInstantSave.ts`**

```ts
import { useCallback, useRef, useState } from 'react';
import { useToast } from './Toast';

export const INSTANT = { SAVED: 'Saved', UNDO: 'Undo', UNDONE: 'Change undone', UNDO_FAILED: 'Could not undo that change.' } as const;

export interface InstantChange<S> {
  /** Which control is saving, for `busyKey`. */
  key: string;
  request: () => Promise<S>;
  onSaved: (saved: S) => void;
  /** Sends the previous value back; with it the toast offers Undo. */
  undo?: () => Promise<S>;
  onUndone?: (restored: S) => void;
  onError: (error: unknown) => void;
}

/** A setting that saves the moment it changes (settings production spec
 *  §5.4, §10.5): one request at a time, the control keeping its value until
 *  the server answers, then "Saved" with an Undo that sends the previous
 *  value back through the same call. A refusal goes to `onError` (the form
 *  shows it under the row); there is nothing to revert. */
export function useInstantSave() {
  const toast = useToast();
  const running = useRef(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const run = useCallback(
    async <S,>(change: InstantChange<S>): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      setBusyKey(change.key);
      try {
        const saved = await change.request();
        change.onSaved(saved);
        const undo = change.undo;
        toast({
          message: INSTANT.SAVED,
          action: undo
            ? {
                label: INSTANT.UNDO,
                onAction: () => {
                  undo().then(
                    (restored) => {
                      change.onUndone?.(restored);
                      toast({ message: INSTANT.UNDONE });
                    },
                    () => toast({ message: INSTANT.UNDO_FAILED }),
                  );
                },
              }
            : undefined,
        });
        return true;
      } catch (error) {
        change.onError(error);
        return false;
      } finally {
        running.current = false;
        setBusyKey(null);
      }
    },
    [toast],
  );

  return { busyKey, run };
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/components/ui/useInstantSave.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/useInstantSave.ts src/components/ui/useInstantSave.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): useInstantSave with an Undo toast

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The draft scope, the save bar and the leave guard

**Files:**
- Create: `src/components/ui/SettingsDraft.tsx`
- Modify: `src/components/ui/index.ts` (add `export * from './SettingsDraft';`)
- Modify: `src/components/ui/SettingsFrame.tsx` (wrap in `ToastProvider` + `SettingsDraftScope`)
- Test: `src/components/ui/SettingsDraft.test.tsx`

**Interfaces:**
- Consumes: `useUnsavedGuard` (`src/hooks/useUnsavedGuard.ts`: `useUnsavedGuard(dirty) => { pending, stay, leave }`), `UnsavedChangesDialog` (`src/hooks/UnsavedChangesDialog.tsx`: props `subject, onConfirm: () => Promise<void>, onClose`), `ToastProvider` (Task 6).
- Produces:
  - `interface DraftSection { dirty: boolean; saving: boolean; save: () => Promise<boolean>; discard: () => void }`
  - `useSettingsDraft(section: DraftSection): void` (registers while mounted; outside a scope it does nothing)
  - `SettingsDraftScope({ children })` (provider + the bar after `children`)
  - `DRAFT = { UNSAVED: 'Unsaved changes', DISCARD: 'Discard', SAVE: 'Save', SAVING: 'Saving…', SAVED: 'Saved.' }`
  - `SettingsFrame` now renders `<ToastProvider><SettingsDraftScope>…page…</SettingsDraftScope></ToastProvider>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { DRAFT, SettingsDraftScope, useSettingsDraft } from './SettingsDraft';

function Field({ name, save }: { name: string; save: (value: string) => Promise<boolean> }) {
  const [saved, setSaved] = useState('a');
  const [value, setValue] = useState('a');
  useSettingsDraft({
    dirty: value !== saved,
    saving: false,
    save: async () => {
      const ok = await save(value);
      if (ok) setSaved(value);
      return ok;
    },
    discard: () => setValue(saved),
  });
  return <input aria-label={name} value={value} onChange={(event) => setValue(event.target.value)} />;
}

function page(saveOne = vi.fn().mockResolvedValue(true), saveTwo = vi.fn().mockResolvedValue(true)) {
  render(
    <MemoryRouter initialEntries={['/settings/work/tasks']}>
      <Routes>
        <Route
          path="/settings/work/tasks"
          element={
            <SettingsDraftScope>
              <Field name="One" save={saveOne} />
              <Field name="Two" save={saveTwo} />
              <Link to="/settings/general">General</Link>
            </SettingsDraftScope>
          }
        />
        <Route path="/settings/general" element={<p>General page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { saveOne, saveTwo };
}

describe('SettingsDraftScope (settings production spec §5.4)', () => {
  it('shows no bar until something is edited', () => {
    page();
    expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull();
  });

  it('saves every edited section with one Save, then says so', async () => {
    const { saveOne, saveTwo } = page();
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.type(screen.getByLabelText('Two'), 'c');
    expect(screen.getByText(DRAFT.UNSAVED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    expect(saveOne).toHaveBeenCalledWith('ab');
    expect(saveTwo).toHaveBeenCalledWith('ac');
    await waitFor(() => expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(DRAFT.SAVED);
  });

  it('keeps the bar while a section is refused, and saves only what is still edited next time', async () => {
    const saveTwo = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { saveOne } = page(undefined, saveTwo);
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.type(screen.getByLabelText('Two'), 'c');
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    await waitFor(() => expect(saveTwo).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: DRAFT.SAVE })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: DRAFT.SAVE }));
    await waitFor(() => expect(saveTwo).toHaveBeenCalledTimes(2));
    expect(saveOne).toHaveBeenCalledTimes(1);
  });

  it('discards every edit', async () => {
    page();
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.click(screen.getByRole('button', { name: DRAFT.DISCARD }));
    expect(screen.getByLabelText('One')).toHaveValue('a');
    expect(screen.queryByRole('button', { name: DRAFT.SAVE })).toBeNull();
  });

  it('asks before an in-app link leaves unsaved edits, and leaves on Leave', async () => {
    page();
    await userEvent.type(screen.getByLabelText('One'), 'b');
    await userEvent.click(screen.getByRole('link', { name: 'General' }));
    expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('General page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/ui/SettingsDraft.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/components/ui/SettingsDraft.tsx`**

```tsx
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { UnsavedChangesDialog } from '../../hooks/UnsavedChangesDialog';
import { PRIMARY, QUIET } from './styles';
import { TYPE } from './type';

export const DRAFT = { UNSAVED: 'Unsaved changes', DISCARD: 'Discard', SAVE: 'Save', SAVING: 'Saving…', SAVED: 'Saved.' } as const;

export interface DraftSection {
  dirty: boolean;
  saving: boolean;
  /** Saves this section's edits; false when refused (the section shows why). */
  save: () => Promise<boolean>;
  discard: () => void;
}

type Flags = Record<string, { dirty: boolean; saving: boolean }>;
interface Registry {
  handlers: { current: Map<string, Pick<DraftSection, 'save' | 'discard'>> };
  setFlags: (update: (current: Flags) => Flags) => void;
}

const RegistryContext = createContext<Registry | null>(null);
const FlagsContext = createContext<Flags>({});

/** One settings section's typed edits, handed to the page's save bar
 *  (settings production spec §5.4): while mounted, the bar knows whether it
 *  is edited or saving, and can save or discard it. Outside a
 *  SettingsDraftScope it does nothing. */
export function useSettingsDraft(section: DraftSection) {
  const registry = useContext(RegistryContext);
  const id = useId();
  // The latest handlers, every render, without a re-render of the bar.
  useLayoutEffect(() => {
    registry?.handlers.current.set(id, { save: section.save, discard: section.discard });
  });
  useEffect(() => {
    registry?.setFlags((current) =>
      current[id]?.dirty === section.dirty && current[id]?.saving === section.saving ? current : { ...current, [id]: { dirty: section.dirty, saving: section.saving } },
    );
  }, [registry, id, section.dirty, section.saving]);
  useEffect(
    () => () => {
      registry?.handlers.current.delete(id);
      registry?.setFlags((current) => {
        const rest = { ...current };
        delete rest[id];
        return rest;
      });
    },
    [registry, id],
  );
}

function SaveBar({ registry }: { registry: Registry }) {
  const flags = useContext(FlagsContext);
  const dirtyIds = Object.keys(flags).filter((id) => flags[id].dirty);
  const dirty = dirtyIds.length > 0;
  const sectionSaving = Object.values(flags).some((flag) => flag.saving);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const guard = useUnsavedGuard(dirty);
  useEffect(() => {
    if (dirty) setStatus('');
  }, [dirty]);

  const busy = running || sectionSaving;
  async function saveAll() {
    if (!dirty || busy) return;
    setRunning(true);
    let ok = true;
    for (const id of dirtyIds) {
      const handler = registry.handlers.current.get(id);
      if (handler && !(await handler.save())) ok = false;
    }
    setRunning(false);
    if (ok) setStatus(DRAFT.SAVED);
  }
  const discardAll = () => {
    for (const id of dirtyIds) registry.handlers.current.get(id)?.discard();
  };

  const shown = dirty || busy;
  return (
    <>
      <div
        data-part="save-bar"
        className={shown ? '-mx-4 md:-mx-6 sticky bottom-0 z-10 flex items-center gap-2 border-t border-line bg-surface px-4 py-3 md:px-6 motion-safe:animate-fade-up' : 'contents'}
      >
        <p role="status" className={shown ? `mr-auto ${TYPE.label}` : 'sr-only'}>
          {shown ? DRAFT.UNSAVED : status}
        </p>
        {shown ? (
          <>
            <button type="button" onClick={discardAll} aria-disabled={busy || undefined} className={QUIET}>
              {DRAFT.DISCARD}
            </button>
            <button type="button" onClick={() => void saveAll()} aria-disabled={busy || undefined} aria-busy={busy || undefined} className={PRIMARY}>
              {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
              {busy ? DRAFT.SAVING : DRAFT.SAVE}
            </button>
          </>
        ) : null}
      </div>
      {guard.pending ? (
        <UnsavedChangesDialog
          subject="page"
          onConfirm={async () => {
            discardAll();
            guard.leave();
          }}
          onClose={guard.stay}
        />
      ) : null}
    </>
  );
}

/** A settings page's draft scope (settings production spec §5.4, §10.6,
 *  §10.7): the sections inside register their typed edits; one sticky bar
 *  ("Unsaved changes · Discard · Save") saves every edited section in
 *  order, keeps a refused one edited (its error is under its field), and
 *  an in-app link or closing the tab asks first while anything is edited. */
export function SettingsDraftScope({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<string, Pick<DraftSection, 'save' | 'discard'>>());
  const [flags, setFlags] = useState<Flags>({});
  const registry = useMemo<Registry>(() => ({ handlers, setFlags }), []);
  return (
    <RegistryContext.Provider value={registry}>
      <FlagsContext.Provider value={flags}>
        {children}
        <SaveBar registry={registry} />
      </FlagsContext.Provider>
    </RegistryContext.Provider>
  );
}
```

If `UnsavedChangesDialog`'s message reads oddly with `subject="page"` ("Your changes to this page will be lost."), that wording is accepted.

- [ ] **Step 4: Mount it in `SettingsFrame`**

Import `ToastProvider` from `./Toast` and `SettingsDraftScope` from `./SettingsDraft`. Wrap the frame's root `div`'s inner content: the root `div` stays the outer element (so its `max-w-[960px]` test holds); inside it render `<ToastProvider><SettingsDraftScope>{heading row}{tabs}{children wrapper}</SettingsDraftScope></ToastProvider>`. Because `SettingsDraftScope` renders the bar after its children, the bar is the frame's last child and sticks to the bottom of the content column.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/ui`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui
git commit -m "feat(ui): settings draft scope with one save bar and a leave guard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: DayChips and Banner

**Files:**
- Create: `src/components/ui/DayChips.tsx`, `src/components/ui/Banner.tsx`
- Modify: `src/components/ui/index.ts` (export both)
- Test: `src/components/ui/DayChips.test.tsx`, `src/components/ui/Banner.test.tsx`

**Interfaces:**
- Produces:
  - `DayChips({ label, days, value, onChange, describedBy? })` where `days: readonly { value: number; label: string }[]` (full names, e.g. `WEEKDAYS` from `features/work/workTracking`), `value: readonly number[]`, `onChange(next: number[])` (sorted ascending). Each chip is a `button` with `aria-pressed` and the full day name as its accessible name; visible text is the first letter.
  - `Banner({ tone = 'info', children, action? })` with `tone: 'info' | 'warning'`.

- [ ] **Step 1: Write the failing tests**

`DayChips.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayChips } from './DayChips';

const DAYS = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' }, { value: 7, label: 'Sunday' },
];

describe('DayChips (settings production spec §5.5)', () => {
  it('names each chip by its full day and shows its first letter', () => {
    render(<DayChips label="Working days" days={DAYS} value={[1, 2]} onChange={vi.fn()} />);
    const monday = screen.getByRole('button', { name: 'Monday' });
    expect(monday).toHaveTextContent('M');
    expect(monday).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Working days' })).toBeInTheDocument();
  });

  it('adds and removes a day, keeping the order', async () => {
    const onChange = vi.fn();
    render(<DayChips label="Working days" days={DAYS} value={[3, 1]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3]);
    await userEvent.click(screen.getByRole('button', { name: 'Wednesday' }));
    expect(onChange).toHaveBeenLastCalledWith([1]);
  });
});
```

`Banner.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Banner } from './Banner';

describe('Banner (settings production spec §5.5)', () => {
  it('reads as a note with its sentence', () => {
    render(<Banner tone="warning">Email isn't set up on this server yet.</Banner>);
    expect(screen.getByRole('note')).toHaveTextContent("Email isn't set up on this server yet.");
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/components/ui/DayChips.test.tsx src/components/ui/Banner.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`DayChips.tsx`:

```tsx
import { FOCUS } from './styles';

const CHIP = `inline-flex min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 items-center justify-center rounded-md border text-[13px] font-semibold ${FOCUS}`;

/** The week as seven toggles (settings production spec §5.5): the first
 *  letter shown, the full day as each one's name, pressed when chosen. */
export function DayChips({
  label,
  days,
  value,
  onChange,
  describedBy,
}: {
  label: string;
  days: readonly { value: number; label: string }[];
  value: readonly number[];
  onChange: (next: number[]) => void;
  describedBy?: string;
}) {
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex flex-wrap gap-1">
      {days.map((day) => {
        const on = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={on}
            aria-label={day.label}
            onClick={() => onChange((on ? value.filter((d) => d !== day.value) : [...value, day.value]).slice().sort((a, b) => a - b))}
            className={`${CHIP} ${on ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-muted hover:text-ink'}`}
          >
            {day.label.charAt(0)}
          </button>
        );
      })}
    </div>
  );
}
```

`Banner.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { TYPE } from './type';

/** One sentence the whole page needs to know (settings production spec
 *  §5.5): an icon, the sentence, an optional link or button. Warning text
 *  stays in ink; the amber is the tint and the icon. */
export function Banner({ tone = 'info', action, children }: { tone?: 'info' | 'warning'; action?: ReactNode; children: ReactNode }) {
  const Icon = tone === 'warning' ? TriangleAlert : Info;
  return (
    <div role="note" className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone === 'warning' ? 'border-warning/30 bg-warning-dim' : 'border-line bg-subtle'}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'warning' ? 'text-warning' : 'text-ink-faint'}`} aria-hidden="true" />
      <p className={`min-w-0 flex-1 ${TYPE.body}`}>{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
```

Before committing, confirm `bg-warning-dim`, `border-warning`, `text-warning` exist as tokens: `grep -n "warning-dim\|--color-warning" src/index.css`. If `border-warning/30` is not supported for that token, use `border-line`.

- [ ] **Step 4: Run them**

Run: `npx vitest run src/components/ui/DayChips.test.tsx src/components/ui/Banner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui
git commit -m "feat(ui): day chips and banner

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Work › Notifications saves instantly

**Files:**
- Modify: `src/components/work/WorkNotificationsForm.tsx`
- Modify: `src/pages/settings/WorkNotificationsPage.tsx` (the email warning becomes a `Banner`)
- Test: `src/pages/settings/WorkNotificationsPage.test.tsx` (update)

**Interfaces:**
- Consumes: `useInstantSave`, `Switch` `busy`, `Banner`, `patchWorkSettings(patch: WorkSettingsPatch): Promise<WorkSettings>`, `readRefusal(error, fallback): Refusal`.

- [ ] **Step 1: Update the page test** (replace the Save-button cases; keep load/error/summary cases)

```tsx
  it('saves the digest switch the moment it changes, with an Undo (settings production spec §5.4)', async () => {
    const spy = stubWork();
    renderPage(<WorkNotificationsPage />, URL);
    const digest = await screen.findByRole('switch', { name: 'Daily digest' });
    expect(digest).toHaveAttribute('aria-checked', 'true');
    expect(digest).not.toHaveTextContent('On');
    await userEvent.click(digest);
    await waitFor(() => expect(digest).toHaveAttribute('aria-checked', 'false'));
    expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_enabled: false }]);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_enabled: false }, { digest_enabled: true }]));
    await waitFor(() => expect(digest).toHaveAttribute('aria-checked', 'true'));
  });

  it('saves the hour the moment it is chosen', async () => {
    const spy = stubWork();
    renderPage(<WorkNotificationsPage />, URL);
    await userEvent.selectOptions(await screen.findByLabelText('Send after'), '9');
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ digest_hour: 9 }]));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('shows a refusal under the row and keeps the saved value', async () => {
    stubWork({ refuseNextSettings: { digest_enabled: ['Not now.'] } });
    renderPage(<WorkNotificationsPage />, URL);
    const digest = await screen.findByRole('switch', { name: 'Daily digest' });
    await userEvent.click(digest);
    expect(await screen.findByText('Not now.')).toBeInTheDocument();
    expect(digest).toHaveAttribute('aria-checked', 'true');
  });
```

Read `WorkStub` in `src/features/work/testWork.ts` (line 48) for the exact shape of `refuseNextSettings` and the label text of the hour select (`TRACK.DIGEST_HOUR`); adjust the literal strings to match. Also update the email-warning case to `expect(screen.getByRole('note')).toHaveTextContent(…)`.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/pages/settings/WorkNotificationsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `WorkNotificationsForm.tsx`**

```tsx
import { useId, useState } from 'react';
import { NO_REFUSAL, patchWorkSettings, readRefusal, type Refusal } from '../../features/work/workApi';
import { HOURS, TRACK, hourLabel, hourNote } from '../../features/work/workTracking';
import type { WorkSettings, WorkSettingsPatch } from '../../features/work/workTypes';
import { FORM_ALERT, Select, SettingsRow, SettingsSection, Switch, useInstantSave } from '../ui';

/** Settings › Work › Notifications for an admin (delivery 3 Decisions 4,
 *  5; settings production spec §6): the daily digest and the hour it goes
 *  out after, each saved the moment it changes, with an Undo. */
export function WorkNotificationsForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const instant = useInstantSave();
  const failed = refusal.field;

  const change = (key: 'digest_enabled' | 'digest_hour', patch: WorkSettingsPatch, back: WorkSettingsPatch) => {
    setRefusal(NO_REFUSAL);
    void instant.run({
      key,
      request: () => patchWorkSettings(patch),
      onSaved,
      undo: () => patchWorkSettings(back),
      onUndone: onSaved,
      onError: (error) => setRefusal(readRefusal(error, TRACK.SAVE_FAILED)),
    });
  };

  const hourId = `${ids}-hour`;
  return (
    <div className="flex flex-col gap-3">
      <SettingsSection title={TRACK.DIGEST_SECTION}>
        <SettingsRow label={TRACK.DIGEST} hint={TRACK.DIGEST_DETAIL} hintId={`${ids}-digest-detail`} error={failed.digest_enabled || undefined} errorId={`${ids}-digest-error`}>
          <Switch
            checked={settings.digest_enabled}
            label={TRACK.DIGEST}
            busy={instant.busyKey === 'digest_enabled'}
            describedBy={failed.digest_enabled ? `${ids}-digest-detail ${ids}-digest-error` : `${ids}-digest-detail`}
            onChange={(next) => change('digest_enabled', { digest_enabled: next }, { digest_enabled: settings.digest_enabled })}
          />
        </SettingsRow>
        <SettingsRow label={TRACK.DIGEST_HOUR} htmlFor={hourId} hint={hourNote(settings.timezone)} hintId={`${hourId}-detail`} error={failed.digest_hour || undefined} errorId={`${hourId}-error`}>
          <Select
            id={hourId}
            label={TRACK.DIGEST_HOUR}
            labelPosition="external"
            value={String(settings.digest_hour)}
            invalid={Boolean(failed.digest_hour)}
            describedBy={failed.digest_hour ? `${hourId}-detail ${hourId}-error` : `${hourId}-detail`}
            onChange={(value) => change('digest_hour', { digest_hour: Number(value) }, { digest_hour: settings.digest_hour })}
            options={HOURS.map((hour) => ({ value: String(hour), label: hourLabel(hour) }))}
            className="sm:w-28"
          />
        </SettingsRow>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
    </div>
  );
}
```

If `WorkSettingsPatch` is not exported from `workTypes`, import it from where `patchWorkSettings`'s signature takes it (`features/work/workApi.ts` line 50). Delete `noticesDraftOf`/`noticesPatchOf`/`NoticesDraft` from `workTracking.ts` only if nothing else imports them (`grep -rn "noticesDraftOf\|noticesPatchOf" src`); otherwise leave them.

In `WorkNotificationsPage.tsx`, replace `<SettingsNote icon="warning">{TRACK.NO_EMAIL}</SettingsNote>` with `<Banner tone="warning">{TRACK.NO_EMAIL}</Banner>` and fix the import.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/pages/settings/WorkNotificationsPage.test.tsx src/features/work`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): Work notifications save the moment they change

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Work › Tasks (instant timezone; escalate and days as a draft)

**Files:**
- Modify: `src/components/work/WorkTasksForm.tsx`
- Test: `src/pages/settings/WorkTasksPage.test.tsx` (update)

**Interfaces:**
- Consumes: `useInstantSave`, `useSettingsDraft`, `DayChips`, `DRAFT`, existing `tasksDraftOf`, `tasksPatchOf`, `validateTasks`, `WEEKDAYS`, `useSubmitOnce`.

- [ ] **Step 1: Update the page test**

Replace the cases that used the "Save changes" button and the day checkboxes:

```tsx
  it('saves the timezone the moment it is chosen', async () => {
    const spy = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await userEvent.selectOptions(await screen.findByLabelText('Timezone'), 'Europe/London');
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ timezone: 'Europe/London' }]));
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('collects the threshold and the days in the save bar, and sends them with one Save', async () => {
    const spy = stubWork();
    renderPage(<WorkTasksPage />, URL);
    await retype(ESCALATE, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ escalate_after_days: 5, working_days: [1, 2, 3, 4, 5, 6] }]));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('keeps a refused threshold in the bar with its error under the field', async () => {
    stubWork({ refuseNextSettings: { escalate_after_days: ['Too many.'] } });
    renderPage(<WorkTasksPage />, URL);
    await retype(ESCALATE, '99');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Too many.')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('discards the edits', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, URL);
    await retype(ESCALATE, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText(ESCALATE)).toHaveValue('2');
  });
```

In the first test of the file, replace the checkbox loop with `DAYS.forEach((day, index) => expect(screen.getByRole('button', { name: day })).toHaveAttribute('aria-pressed', index < 5 ? 'true' : 'false'));` and the "Save changes … aria-disabled" line with `expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();`. Keep the local validation cases, triggering them with the bar's Save.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/pages/settings/WorkTasksPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite the logic of `WorkTasksForm.tsx`**

Keep the imports it still uses and add `DayChips, useInstantSave, useSettingsDraft` from `../ui`; drop `CHECKBOX, CHOICE, SettingsSave`. Replace the body of the component with:

```tsx
export function WorkTasksForm({ settings, onSaved }: { settings: WorkSettings; onSaved: (next: WorkSettings) => void }) {
  const ids = useId();
  const [draft, setDraft] = useState<TasksDraft>(() => tasksDraftOf(settings));
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const saving = useSubmitOnce();
  const instant = useInstantSave();
  const zones = useMemo(() => timezoneOptions(settings.timezone), [settings.timezone]);
  // The timezone saves on its own; the bar holds only the threshold and the days.
  const pending = tasksPatchOf(settings, { ...draft, timezone: settings.timezone });
  const dirty = Object.keys(pending).length > 0;
  const failed = refusal.field;
  const edit = (field: keyof Refusal['field'], change: (current: TasksDraft) => TasksDraft) => {
    setRefusal((current) => {
      if (!current.field[field]) return current;
      const rest = { ...current.field };
      delete rest[field];
      return { ...current, field: rest };
    });
    setDraft(change);
  };

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const local = validateTasks(draft);
    if (Object.keys(local.field).length > 0) {
      setRefusal(local);
      return false;
    }
    setRefusal(NO_REFUSAL);
    const outcome = await saving.run(() => patchWorkSettings(pending));
    if (!outcome) return false;
    if (!outcome.ok) {
      setRefusal(readRefusal(outcome.error, TRACK.SAVE_FAILED));
      return false;
    }
    setDraft(tasksDraftOf(outcome.value));
    onSaved(outcome.value);
    return true;
  }

  useSettingsDraft({
    dirty,
    saving: saving.busy,
    save,
    discard: () => {
      setDraft(tasksDraftOf(settings));
      setRefusal(NO_REFUSAL);
    },
  });

  const changeZone = (timezone: string) => {
    const previous = settings.timezone;
    if (timezone === previous) return;
    const synced = (next: WorkSettings) => {
      onSaved(next);
      setDraft((current) => ({ ...current, timezone: next.timezone }));
    };
    void instant.run({
      key: 'timezone',
      request: () => patchWorkSettings({ timezone }),
      onSaved: synced,
      undo: () => patchWorkSettings({ timezone: previous }),
      onUndone: synced,
      onError: (error) => setRefusal(readRefusal(error, TRACK.SAVE_FAILED)),
    });
  };

  const escalateId = `${ids}-escalate`;
  const zoneId = `${ids}-zone`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
      aria-label={TRACK.TASKS_TITLE}
      className="flex flex-col gap-3"
    >
      <SettingsSection title={TRACK.REMINDERS}>
        {/* The escalate row as today, without the footer. */}
        <SettingsRow label={TRACK.ESCALATE} htmlFor={escalateId} hint={TRACK.ESCALATE_DETAIL} hintId={`${escalateId}-detail`} error={failed.escalate_after_days || undefined} errorId={`${escalateId}-error`}>
          <input
            id={escalateId}
            inputMode="numeric"
            value={draft.escalate}
            aria-invalid={Boolean(failed.escalate_after_days)}
            aria-describedby={failed.escalate_after_days ? `${escalateId}-detail ${escalateId}-error` : `${escalateId}-detail`}
            onChange={(event) => edit('escalate_after_days', (current) => ({ ...current, escalate: event.target.value }))}
            className={FIELD}
          />
        </SettingsRow>
        <SettingsRow label={TRACK.TIMEZONE} htmlFor={zoneId} hint={TRACK.TIMEZONE_DETAIL} hintId={`${zoneId}-detail`} error={failed.timezone || undefined} errorId={`${zoneId}-error`}>
          <Select
            id={zoneId}
            label={TRACK.TIMEZONE}
            labelPosition="external"
            value={settings.timezone}
            invalid={Boolean(failed.timezone)}
            describedBy={failed.timezone ? `${zoneId}-detail ${zoneId}-error` : `${zoneId}-detail`}
            onChange={changeZone}
            options={zones.map((zone) => ({ value: zone, label: zone }))}
            className="sm:w-72"
          />
        </SettingsRow>
        <SettingsRow label={TRACK.WORKING_DAYS} group hint={TRACK.WORKING_DAYS_DETAIL} hintId={`${ids}-days-detail`} error={failed.working_days || undefined} errorId={`${ids}-days-error`}>
          <DayChips
            label={TRACK.WORKING_DAYS}
            days={WEEKDAYS}
            value={draft.working_days}
            describedBy={`${ids}-days-detail`}
            onChange={(next) => edit('working_days', (current) => ({ ...current, working_days: next }))}
          />
        </SettingsRow>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
}
```

Remove the now-unused `SET` import if nothing else uses it. Update the component's doc comment: timezone saves at once; the threshold and days go through the page's save bar.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/pages/settings/WorkTasksPage.test.tsx src/features/work`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): Work tasks, instant timezone and day chips in the save bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Work › Recommendations (instant receiver and signal switches; thresholds and cooldown as a draft)

**Files:**
- Modify: `src/components/work/WorkSettingsForm.tsx`
- Test: `src/pages/settings/WorkRecommendationsPage.test.tsx` (update)

**Interfaces:**
- Consumes: `useInstantSave`, `useSettingsDraft`, `Switch` `busy`, existing `draftOf`, `patchOf`, `isEmptyPatch`, `validateDraft`, `hasErrors`, `readSettingsRefusal`, `SOURCE_SPECS`, `RECEIVE_OPTIONS`.

- [ ] **Step 1: Update the page test**

Replace the Save-bar cases with:

```tsx
  it('saves who receives them the moment it changes', async () => {
    const spy = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('radio', { name: 'The suggested person' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ recommend_to: 'suggested' }]));
  });

  it('saves a signal switch the moment it changes', async () => {
    const spy = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'Renewal due' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ sources: { renewal: { enabled: false } } }]));
  });

  it('collects thresholds and the cooldown in the save bar', async () => {
    const spy = stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    const within30 = await screen.findByLabelText('Within (days)');
    await userEvent.clear(within30);
    await userEvent.type(within30, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/work/settings/')).toEqual([{ sources: { renewal: { days: 45 } } }]));
  });
```

Read `RECEIVE_OPTIONS` and `SOURCE_SPECS` in `src/features/work/workSettings.ts` and the fixture `WORK_SETTINGS` for the exact `recommend_to` values, the source kind keys and current enabled states; adjust the literals (`'suggested'`, `renewal`, `days`) to match.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/pages/settings/WorkRecommendationsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `WorkSettingsForm.tsx`:

1. Add `useInstantSave, useSettingsDraft` to the `../ui` import; drop `SettingsSaveBar`. Remove the `status` state.
2. Compute the pending patch without the instant fields:

```tsx
  const instant = useInstantSave();
  // Receiver and switches save on their own; the bar holds thresholds and the cooldown.
  const typed = (d: SettingsDraft): SettingsDraft => ({
    ...d,
    recommend_to: settings.recommend_to,
    sources: Object.fromEntries(
      Object.entries(d.sources).map(([kind, source]) => [kind, { ...source, enabled: settings.sources[kind as RecKind]?.enabled === true }]),
    ) as SettingsDraft['sources'],
  });
  const pending = patchOf(settings, typed(draft));
  const dirty = !isEmptyPatch(pending);
```

3. Replace `save(event)` with `async function save(): Promise<boolean>` following Task 11's shape: validate with `validateDraft(typed(draft))`, `setErrors(local)` and return false on errors; send `patchWorkSettings(pending)`; on success `setDraft(draftOf(outcome.value)); onSaved(outcome.value); return true;`; on refusal `setErrors(readSettingsRefusal(outcome.error, SET.SAVE_FAILED)); return false;`. Register it:

```tsx
  useSettingsDraft({ dirty, saving: saving.busy, save, discard: () => { setDraft(draftOf(settings)); setErrors(NO_SETTINGS_ERRORS); } });
```

4. An instant helper:

```tsx
  const saveNow = (key: string, patch: WorkSettingsPatch, back: WorkSettingsPatch, apply: (next: WorkSettings) => (d: SettingsDraft) => SettingsDraft) => {
    setErrors(NO_SETTINGS_ERRORS);
    const synced = (next: WorkSettings) => {
      onSaved(next);
      setDraft(apply(next));
    };
    void instant.run({ key, request: () => patchWorkSettings(patch), onSaved: synced, undo: () => patchWorkSettings(back), onUndone: synced, onError: (error) => setErrors(readSettingsRefusal(error, SET.SAVE_FAILED)) });
  };
```

5. Radio `onChange`: `saveNow('recommend_to', { recommend_to: option.value }, { recommend_to: settings.recommend_to }, (next) => (d) => ({ ...d, recommend_to: next.recommend_to }))`, and its `checked` reads `settings.recommend_to === option.value`.
6. Switch: `checked={settings.sources[spec.kind]?.enabled === true}`, `busy={instant.busyKey === spec.kind}`, no children (drop the On/Off words), `onChange={(next) => saveNow(spec.kind, { sources: { [spec.kind]: { enabled: next } } }, { sources: { [spec.kind]: { enabled: !next } } }, (saved) => (d) => ({ ...d, sources: { ...d.sources, [spec.kind]: { ...d.sources[spec.kind], enabled: saved.sources[spec.kind]?.enabled === true } } }))}`. Delete `setEnabled`.
7. The form's `onSubmit` becomes `(event) => { event.preventDefault(); void save(); }`. Remove the `<SettingsSaveBar … />` line. Leave Run now as it is.
8. Import `WorkSettingsPatch` from wherever `workTypes` exports it, and `WorkSettings` is already imported.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/pages/settings/WorkRecommendationsPage.test.tsx src/features/work`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): recommendations, instant switches and thresholds in the save bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Agents (instant AI switch, tone and agent switches; budgets as a draft)

**Files:**
- Modify: `src/components/agents/AgentsForm.tsx`
- Test: `src/pages/settings/AgentsSettingsPage.test.tsx` (update)

**Interfaces:**
- Consumes: `useInstantSave`, `useSettingsDraft`, `Switch` `busy`, `patchAgentSettings(patch: AgentSettingsPatch): Promise<AgentSettings>`, `agentsDraftOf`, `agentsPatchOf`, `validateAgents`, `readAgentRefusal`, `fetchMe`.

- [ ] **Step 1: Update the page test**

Replace the save-bar cases with (use the file's existing stub helper from `features/agents/testAgents.ts` and its spy; read it for names):

```tsx
  it('saves the workspace AI switch at once and refreshes the signed-in user', async () => {
    const spy = stubAgents();
    renderPage(<AgentsSettingsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'AI for this workspace' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ ai_enabled: false }]));
    await waitFor(() => expect(calls(spy, 'GET', '/auth/me/').length).toBeGreaterThan(0));
  });

  it('saves the tone at once', async () => {
    const spy = stubAgents();
    renderPage(<AgentsSettingsPage />, URL);
    await userEvent.selectOptions(await screen.findByLabelText('Tone'), 'friendly');
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ tone: 'friendly' }]));
  });

  it('saves an agent switch at once', async () => {
    const spy = stubAgents();
    renderPage(<AgentsSettingsPage />, URL);
    await userEvent.click(await screen.findByRole('switch', { name: 'CS agent' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { enabled: false } } }]));
  });

  it('collects monthly credits in the save bar', async () => {
    const spy = stubAgents();
    renderPage(<AgentsSettingsPage />, URL);
    const budget = await screen.findByLabelText('Monthly credits for the CS agent');
    await userEvent.clear(budget);
    await userEvent.type(budget, '20');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/agents/settings/')).toEqual([{ agents: { cs: { monthly_credits: 20 } } }]));
  });
```

Adjust the stub name, the `/auth/me/` path and the agent labels to the fixtures in `features/agents/testAgentsFixtures.ts`.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/pages/settings/AgentsSettingsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `AgentsForm.tsx`:

1. Imports: add `useInstantSave, useSettingsDraft` from `../ui`; drop `SettingsSaveBar`; drop the `status` state and the `AGENTS.NO_CHANGES` branch.
2. The draft holds budgets only for the bar:

```tsx
  const instant = useInstantSave();
  const typed = (d: AgentsDraft): AgentsDraft => ({
    ...d,
    ai_enabled: settings.ai_enabled,
    tone: settings.tone,
    ...Object.fromEntries(AGENT_KINDS.map((kind) => [kind, { ...d[kind], enabled: settings.agents.find((c) => c.kind === kind)?.enabled ?? d[kind].enabled }])),
  });
  const pending = agentsPatchOf(settings, typed(draft));
  const dirty = Object.keys(pending).length > 0;
```

Read `AgentsDraft` and `agentsDraftOf` in `features/agents/agentsText.ts` first: if `ai_enabled`/`tone`/`enabled` live at other keys, match them. 

3. `async function save(): Promise<boolean>`: run `validateAgents(typed(draft), settings.plan_monthly_credits)`; on errors `setLocal(errors)`, focus the first budget as today, return false; send `patchAgentSettings(pending)`; on success `setDraft(agentsDraftOf(outcome.value)); onSaved(outcome.value); return true;`; on refusal `setRefusal(readAgentRefusal(outcome.error, AGENTS.SAVE_FAILED)); return false;`. Register with `useSettingsDraft({ dirty, saving: saving.busy, save, discard: () => { setDraft(agentsDraftOf(settings)); setLocal({}); setRefusal(NO_AGENT_REFUSAL); } })`.
4. Instant helper:

```tsx
  const saveNow = (key: string, patch: AgentSettingsPatch, back: AgentSettingsPatch, refreshMe = false) => {
    setRefusal(NO_AGENT_REFUSAL);
    const synced = (next: AgentSettings) => {
      onSaved(next);
      setDraft((current) => ({ ...agentsDraftOf(next), ...Object.fromEntries(AGENT_KINDS.map((kind) => [kind, { ...current[kind], enabled: agentsDraftOf(next)[kind].enabled }])) }));
      if (refreshMe) void dispatch(fetchMe());
    };
    void instant.run({ key, request: () => patchAgentSettings(patch), onSaved: synced, undo: () => patchAgentSettings(back), onUndone: synced, onError: (error) => setRefusal(readAgentRefusal(error, AGENTS.SAVE_FAILED)) });
  };
```

The `synced` merge keeps each agent's typed budget while taking the saved switches, AI switch and tone; if `AgentsDraft`'s shape differs, keep that rule: saved values for instant fields, current draft for budgets.

5. Controls: the AI switch `checked={settings.ai_enabled}`, `busy={instant.busyKey === 'ai_enabled'}`, no children, `onChange={(next) => saveNow('ai_enabled', { ai_enabled: next }, { ai_enabled: settings.ai_enabled }, true)}`. Tone `value={settings.tone}`, `onChange={(value) => saveNow('tone', { tone: value }, { tone: settings.tone }, true)}`. Each agent switch `checked={card.enabled}`, `label={card.label}`, `busy={instant.busyKey === kind}`, no children, `onChange={(next) => saveNow(kind, { agents: { [kind]: { enabled: next } } }, { agents: { [kind]: { enabled: card.enabled } } })}`.
6. The `form`'s `onSubmit` becomes `(event) => { event.preventDefault(); void save(); }`; delete `<SettingsSaveBar … />`.
7. Import `AgentSettingsPatch` from `features/agents/agentTypes`.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/pages/settings/AgentsSettingsPage.test.tsx src/components/agents src/features/agents`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): agents, instant switches and tone, budgets in the save bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Defaults and General

**Files:**
- Modify: `src/pages/settings/CurrencySection.tsx`, `src/pages/settings/LifecycleDefaultSection.tsx`, `src/pages/settings/DefaultsPage.tsx` (doc comment), `src/pages/settings/GeneralSettingsPage.tsx`
- Test: `src/pages/settings/CurrencySection.test.tsx`, `src/pages/settings/LifecycleDefaultSection.test.tsx`, `src/pages/settings/GeneralSettingsPage.test.tsx`, `src/pages/settings/DefaultsPage.test.tsx` (update)

**Interfaces:**
- Consumes: `useSettingsDraft`, `useInstantSave`, `SettingsDraftScope` and `ToastProvider` (section tests render a section alone, so they wrap it: `render(<ToastProvider><SettingsDraftScope><CurrencySection /></SettingsDraftScope></ToastProvider>)` inside their existing store/router wrappers).

- [ ] **Step 1: Update the tests**

`CurrencySection.test.tsx`: replace the Save-button cases with:

```tsx
  it('holds a new currency in the save bar with its warning, because saving clears the rates', async () => {
    // existing setup that renders the section with rates loaded, now wrapped in ToastProvider + SettingsDraftScope
    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'EUR');
    expect(screen.getByText(/Saving clears your/)).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    // existing assertion that PATCH /organisation/ was sent with { currency: 'EUR' }, adapted
  });
```

`LifecycleDefaultSection.test.tsx`:

```tsx
  it('saves the default stage the moment it is chosen, with an Undo', async () => {
    // existing setup, wrapped in ToastProvider + SettingsDraftScope
    await userEvent.selectOptions(screen.getByLabelText('Default lifecycle stage'), 'kickoff');
    // existing assertion that the organisation update was sent with { default_lifecycle_stage: 'kickoff' }
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('says where a new organisation starts without a default, in the hint', () => {
    // existing setup
    expect(screen.getByRole('option', { name: 'No default' })).toBeInTheDocument();
    expect(screen.getByText(/With no default it starts at Onboarding/)).toBeInTheDocument();
  });
```

`GeneralSettingsPage.test.tsx`: add

```tsx
  it('puts the ownership transfer under a Danger zone heading', () => {
    // existing owner setup
    expect(screen.getByRole('heading', { level: 2, name: 'Danger zone' })).toBeInTheDocument();
  });
```

and change any `name: 'Ownership'` heading lookups to `'Danger zone'`.

- [ ] **Step 2: Run them**

Run: `npx vitest run src/pages/settings/CurrencySection.test.tsx src/pages/settings/LifecycleDefaultSection.test.tsx src/pages/settings/GeneralSettingsPage.test.tsx src/pages/settings/DefaultsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`CurrencySection.tsx`:
- Change `handleSave` to `async function handleSave(): Promise<boolean>` returning `true` after `setRates([])` and `false` in the `catch`. Remove `savedAt` state.
- Register: `useSettingsDraft({ dirty: isAdmin && isDirty, saving: isSaving, save: handleSave, discard: () => { setSelected(savedCurrency); setError(null); } });` (use the component's saved-currency variable; it is `savedCurrency` per line 86).
- Remove the `footer` prop from the Currency `SettingsSection` and `SettingsSave` from the import.

`LifecycleDefaultSection.tsx`:

```tsx
export function LifecycleDefaultSection() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const isAdmin = useCapability('manage_org_settings');
  const savedStage = user?.organisation.default_lifecycle_stage ?? '';
  const [error, setError] = useState<string | null>(null);
  const instant = useInstantSave();
  const send = (stage: string) => dispatch(updateOrganisation({ default_lifecycle_stage: stage })).unwrap();
  const readError = (err: unknown) => setError(typeof err === 'string' ? err : err instanceof ApiError ? err.message : 'Could not save.');

  const change = (stage: string) => {
    if (stage === savedStage) return;
    const previous = savedStage;
    setError(null);
    void instant.run({ key: 'stage', request: () => send(stage), onSaved: () => {}, undo: () => send(previous), onError: readError });
  };

  return (
    <SettingsSection title="New organisations" description="Applied when a new organisation is created; you can still change it on each one.">
      <SettingsRow
        label="Default lifecycle stage"
        htmlFor="default-stage-select"
        hint="A new organisation starts here. With no default it starts at Onboarding. Any organisation can still start at another stage."
        hintId="default-stage-hint"
        error={error ?? undefined}
        errorId="default-stage-error"
      >
        <Select
          id="default-stage-select"
          label="Default lifecycle stage"
          labelPosition="external"
          value={savedStage}
          disabled={!isAdmin}
          invalid={Boolean(error)}
          describedBy={error ? 'default-stage-hint default-stage-error' : 'default-stage-hint'}
          onChange={change}
          options={[{ value: '', label: 'No default' }, ...STAGE_OPTIONS.map((stage) => ({ value: stage, label: LIFECYCLE_LABELS[stage] }))]}
          className="sm:max-w-sm"
        />
      </SettingsRow>
    </SettingsSection>
  );
}
```

Imports: drop `FORM_ALERT, SettingsSave`; add `useInstantSave`. The thunk updates the store, so `onSaved` has nothing to do; the select reads the store.

`DefaultsPage.tsx`: update the doc comment ("Each section keeps its own Save" becomes "the currency waits in the save bar because saving it clears the rates; the default stage saves at once").

`GeneralSettingsPage.tsx`: the second section becomes `title="Danger zone"`, `variant="danger"`, `description="Hand the workspace to another member. You keep your role."`; the row's hint becomes "An active member other than you." Keep its footer (status + "Transfer ownership"), but change the button class from `PRIMARY` to `DANGER` (import it).

- [ ] **Step 4: Run them**

Run: `npx vitest run src/pages/settings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): defaults with the save bar and an instant stage; General danger zone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Gallery, leftovers and full verification

**Files:**
- Modify: `src/pages/dev/UiGallery.tsx`, `src/components/ui/SettingsFrame.tsx` (delete `SettingsSaveBar` if unused)
- Test: whole suite

- [ ] **Step 1: Remove the old bar**

Run: `grep -rn "SettingsSaveBar" src | grep -v "\.test\."`. If only `SettingsFrame.tsx` and `UiGallery.tsx` remain, delete `SettingsSaveBar` from `SettingsFrame.tsx` and its gallery entry and any test of it in `SettingsFrame.test.tsx`. `SettingsSave` stays (ActionsGridForm and GlobalConfigSection use it until PR 2).

- [ ] **Step 2: Gallery**

In `UiGallery.tsx`, in the settings area: a `SettingsSection` two-column example with a `Switch` row and a number row, a stacked list section, a `DayChips`, a `Banner` of each tone, and a button that calls `useToast()` with an Undo action (wrap that part of the gallery in `ToastProvider`). Remove the `SettingsSave`-in-footer example's `footer` if it shows a Save for a two-column section.

- [ ] **Step 3: Full suite, lint, build**

Run: `npx vitest run`
Expected: all files pass. If `src/test/uiRatchet.test.ts` reports a count below its baseline, re-record the baseline downward as its message says; a count above the baseline is a regression to fix.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Screenshots**

With the dev servers running (frontend in this worktree on port 5173, backend on 8000) and the Playwright session `sb` signed in, capture each of `/settings/general`, `/settings/defaults`, `/settings/work/recommendations`, `/settings/work/tasks`, `/settings/work/notifications`, `/settings/agents`, `/settings/ai/usage`, `/settings/developers/webhooks` at 1440x900 and 375x812, light and dark (`document.documentElement.classList.add('dark')`), into the session scratchpad `pw/after/`. Check by eye: no glow behind Settings, the nav fits without scrolling at 900px tall, two-column sections, no "On" beside switches, no Save footers, the bar appears after typing in Tasks.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(settings): gallery entries and old save bar removed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage for PR 1: §4.1 (Tasks 4, 5), §4.2 (Tasks 1, 2), §5.1-§5.3 (Task 5), §5.4 (Tasks 3, 6, 7, 8, 10-14), §5.5 DayChips/Banner (Task 9; StatusBadge/SettingsEmpty in PR 2 per §10.11), §6 General/Defaults/Work/Agents tab (Tasks 10-14), §8 tests (each task), §10 amendments (Tasks 2, 4, 5, 8, 14). Page rebuilds for People, Connections, Billing, Attributes, Products, Imports, Actions & approvals, AI tabs and Developers are PR 2.
- Briefs and Agent access change only their path and pick up the frame (§10.10).
- Names used across tasks: `SettingsTabsSlot`, `settingsTabsFor`, `useInstantSave`/`INSTANT`, `useSettingsDraft`/`SettingsDraftScope`/`DRAFT`, `DayChips`, `Banner`, `Switch busy`, `ToastProvider`/`useToast`/`TOAST_MS`.
