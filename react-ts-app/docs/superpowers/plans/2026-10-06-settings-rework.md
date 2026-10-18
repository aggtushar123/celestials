# Workspace Settings Rework (Round 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/settings` its own grouped left navigation (Workspace, Data, AI, Developers), gather People & teams, Connections and Plan & billing into it, add a General page with ownership transfer and a Defaults page, make the Attributes Filter and Download buttons real, and remove the dead tabs, placeholders and sidebar items.

**Architecture:** A new layout route, `WorkspaceSettingsLayout`, wraps every `/settings/*` child and draws its nav from one constant, `WORKSPACE_SETTINGS_NAV`. The whole settings route tree, plus the `/users` and `/integrations` redirects, moves out of `App.tsx` into `settingsRoutes(stub?)` (the same shape as `dashboardRoutes`), so a test can render it in a `MemoryRouter` and assert where each URL lands. New pages reuse what exists: `fetchMembers` and `fetchMe` for General, the lifted Currency and Global Presets bodies for Defaults.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `verbatimModuleSyntax`), react-router 7, Redux Toolkit, Tailwind v4 tokens, lucide-react, Vitest 5 + Testing Library + jsdom 30.

**Spec:** `docs/superpowers/specs/2026-10-06-settings-rework-design.md` (binding). Read it before starting any task.

## Global Constraints

- **Frontend only.** No backend, model or API change. Account settings (`/account-settings/*`) are out of scope; `/account-settings/billing` stays untouched.
- Work only in this worktree (`.worktrees/settings-spec`, branch `feat/settings-rework`). `node_modules` is a symlink: never `git add -A` or `git add .`; always `git add <explicit paths>`.
- Never run prettier. Never use `git stash`.
- Commands, from the worktree root: one file `npx vitest run <path>`; the suite `npx vitest run`; `npm run lint`; `npm run build` (`tsc -b` type-checks test files too, so tests must type-check).
- Commit messages: conventional commits (`feat(settings): …`, `docs(settings): …`), and the **last line** of every commit message is exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Tokens only** (revenact-design §1, §4.1): no hex, `rgb()`, or named palette colours (`text-white`, `bg-gray-*` …) in new or changed markup. Use `bg-surface`, `bg-subtle`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `border-line`, `border-line-subtle`, `text-danger`, `bg-warning-dim`, `text-warning`, `text-on-accent`.
- **Icons:** Lucide only; 16px (`h-4 w-4`) in nav rows; every decorative icon carries `aria-hidden="true"`; an icon-only button carries an `aria-label`.
- **Targets:** dense desktop controls `min-h-9`; a control shown on phones `min-h-11` (the phone `<select>`). `src/layouts/houseRules.test.ts` runs over every `src/layouts/*.tsx`: only `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]` there, `min-h-11` on every `<select>`/`<button>`/`<Link>`/`<input>`, no glass, no emoji, no `h-screen`.
- **Focus:** `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`.
- **No glass** on any settings surface (product surface).
- Frame values from the spec, verbatim: nav column `w-56`, `border-r border-line`; group label `text-[11px]` uppercase `text-ink-faint`; row `min-h-9`, 16px Lucide icon, `text-[13px]`; active row `bg-subtle text-ink font-semibold`; phone `<select aria-label="Settings section">` with `<optgroup>`s; page h1s `text-[20px] font-bold`.
- **"Shown to" repeats the route's guard:** People & teams needs `manage_users`; AI skills, AI usage, AI feedback need `view_all_accounts`; everything else is shown to everyone.
- **Redirects use `replace`.** `/integrations` keeps `location.search` and `location.hash`.
- **Copy (exact):** "Sends when: Organization created"; "Only the owner, \<name\>, can hand the workspace on."; "No attributes match these filters"; "You keep your role but lose the owner's rights." UI copy is sentence case.
- **No setting for a feature that does not exist.** Nothing is drawn for Work or Agents.
- Every task ships with its tests (testing skill: unit + integration on Vitest/Testing Library), and the suite, lint and build pass after every task.

## File map

| File | Responsibility |
|---|---|
| `src/pages/settings/workspaceSettingsNav.ts` (new, +test) | `WORKSPACE_SETTINGS_NAV` (four groups of `{label, path, icon, capability?}`) and `visibleSettingsNav(permissions)` |
| `src/layouts/WorkspaceSettingsLayout.tsx` (new, +test) | The frame: grouped `NavLink` column from `md`, a `<select>` below it, the `<Outlet/>` |
| `src/pages/settings/ownershipApi.ts` (new) | `transferOwnership(userId)` and `ownershipErrorMessage(err)` |
| `src/pages/settings/GeneralSettingsPage.tsx` (new, +test) | Workspace identity and the owner-only transfer |
| `src/features/auth/authSlice.ts` (modify) | `Organisation.owner` type (already served by the backend) |
| `src/pages/settings/CurrencySection.tsx` (moved from `CurrencyPage.tsx`, +moved test) | Currency + FX rates, as a section |
| `src/pages/settings/LifecycleDefaultSection.tsx` (moved from `GlobalPresetsPage.tsx`, +moved test) | Default lifecycle stage, as a section |
| `src/pages/settings/DefaultsPage.tsx` (new, +test) | The two sections under one h1 and one permission notice |
| `src/pages/settings/redirects.tsx` (new) | `KeepLocation`: a redirect that keeps search and hash |
| `src/pages/settings/routes.tsx` (new, +test) | `settingsRoutes(stub?)`: the settings tree and the `/users`, `/integrations` redirects |
| `src/App.tsx` (modify) | Calls `settingsRoutes()`; loses the old settings block, `/users`, `/integrations` |
| `src/components/layout/Navbar.tsx` (+test) (modify) | Only the "Settings" h1 on `/settings/*` |
| `src/pages/settings/aiSettingsTabs.ts` (+test), `SettingPlaceholder.tsx` (delete) | Replaced by the nav constant / removed |
| `src/pages/settings/SettingsPage.tsx` (+test) (modify) | No placeholder branch, no negative margins, `key` per entity tab |
| `src/components/layout/Sidebar.tsx`, `SourcesGroup.tsx` (+tests) (modify) | No Users/Integrations items; "connect a source" goes to `/settings/connections` |
| `src/lib/csv.ts` (new, +test) | `toCsv(rows)` and `downloadCsv(filename, csv)` |
| `src/pages/settings/attributeFilters.ts` (new, +test), `testAttributes.ts` (new test fixture) | Filter state, filtering, CSV rows for attributes |
| `src/pages/settings/attributeConfig.ts`, `AttributesTable.tsx`, `AttributesTabContent.tsx` (+new test) (modify) | `attributeDescription`; Filter popover and Download |
| `src/pages/settings/WebhooksPage.tsx` (+test) (modify) | The read-only event line |
| `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`, `.agents/workflows/repo-architecture.md` (modify) | Route table, settings sections, the frame entry |

Task order keeps the app building at every commit: the frame and the new pages are built (unrouted) first, Task 4 switches the routes over, then the in-page fixes and docs.

---

### Task 1: Settings nav constant and `WorkspaceSettingsLayout`

**Files:**
- Create: `src/pages/settings/workspaceSettingsNav.ts`
- Create: `src/pages/settings/workspaceSettingsNav.test.ts`
- Create: `src/layouts/WorkspaceSettingsLayout.tsx`
- Create: `src/layouts/WorkspaceSettingsLayout.test.tsx`
- Test (existing, must stay green): `src/layouts/houseRules.test.ts` (globs `./*.tsx`, so it picks up the new layout)

**Interfaces:**
- Consumes: `useAppSelector` (`src/hooks.ts`), `MD`, `useMediaQuery` (`src/lib/useMediaQuery.ts`), `Capability` (`src/features/auth/authSlice.ts`).
- Produces:
  - `interface WorkspaceSettingsItem { label: string; path: string; icon: LucideIcon; capability?: Capability }`
  - `interface WorkspaceSettingsGroup { label: string; items: readonly WorkspaceSettingsItem[] }`
  - `const WORKSPACE_SETTINGS_NAV: readonly WorkspaceSettingsGroup[]`
  - `function visibleSettingsNav(permissions: readonly Capability[]): WorkspaceSettingsGroup[]`
  - `function WorkspaceSettingsLayout(): JSX.Element` (a layout route element; renders `<Outlet/>`)

- [ ] **Step 1: Write the failing nav test**

Create `src/pages/settings/workspaceSettingsNav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { WORKSPACE_SETTINGS_NAV, visibleSettingsNav, type WorkspaceSettingsGroup } from './workspaceSettingsNav';

const shape = (groups: readonly WorkspaceSettingsGroup[]) =>
  groups.map((group) => [group.label, group.items.map((item) => `${item.label} ${item.path}`)]);

// Settings spec 2026-10-06 §1: four groups, each item opening an existing
// page (General and Defaults are new), in this order.
describe('WORKSPACE_SETTINGS_NAV', () => {
  it('lists the four groups and their items in order', () => {
    expect(shape(WORKSPACE_SETTINGS_NAV)).toEqual([
      ['Workspace', ['General /settings/general', 'People & teams /settings/people', 'Connections /settings/connections', 'Plan & billing /settings/billing']],
      ['Data', ['Attributes /settings/data', 'Defaults /settings/defaults', 'Products /settings/products', 'Imports /settings/entity-uploads']],
      ['AI', ['AI agent /settings/ai-agent', 'AI attributes /settings/ai-attributes', 'AI skills /settings/ai-skills', 'AI usage /settings/ai-usage', 'AI feedback /settings/ai-feedback', 'Briefs /settings/brief-delivery']],
      ['Developers', ['Webhooks /settings/webhooks', 'Agent access /settings/agent-access']],
    ]);
  });

  it('repeats each route guard and nothing more', () => {
    const gated = WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items)
      .filter((item) => item.capability)
      .map((item) => [item.path, item.capability]);
    expect(gated).toEqual([
      ['/settings/people', 'manage_users'],
      ['/settings/ai-skills', 'view_all_accounts'],
      ['/settings/ai-usage', 'view_all_accounts'],
      ['/settings/ai-feedback', 'view_all_accounts'],
    ]);
  });
});

describe('visibleSettingsNav', () => {
  it('shows a member only the items their routes let them into', () => {
    const labels = visibleSettingsNav([]).flatMap((group) => group.items.map((item) => item.label));
    expect(labels).not.toContain('People & teams');
    expect(labels).not.toContain('AI skills');
    expect(labels).not.toContain('AI usage');
    expect(labels).not.toContain('AI feedback');
    expect(labels).toContain('General');
    expect(labels).toContain('Briefs');
  });

  it('shows an admin everything', () => {
    expect(shape(visibleSettingsNav(ALL_CAPABILITIES))).toEqual(shape(WORKSPACE_SETTINGS_NAV));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/workspaceSettingsNav.test.ts`
Expected: FAIL, `Failed to resolve import "./workspaceSettingsNav"`.

- [ ] **Step 3: Write the nav constant**

Create `src/pages/settings/workspaceSettingsNav.ts`:

```ts
import {
  Bot,
  Building2,
  CreditCard,
  Database,
  Gauge,
  KeyRound,
  MessageSquareText,
  Newspaper,
  Package,
  Plug,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  WandSparkles,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { Capability } from '../../features/auth/authSlice';

export interface WorkspaceSettingsItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** The capability the route's own RequireCapability asks for. An item is
   *  never drawn for someone the route would bounce. */
  capability?: Capability;
}

export interface WorkspaceSettingsGroup {
  label: string;
  items: readonly WorkspaceSettingsItem[];
}

/** Settings' grouped navigation (settings spec 2026-10-06 §1). Work and
 *  Agents arrive with their features in later rounds; nothing is drawn for
 *  them until then. Briefs moves to Work › Notifications when that lands. */
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
    label: 'AI',
    items: [
      { label: 'AI agent', path: '/settings/ai-agent', icon: Bot },
      { label: 'AI attributes', path: '/settings/ai-attributes', icon: Sparkles },
      { label: 'AI skills', path: '/settings/ai-skills', icon: WandSparkles, capability: 'view_all_accounts' },
      { label: 'AI usage', path: '/settings/ai-usage', icon: Gauge, capability: 'view_all_accounts' },
      { label: 'AI feedback', path: '/settings/ai-feedback', icon: MessageSquareText, capability: 'view_all_accounts' },
      { label: 'Briefs', path: '/settings/brief-delivery', icon: Newspaper },
    ],
  },
  {
    label: 'Developers',
    items: [
      { label: 'Webhooks', path: '/settings/webhooks', icon: Webhook },
      { label: 'Agent access', path: '/settings/agent-access', icon: KeyRound },
    ],
  },
];

/** The groups as one person sees them: gated items dropped, and a group
 *  left with nothing dropped too. */
export function visibleSettingsNav(permissions: readonly Capability[]): WorkspaceSettingsGroup[] {
  return WORKSPACE_SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.capability || permissions.includes(item.capability)),
  })).filter((group) => group.items.length > 0);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/pages/settings/workspaceSettingsNav.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing layout test**

Create `src/layouts/WorkspaceSettingsLayout.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import authReducer, { type Capability } from '../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../test/capabilities';
import { resetViewport, setViewport } from '../test/viewport';
import { WorkspaceSettingsLayout } from './WorkspaceSettingsLayout';

// Integration tier (see the `testing` skill): the real auth slice for the
// capability gates, the real router for NavLink and the phone select.

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
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
  'General', 'People & teams', 'Connections', 'Plan & billing',
  'Attributes', 'Defaults', 'Products', 'Imports',
  'AI agent', 'AI attributes', 'AI skills', 'AI usage', 'AI feedback', 'Briefs',
  'Webhooks', 'Agent access',
];

afterEach(() => resetViewport());

describe('WorkspaceSettingsLayout from md (settings spec 2026-10-06 §2.1)', () => {
  it('draws the four groups with their items in order', () => {
    setViewport(1280);
    renderLayout('/settings/general');
    expect(screen.getByRole('navigation', { name: 'Workspace settings' })).toBeInTheDocument();
    expect(linksIn('Workspace')).toEqual(['General', 'People & teams', 'Connections', 'Plan & billing']);
    expect(linksIn('Data')).toEqual(['Attributes', 'Defaults', 'Products', 'Imports']);
    expect(linksIn('AI')).toEqual(['AI agent', 'AI attributes', 'AI skills', 'AI usage', 'AI feedback', 'Briefs']);
    expect(linksIn('Developers')).toEqual(['Webhooks', 'Agent access']);
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/general');
  });

  it('hides People & teams and AI skills, usage and feedback from a member without the capabilities', () => {
    setViewport(1280);
    renderLayout('/settings/general', []);
    for (const name of ['People & teams', 'AI skills', 'AI usage', 'AI feedback']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
    expect(screen.getByRole('link', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Briefs' })).toBeInTheDocument();
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
    renderLayout('/settings/webhooks');
    expect(screen.queryByRole('navigation', { name: 'Workspace settings' })).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(select).toHaveClass('min-h-11');
    expect(select).toHaveValue('/settings/webhooks');
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toEqual(['Workspace', 'Data', 'AI', 'Developers']);
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(ALL_ITEMS);
  });

  it('navigates when a section is chosen', async () => {
    setViewport(375);
    renderLayout('/settings/general');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Settings section' }), 'Agent access');
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/agent-access');
  });

  it('lists only what a member may open', () => {
    setViewport(375);
    renderLayout('/settings/general', []);
    const options = within(screen.getByRole('combobox', { name: 'Settings section' })).getAllByRole('option').map((option) => option.textContent);
    expect(options).not.toContain('People & teams');
    expect(options).not.toContain('AI usage');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/layouts/WorkspaceSettingsLayout.test.tsx`
Expected: FAIL, `Failed to resolve import "./WorkspaceSettingsLayout"`.

- [ ] **Step 7: Write the layout**

Create `src/layouts/WorkspaceSettingsLayout.tsx`:

```tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks';
import type { Capability } from '../features/auth/authSlice';
import { MD, useMediaQuery } from '../lib/useMediaQuery';
import { visibleSettingsNav } from '../pages/settings/workspaceSettingsNav';

// A stable empty list, so the selector does not hand back a new array (and a
// re-render) on every store change while signed out.
const NO_PERMISSIONS: Capability[] = [];

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

const groupId = (label: string) => `settings-nav-${label.toLowerCase()}`;

/** Workspace settings' frame (settings spec 2026-10-06 §2.1): the grouped
 *  nav column from md, a native grouped select above the page below it, and
 *  the page beside or under it, keeping its own scroll. One or the other is
 *  rendered, never both, so a screen reader meets one navigation. */
export function WorkspaceSettingsLayout() {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? NO_PERMISSIONS);
  const groups = visibleSettingsNav(permissions);
  const isMdUp = useMediaQuery(MD);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col md:flex-row">
      {isMdUp ? (
        <nav aria-label="Workspace settings" className="flex w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line px-3 py-4">
          {groups.map((group) => (
            <div key={group.label} role="group" aria-labelledby={groupId(group.label)} className="flex flex-col gap-0.5">
              <h2 id={groupId(group.label)} className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {group.label}
              </h2>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex min-h-9 items-center gap-2 rounded-lg px-2 text-[13px] transition-colors duration-[var(--dur-fast)] ${FOCUS} ${
                        isActive ? 'bg-subtle text-ink font-semibold' : 'text-ink-muted hover:bg-subtle hover:text-ink'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      ) : (
        <div className="shrink-0 px-4 pt-4">
          <select
            aria-label="Settings section"
            value={current?.path ?? ''}
            onChange={(event) => navigate(event.target.value)}
            className={`min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink ${FOCUS}`}
          >
            {current ? null : <option value="">Choose a section</option>}
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.path} value={item.path}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the layout test and the layouts house rules**

Run: `npx vitest run src/layouts/WorkspaceSettingsLayout.test.tsx src/layouts/houseRules.test.ts src/pages/settings/workspaceSettingsNav.test.ts`
Expected: PASS.

- [ ] **Step 9: Lint and build**

Run: `npm run lint && npm run build`
Expected: both exit 0 (the layout is not routed yet; unused exports are fine).

- [ ] **Step 10: Commit**

```bash
git add src/pages/settings/workspaceSettingsNav.ts src/pages/settings/workspaceSettingsNav.test.ts src/layouts/WorkspaceSettingsLayout.tsx src/layouts/WorkspaceSettingsLayout.test.tsx
git commit -F - <<'MSG'
feat(settings): grouped workspace settings nav and frame

WORKSPACE_SETTINGS_NAV holds the four groups; WorkspaceSettingsLayout draws
them as a nav column from md and a grouped select below it (settings spec
2026-10-06 §2.1). Not routed yet.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: General page with ownership transfer

**Files:**
- Modify: `src/features/auth/authSlice.ts` (the `Organisation` interface, lines 14-35)
- Create: `src/pages/settings/ownershipApi.ts`
- Create: `src/pages/settings/GeneralSettingsPage.tsx`
- Create: `src/pages/settings/GeneralSettingsPage.test.tsx`

**Interfaces:**
- Consumes: `fetchMe` (thunk, `GET /auth/me/`, replaces `state.auth.user`), `fetchMembers` (thunk in `features/userManagement/userManagementSlice.ts`, `GET /auth/users/`, fills `state.userManagement.members: Member[]`, `Member = User`), `apiFetch`, `ApiError` (`src/lib/apiClient.ts`), `ConfirmDialog` (`components/organizations/ConfirmDialog.tsx`: `{ title, message, confirmLabel, danger?, onConfirm: () => Promise<void>, onClose }`; calls `onClose` after `onConfirm` resolves), `MONO`, `PRIMARY` (`components/organizations/portfolio/styles.ts`).
- Produces:
  - `Organisation.owner?: { id: number; name: string; email: string } | null`
  - `transferOwnership(userId: number): Promise<{ owner: { id: number; name: string } }>`
  - `ownershipErrorMessage(err: unknown): string`
  - `GeneralSettingsPage(): JSX.Element` (used by Task 4's routes)

Why these sources (the spec's members-list wording does not work for everyone): `/auth/users/` needs `manage_users`, so a non-owner CSM cannot load it. The backend already nests `owner {id, name, email}` in `user.organisation` (`OrganisationSerializer.get_owner`), so the owner's name comes from there. `is_owner` is only on `/auth/me/` (never the login payload), so the page reads `/auth/me/` on mount. `fetchMembers` is used only for the owner's picker. The identity endpoints answer `{ success: false, error: { code, message } }`, which `apiClient`'s generic `extractErrorMessage` does not read, so `ownershipErrorMessage` reads `err.body.error.message` (same as `accessSlice.ts`'s `messageOf`). The organisation's created date is not served by `OrganisationSerializer` and this round adds no backend field, so it is not shown.

- [ ] **Step 1: Write the failing page test**

Create `src/pages/settings/GeneralSettingsPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import userManagementReducer from '../../features/userManagement/userManagementSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { GeneralSettingsPage } from './GeneralSettingsPage';

// Integration tier (see the `testing` skill): the real auth and user
// management slices, the fetch boundary mocked. The page reads /auth/me/ on
// mount, the owner's picker reads /auth/users/, a transfer POSTs
// /auth/organisation/owner/ and reads /auth/me/ again.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ALICE_OWNS = { id: 1, name: 'Alice Owner', email: 'alice@acme.io' };
const BOB_OWNS = { id: 2, name: 'Bob Builder', email: 'bob@acme.io' };

function person(overrides: Partial<User> = {}): User {
  return {
    id: 1, email: 'alice@acme.io', name: 'Alice Owner', avatar: '', role: 'admin', role_id: 1, role_name: 'Admin',
    permissions: ALL_CAPABILITIES, function: 'cs', function_display: 'Customer Success', reports_to: null,
    organisation: {
      id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD', currency_display: 'US Dollar ($)',
      default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional', ai_agent_tone_display: 'Professional',
      owner: ALICE_OWNS,
    },
    is_active: true,
    ...overrides,
  };
}

const alice = person({ is_owner: true });
const bob = person({ id: 2, email: 'bob@acme.io', name: 'Bob Builder' });
const carl = person({ id: 3, email: 'carl@acme.io', name: 'Carl Gone', is_active: false });

function renderPage(user: User) {
  const store = configureStore({
    reducer: { auth: authReducer, userManagement: userManagementReducer },
    preloadedState: {
      auth: { user, accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null },
    },
  });
  render(
    <Provider store={store}>
      <GeneralSettingsPage />
    </Provider>,
  );
}

/** `me` answers /auth/me/ each time it is read; `transfer` answers the POST. */
function stubServer(me: () => User, transfer = () => jsonResponse(200, { owner: { id: 2, name: 'Bob Builder' } })) {
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/auth/me/')) return Promise.resolve(jsonResponse(200, me()));
    if (url.endsWith('/auth/users/')) {
      return Promise.resolve(jsonResponse(200, { count: 3, next: null, previous: null, results: [alice, bob, carl] }));
    }
    if (url.endsWith('/auth/organisation/owner/') && options?.method === 'POST') return Promise.resolve(transfer());
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('GeneralSettingsPage (settings spec 2026-10-06 §3.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the workspace name, its slug in mono, and the owner', async () => {
    stubServer(() => alice);
    renderPage(alice);
    expect(screen.getByRole('heading', { level: 1, name: 'General' })).toBeInTheDocument();
    expect(screen.getByText('Acme Inc')).toBeInTheDocument();
    expect(screen.getByText('acme-inc')).toHaveClass('font-mono-brand');
    expect(screen.getAllByText('Alice Owner').length).toBeGreaterThan(0);
    await screen.findByRole('option', { name: 'Bob Builder' });
  });

  it('gives the owner a picker of active members other than themselves', async () => {
    stubServer(() => alice);
    renderPage(alice);
    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    expect(within(picker).queryByRole('option', { name: 'Alice Owner' })).toBeNull();
    expect(within(picker).queryByRole('option', { name: 'Carl Gone' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Transfer ownership' })).toBeDisabled();
  });

  it('confirms, posts the chosen user_id, then reads /auth/me/ again so is_owner flips', async () => {
    let owner = ALICE_OWNS;
    const fetchMock = stubServer(
      () => (owner.id === 1 ? alice : person({ is_owner: false, organisation: { ...alice.organisation, owner: BOB_OWNS } })),
      () => {
        owner = BOB_OWNS;
        return jsonResponse(200, { owner: { id: 2, name: 'Bob Builder' } });
      },
    );
    const user = userEvent.setup();
    renderPage(alice);

    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    await user.selectOptions(picker, 'Bob Builder');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));

    const dialog = screen.getByRole('dialog', { name: 'Transfer ownership to Bob Builder?' });
    expect(dialog).toHaveTextContent("You keep your role but lose the owner's rights.");
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }));

    expect(await screen.findByText('Only the owner, Bob Builder, can hand the workspace on.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'New owner' })).toBeNull();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ user_id: 2 });
    const postAt = urls.findIndex((url) => url.endsWith('/auth/organisation/owner/'));
    expect(urls.slice(postAt + 1).some((url) => url.endsWith('/auth/me/'))).toBe(true);
  });

  it("shows the server's message below the picker when the transfer is refused", async () => {
    stubServer(
      () => alice,
      () => jsonResponse(400, { success: false, error: { code: 'NOT_A_MEMBER', message: 'The new owner must be an active member.' } }),
    );
    const user = userEvent.setup();
    renderPage(alice);

    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    await user.selectOptions(picker, 'Bob Builder');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The new owner must be an active member.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('combobox', { name: 'New owner' })).toBeInTheDocument();
  });

  it('tells a non-owner who owns the workspace, with no picker and no members fetch', async () => {
    const csm = person({ id: 3, name: 'Carl CSM', email: 'carl@acme.io', permissions: [], is_owner: false });
    const fetchMock = stubServer(() => csm);
    renderPage(csm);

    expect(screen.getByText('Only the owner, Alice Owner, can hand the workspace on.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'New owner' })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/users/'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/GeneralSettingsPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./GeneralSettingsPage"` (and, once it resolves, a type error on `owner` in `Organisation`).

- [ ] **Step 3: Add `owner` to the `Organisation` type**

In `src/features/auth/authSlice.ts`, inside `export interface Organisation { … }`, after the line `  global_attribute_choices?: Record<GlobalAttributeKey, string[]>;` add:

```ts
  /** Who owns the workspace. OrganisationSerializer nests it in /auth/me/
   * and the login payload alike; optional so older fixtures type-check. */
  owner?: { id: number; name: string; email: string } | null;
```

- [ ] **Step 4: Write the ownership API**

Create `src/pages/settings/ownershipApi.ts`:

```ts
import { apiFetch, ApiError } from '../../lib/apiClient';

export interface OwnershipTransfer {
  owner: { id: number; name: string };
}

/** POST /auth/organisation/owner/ { user_id }: only the current owner may
 *  call it; the new owner must be another active member. */
export function transferOwnership(userId: number): Promise<OwnershipTransfer> {
  return apiFetch<OwnershipTransfer>('/auth/organisation/owner/', { method: 'POST', body: { user_id: userId } });
}

/** The identity endpoints answer `{ success: false, error: { code, message } }`;
 *  the message is written for people, so it is what the page shows. */
export function ownershipErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { message?: string } } | null;
    return body?.error?.message ?? err.message;
  }
  return 'Could not transfer ownership.';
}
```

- [ ] **Step 5: Write the page**

Create `src/pages/settings/GeneralSettingsPage.tsx`:

```tsx
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchMe } from '../../features/auth/authSlice';
import { fetchMembers } from '../../features/userManagement/userManagementSlice';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { MONO, PRIMARY } from '../../components/organizations/portfolio/styles';
import { ownershipErrorMessage, transferOwnership } from './ownershipApi';

const SELECT =
  'min-h-11 sm:min-h-9 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[13px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** Settings › Workspace › General (settings spec 2026-10-06 §3.1): the
 *  workspace's identity, and the one owner-only action that had no home.
 *  Rename, timezone and working hours are not here on purpose: there is no
 *  backend field for them and nothing would read them yet. */
export function GeneralSettingsPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const members = useAppSelector((state) => state.userManagement.members);
  const isOwner = user?.is_owner === true;
  const pickerId = useId();
  const [pickedId, setPickedId] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `is_owner` only ever comes from /auth/me/, never the login payload.
  useEffect(() => {
    dispatch(fetchMe());
  }, [dispatch]);

  // The members list needs manage_users; only the owner's picker reads it.
  useEffect(() => {
    if (isOwner) dispatch(fetchMembers());
  }, [dispatch, isOwner]);

  if (!user) return null;
  const organisation = user.organisation;
  const ownerName = organisation.owner?.name ?? null;
  const candidates = members.filter((member) => member.is_active && member.id !== user.id);
  const picked = candidates.find((member) => String(member.id) === pickedId) ?? null;

  async function handleTransfer(to: number) {
    setError(null);
    try {
      await transferOwnership(to);
      await dispatch(fetchMe());
    } catch (err) {
      setError(ownershipErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-6 max-w-2xl">
      <div>
        <h1 className="text-[20px] font-bold text-ink tracking-tight">General</h1>
        <p className="text-[13px] text-ink-faint font-medium mt-0.5">This workspace, and who owns it.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-bold text-ink">Workspace</h2>
        <dl className="divide-y divide-line-subtle rounded-xl border border-line-subtle bg-surface">
          <DetailRow label="Name">{organisation.name}</DetailRow>
          <DetailRow label="Slug">
            <span className={MONO}>{organisation.slug}</span>
          </DetailRow>
          <DetailRow label="Owner">{ownerName ?? 'Not set'}</DetailRow>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-bold text-ink">Ownership</h2>
        {isOwner ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={pickerId} className="text-[13px] font-semibold text-ink">
              New owner
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select id={pickerId} value={pickedId} onChange={(event) => setPickedId(event.target.value)} className={SELECT}>
                <option value="">Choose a member</option>
                {candidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!picked} onClick={() => setIsConfirming(true)} className={PRIMARY}>
                Transfer ownership
              </button>
            </div>
            {error && (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">
            {ownerName ? `Only the owner, ${ownerName}, can hand the workspace on.` : 'Only the owner can hand the workspace on.'}
          </p>
        )}
      </section>

      {isConfirming && picked && (
        <ConfirmDialog
          title={`Transfer ownership to ${picked.name}?`}
          message={`${picked.name} becomes the owner of ${organisation.name}. You keep your role but lose the owner's rights.`}
          confirmLabel="Transfer"
          onConfirm={() => handleTransfer(picked.id)}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="text-[13px] font-semibold text-ink">{children}</dd>
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/pages/settings/GeneralSettingsPage.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 7: Run the auth-dependent suites, lint and build**

Run: `npx vitest run src/features/auth src/pages/settings src/pages/users && npm run lint && npm run build`
Expected: all pass, exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/features/auth/authSlice.ts src/pages/settings/ownershipApi.ts src/pages/settings/GeneralSettingsPage.tsx src/pages/settings/GeneralSettingsPage.test.tsx
git commit -F - <<'MSG'
feat(settings): general page with workspace identity and ownership transfer

The owner picks another active member, confirms, and the page posts
/auth/organisation/owner/ then reads /auth/me/ again so is_owner flips.
Everyone else reads who owns the workspace. Not routed yet.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: Defaults page (Currency + New organisations)

**Files:**
- Move: `src/pages/settings/CurrencyPage.tsx` → `src/pages/settings/CurrencySection.tsx`
- Move: `src/pages/settings/CurrencyPage.test.tsx` → `src/pages/settings/CurrencySection.test.tsx`
- Move: `src/pages/settings/GlobalPresetsPage.tsx` → `src/pages/settings/LifecycleDefaultSection.tsx`
- Move: `src/pages/settings/GlobalPresetsPage.test.tsx` → `src/pages/settings/LifecycleDefaultSection.test.tsx`
- Create: `src/pages/settings/DefaultsPage.tsx`
- Create: `src/pages/settings/DefaultsPage.test.tsx`
- Modify: `src/App.tsx` (imports at lines 37 and 39; routes at lines 333 and 338)
- Modify (comments only): `src/hooks.ts:8`, `src/features/customers/customersSlice.ts:702`, `src/pages/settings/WebhooksPage.test.tsx:11`, `src/pages/settings/ProductsPage.test.tsx:11`, `src/pages/settings/AIAgentPage.test.tsx:11`

**Interfaces:**
- Consumes: `useCapability('manage_org_settings')`, `updateOrganisation` (thunk; its fulfilled case replaces `user.organisation` with the response).
- Produces: `CurrencySection(): JSX.Element`, `LifecycleDefaultSection(): JSX.Element`, `DefaultsPage(): JSX.Element` (used by Task 4's routes).

Decision: both sections are gated on the same capability (`manage_org_settings`), so the "You don't have permission to change this." notice moves up to `DefaultsPage` once instead of appearing twice. Each section keeps its own disabled field, its own Save and its own tests. Section headings are plain `h2`s, not `aria-labelledby` regions, so `getByLabelText('Currency')` in the moved tests still finds exactly one element.

- [ ] **Step 1: Write the failing page test**

Create `src/pages/settings/DefaultsPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { DefaultsPage } from './DefaultsPage';

// Integration tier (see the `testing` skill): the real auth slice (both
// sections dispatch updateOrganisation), the fetch boundary mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ORGANISATION = {
  id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
  default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
};

function renderPage(role: 'admin' | 'csm') {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1, role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: ORGANISATION, is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <DefaultsPage />
    </Provider>,
  );
}

const sectionOf = (heading: string) => screen.getByRole('heading', { level: 2, name: heading }).closest('section')!;

describe('DefaultsPage (settings spec 2026-10-06 §3.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders Currency, then New organisations, under one h1', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderPage('admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Defaults' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Currency', 'New organisations']);
    await screen.findByText(/every customer is assumed to bill in USD/);
  });

  it('saves each section with its own PATCH of its own field', async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, { ...ORGANISATION, ...JSON.parse(String(options.body)) }));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage('admin');
    await screen.findByText(/every customer is assumed to bill in USD/);

    const currency = sectionOf('Currency');
    await user.selectOptions(within(currency).getByLabelText('Currency'), 'GBP');
    await user.click(within(currency).getByRole('button', { name: 'Save' }));
    expect(await within(currency).findByText('Saved.')).toBeInTheDocument();

    const lifecycle = sectionOf('New organisations');
    await user.selectOptions(within(lifecycle).getByLabelText(/Default Lifecycle Stage/), 'live');
    await user.click(within(lifecycle).getByRole('button', { name: 'Save' }));
    expect(await within(lifecycle).findByText('Saved.')).toBeInTheDocument();

    const patches = fetchMock.mock.calls
      .filter(([, options]) => options?.method === 'PATCH')
      .map(([, options]) => JSON.parse(String(options!.body)));
    expect(patches).toEqual([{ currency: 'GBP' }, { default_lifecycle_stage: 'live' }]);
  });

  it('tells a member without manage_org_settings once, with both fields disabled and no Save', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage('csm');
    expect(screen.getAllByText(/You don't have permission to change this/)).toHaveLength(1);
    expect(screen.getByLabelText('Currency')).toBeDisabled();
    expect(screen.getByLabelText(/Default Lifecycle Stage/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/DefaultsPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./DefaultsPage"`.

- [ ] **Step 3: Move the two pages and their tests**

```bash
git mv src/pages/settings/CurrencyPage.tsx src/pages/settings/CurrencySection.tsx
git mv src/pages/settings/CurrencyPage.test.tsx src/pages/settings/CurrencySection.test.tsx
git mv src/pages/settings/GlobalPresetsPage.tsx src/pages/settings/LifecycleDefaultSection.tsx
git mv src/pages/settings/GlobalPresetsPage.test.tsx src/pages/settings/LifecycleDefaultSection.test.tsx
```

- [ ] **Step 4: Turn `CurrencySection.tsx` into a section**

Edit `src/pages/settings/CurrencySection.tsx` with these exact replacements (Edit tool, one at a time):

1. `// Backs Settings > Currency (Navbar.tsx's own /settings/currency tab).` → `// Settings › Data › Defaults › Currency (DefaultsPage.tsx).`
2. `export function CurrencyPage() {` → `export function CurrencySection() {`
3. Replace

```tsx
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-6 max-w-2xl">
      <div>
        <h1 className="text-[20px] font-bold text-ink tracking-tight">Currency</h1>
        <p className="text-[13px] text-ink-faint font-medium mt-0.5">
          The billing currency this organization operates in.
        </p>
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-warning-dim border border-warning/30 text-[12.5px] text-warning">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          You don't have permission to change this.
        </div>
      )}
```

with

```tsx
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-bold text-ink tracking-tight">Currency</h2>
        <p className="text-[13px] text-ink-faint font-medium mt-0.5">
          The billing currency this organization operates in.
        </p>
      </div>
```

4. `<h2 className="text-[14px] font-bold text-ink">Exchange Rates</h2>` → `<h3 className="text-[14px] font-bold text-ink">Exchange Rates</h3>`
5. Replace the file's ending

```tsx
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
```

with

```tsx
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
```

(`ShieldAlert` stays imported: the "Saving will clear your … exchange rates" warning still uses it.)

- [ ] **Step 5: Turn `LifecycleDefaultSection.tsx` into a section**

Edit `src/pages/settings/LifecycleDefaultSection.tsx`:

1. `import { ShieldAlert, Info } from 'lucide-react';` → `import { Info } from 'lucide-react';`
2. Replace the stale comment (spec §3.2: `GlobalConfigSidebar` is alive on the Data page)

```ts
// Backs Settings > Global Presets (Navbar.tsx's own /settings/global-presets
// tab, unrouted until now) — the real home for what GlobalConfigSidebar.tsx
// used to mock inside the Data tab (deleted; that sidebar never persisted
// anything). Real, admin-gated persistence via
// Organisation.default_lifecycle_stage: the standalone Add Organization
// flow (ActionBar.tsx) reads this to pre-fill new organizations' own
// Lifecycle Stage instead of always hardcoding "Onboarding".
```

with

```ts
// Settings › Data › Defaults › New organisations (DefaultsPage.tsx). Real,
// admin-gated persistence via Organisation.default_lifecycle_stage: the
// standalone Add Organization flow (ActionBar.tsx) reads this to pre-fill
// new organizations' own Lifecycle Stage instead of always hardcoding
// "Onboarding".
```

3. `export function GlobalPresetsPage() {` → `export function LifecycleDefaultSection() {`
4. Replace

```tsx
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-6 max-w-2xl">
      <div>
        <h1 className="text-[20px] font-bold text-ink tracking-tight">Global Presets</h1>
        <p className="text-[13px] text-ink-faint font-medium mt-0.5">
          Tenant-wide defaults, applied when a new record is created — overridable per record.
        </p>
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-warning-dim border border-warning/30 text-[12.5px] text-warning">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          You don't have permission to change this.
        </div>
      )}
```

with

```tsx
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-bold text-ink tracking-tight">New organisations</h2>
        <p className="text-[13px] text-ink-faint font-medium mt-0.5">
          Applied when a new organisation is created; you can still change it on each one.
        </p>
      </div>
```

5. Replace the file's ending

```tsx
              <span className="text-[12px] text-success font-medium">Saved.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

with

```tsx
              <span className="text-[12px] text-success font-medium">Saved.</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Write `DefaultsPage.tsx`**

Create `src/pages/settings/DefaultsPage.tsx`:

```tsx
import { ShieldAlert } from 'lucide-react';
import { useCapability } from '../../hooks';
import { CurrencySection } from './CurrencySection';
import { LifecycleDefaultSection } from './LifecycleDefaultSection';

/** Settings › Data › Defaults (settings spec 2026-10-06 §3.2): the
 *  workspace's currency with its FX rates, then what a new organisation
 *  starts as. Each section keeps its own Save; both need
 *  manage_org_settings, so one notice says so. */
export function DefaultsPage() {
  const canEdit = useCapability('manage_org_settings');
  return (
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-8 max-w-2xl">
      <div>
        <h1 className="text-[20px] font-bold text-ink tracking-tight">Defaults</h1>
        <p className="text-[13px] text-ink-faint font-medium mt-0.5">
          What the workspace assumes until a record says otherwise.
        </p>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-warning-dim border border-warning/30 text-[13px] text-warning">
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          You don't have permission to change this.
        </div>
      )}

      <CurrencySection />
      <LifecycleDefaultSection />
    </div>
  );
}
```

- [ ] **Step 7: Point the moved tests at the sections**

```bash
sed -i '' -e 's/CurrencyPage/CurrencySection/g' src/pages/settings/CurrencySection.test.tsx
sed -i '' -e 's/GlobalPresetsPage/LifecycleDefaultSection/g' -e 's/CurrencyPage\.test\.tsx/CurrencySection.test.tsx/g' src/pages/settings/LifecycleDefaultSection.test.tsx
```

Then delete, in **each** of the two moved test files, the one line inside the "a CSM sees a read-only view …" test that asserts the notice (it now lives on `DefaultsPage`, whose test asserts it):

```tsx
    expect(screen.getByText(/You don't have permission to change this/)).toBeInTheDocument();
```

- [ ] **Step 8: Update the stale file references in comments**

```bash
sed -i '' -e 's/CurrencyPage\.test\.tsx/CurrencySection.test.tsx/g' src/pages/settings/WebhooksPage.test.tsx src/pages/settings/ProductsPage.test.tsx src/pages/settings/AIAgentPage.test.tsx
sed -i '' -e 's/CurrencyPage\.tsx/CurrencySection.tsx/g' src/hooks.ts src/features/customers/customersSlice.ts
```

- [ ] **Step 9: Route the Defaults page and redirect the old two**

In `src/App.tsx`:

1. Replace `import { CurrencyPage } from './pages/settings/CurrencyPage';` with `import { DefaultsPage } from './pages/settings/DefaultsPage';`
2. Delete the line `import { GlobalPresetsPage } from './pages/settings/GlobalPresetsPage';`
3. Replace `            <Route path="currency" element={<CurrencyPage />} />` with

```tsx
            <Route path="defaults" element={<DefaultsPage />} />
            <Route path="currency" element={<Navigate to="/settings/defaults" replace />} />
```

4. Replace `            <Route path="global-presets" element={<GlobalPresetsPage />} />` with

```tsx
            <Route path="global-presets" element={<Navigate to="/settings/defaults" replace />} />
```

(Task 4 moves the whole tree into `settingsRoutes`; this keeps the build green until then.)

- [ ] **Step 10: Confirm nothing still names the old pages**

Run: `grep -rn "CurrencyPage\|GlobalPresetsPage" src`
Expected: no output.

- [ ] **Step 11: Run the tests**

Run: `npx vitest run src/pages/settings/DefaultsPage.test.tsx src/pages/settings/CurrencySection.test.tsx src/pages/settings/LifecycleDefaultSection.test.tsx`
Expected: PASS (3 + 9 + 4 tests).

- [ ] **Step 12: Suite, lint, build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all pass, exit 0.

- [ ] **Step 13: Commit**

```bash
git add src/pages/settings/CurrencySection.tsx src/pages/settings/CurrencySection.test.tsx src/pages/settings/LifecycleDefaultSection.tsx src/pages/settings/LifecycleDefaultSection.test.tsx src/pages/settings/DefaultsPage.tsx src/pages/settings/DefaultsPage.test.tsx src/App.tsx src/hooks.ts src/features/customers/customersSlice.ts src/pages/settings/WebhooksPage.test.tsx src/pages/settings/ProductsPage.test.tsx src/pages/settings/AIAgentPage.test.tsx
git status --short
```

`git status --short` must show the four renames (`R`) and no deleted `CurrencyPage*`/`GlobalPresetsPage*` left unstaged. Then:

```bash
git commit -F - <<'MSG'
feat(settings): defaults page joins currency and the new-organisation stage

CurrencyPage and GlobalPresetsPage become CurrencySection and
LifecycleDefaultSection under one Defaults page, each keeping its own Save
and tests; /settings/currency and /settings/global-presets redirect to it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: Settings routes, redirects, and the Navbar without tabs

**Files:**
- Create: `src/pages/settings/redirects.tsx`
- Create: `src/pages/settings/routes.tsx`
- Create: `src/pages/settings/routes.test.tsx`
- Modify: `src/App.tsx` (imports; the `<Route path="settings">` block; the `integrations` and `users` routes)
- Modify: `src/components/layout/Navbar.tsx` (lines 17, 19, 103-104, 468-500)
- Modify: `src/components/layout/Navbar.test.tsx` (the `Navbar on Settings > AI` describe, lines 871-890)
- Modify: `src/pages/settings/SettingsPage.tsx` (import line 4; root `div`; the placeholder branch)
- Delete: `src/pages/settings/aiSettingsTabs.ts`, `src/pages/settings/aiSettingsTabs.test.ts`, `src/pages/settings/SettingPlaceholder.tsx`

**Interfaces:**
- Consumes: `WorkspaceSettingsLayout` (Task 1), `GeneralSettingsPage` (Task 2), `DefaultsPage` (Task 3), `RequireCapability` (`components/auth/RequireCapability.tsx`, redirects to `/dashboard` when the capability is missing).
- Produces:
  - `KeepLocation({ to }: { to: string }): JSX.Element` (redirect keeping `search` and `hash`, with `replace`)
  - `settingsRoutes(stub?: () => ReactElement): JSX.Element` (a fragment of `<Route>`s for use inside `<Routes>`; `stub` replaces each page with a probe in tests)

- [ ] **Step 1: Write the failing routes test**

Create `src/pages/settings/routes.test.tsx`:

```tsx
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
// in for /dashboard, where RequireCapability sends someone it refuses.

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
  it.each(WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items.map((item) => item.path)))(
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
  ])('%s lands on %s', (from, to) => {
    expect(renderAt(from)).toBe(to);
  });

  it.each(['/settings/people', '/settings/ai-skills', '/settings/ai-usage', '/settings/ai-feedback', '/users'])(
    '%s keeps its guard: a member without the capability is sent to /dashboard',
    (url) => {
      expect(renderAt(url, 'csm')).toBe('/dashboard');
    },
  );

  it('is the only settings tree in App.tsx', () => {
    expect(app).toContain('{settingsRoutes()}');
    expect(app).not.toContain('<Route path="settings">');
    expect(app).not.toContain('<Route path="users"');
    expect(app).not.toContain('<Integrations />');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/routes.test.tsx`
Expected: FAIL, `Failed to resolve import "./routes"`.

- [ ] **Step 3: Write the redirect that keeps the query and hash**

Create `src/pages/settings/redirects.tsx`:

```tsx
import { Navigate, useLocation } from 'react-router-dom';

/** A redirect that keeps the query and the hash: the backend's OAuth
 *  callbacks still send people to /integrations?<result>, and that result
 *  has to arrive at Connections intact. */
export function KeepLocation({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}
```

- [ ] **Step 4: Write the route tree**

Create `src/pages/settings/routes.tsx`:

```tsx
import type { ReactElement } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { RequireCapability } from '../../components/auth/RequireCapability';
import type { Capability } from '../../features/auth/authSlice';
import { WorkspaceSettingsLayout } from '../../layouts/WorkspaceSettingsLayout';
import { UserManagement } from '../users/UserManagement';
import { Integrations } from '../integrations/Integrations';
import { AgentsPage } from '../brain/Agents';
import { SkillsPage } from '../brain/Skills';
import { FeedbackLogPage } from '../brain/Feedback';
import { GeneralSettingsPage } from './GeneralSettingsPage';
import { BillingSettingsPage } from './BillingSettingsPage';
import { SettingsPage } from './SettingsPage';
import { DefaultsPage } from './DefaultsPage';
import { ProductsPage } from './ProductsPage';
import { EntityUploadsPage } from './EntityUploadsPage';
import { AIAgentPage } from './AIAgentPage';
import { AIAttributesPage } from './AIAttributesPage';
import { BriefDeliveryPage } from './BriefDeliveryPage';
import { WebhooksPage } from './WebhooksPage';
import { AgentAccessPage } from './AgentAccessPage';
import { KeepLocation } from './redirects';

/**
 * Workspace settings' route tree (settings spec 2026-10-06 §1), plus the old
 * /users and /integrations addresses. A function so a test can pass `stub`
 * to replace every page with a probe and assert where each URL lands; the
 * guards stay real either way.
 */
export function settingsRoutes(stub?: () => ReactElement) {
  const el = (real: ReactElement) => (stub ? stub() : real);
  const gated = (capability: Capability, real: ReactElement) => (
    <RequireCapability capability={capability}>{el(real)}</RequireCapability>
  );
  return (
    <>
      <Route path="settings" element={<WorkspaceSettingsLayout />}>
        <Route index element={<Navigate to="/settings/general" replace />} />

        <Route path="general" element={el(<GeneralSettingsPage />)} />
        <Route path="people" element={gated('manage_users', <UserManagement />)} />
        <Route path="connections" element={el(<Integrations />)} />
        {/* Billing leans on account settings' frame for its padding. */}
        <Route path="billing" element={el(<div className="p-6 max-w-4xl"><BillingSettingsPage /></div>)} />

        <Route path="data" element={el(<SettingsPage />)} />
        <Route path="defaults" element={el(<DefaultsPage />)} />
        <Route path="products" element={el(<ProductsPage />)} />
        <Route path="entity-uploads" element={el(<EntityUploadsPage />)} />

        <Route path="ai-agent" element={el(<AIAgentPage />)} />
        <Route path="ai-attributes" element={el(<AIAttributesPage />)} />
        <Route path="ai-skills" element={gated('view_all_accounts', <SkillsPage />)} />
        <Route path="ai-usage" element={gated('view_all_accounts', <AgentsPage />)} />
        <Route path="ai-feedback" element={gated('view_all_accounts', <FeedbackLogPage />)} />
        <Route path="brief-delivery" element={el(<BriefDeliveryPage />)} />

        <Route path="webhooks" element={el(<WebhooksPage />)} />
        <Route path="agent-access" element={el(<AgentAccessPage />)} />

        <Route path="currency" element={<Navigate to="/settings/defaults" replace />} />
        <Route path="global-presets" element={<Navigate to="/settings/defaults" replace />} />
        <Route path="activities" element={<Navigate to="/settings/general" replace />} />
        <Route path="connect-widget" element={<Navigate to="/settings/general" replace />} />
      </Route>

      <Route path="users" element={<Navigate to="/settings/people" replace />} />
      <Route path="integrations" element={<KeepLocation to="/settings/connections" />} />
    </>
  );
}
```

- [ ] **Step 5: Switch `App.tsx` over**

Run from the worktree root (it asserts each edit happens exactly once):

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path('src/App.tsx')
s = p.read_text()

def drop(line):
    global s
    assert s.count(line + '\n') == 1, line
    s = s.replace(line + '\n', '')

for line in [
    "import { UserManagement } from './pages/users/UserManagement';",
    "import { RequireCapability } from './components/auth/RequireCapability';",
    "import { SettingsPage } from './pages/settings/SettingsPage';",
    "import { SettingPlaceholder } from './pages/settings/SettingPlaceholder';",
    "import { DefaultsPage } from './pages/settings/DefaultsPage';",
    "import { ProductsPage } from './pages/settings/ProductsPage';",
    "import { AIAgentPage } from './pages/settings/AIAgentPage';",
    "import { AIAttributesPage } from './pages/settings/AIAttributesPage';",
    "import { BriefDeliveryPage } from './pages/settings/BriefDeliveryPage';",
    "import { AgentAccessPage } from './pages/settings/AgentAccessPage';",
    "import { AgentsPage } from './pages/brain/Agents';",
    "import { SkillsPage } from './pages/brain/Skills';",
    "import { FeedbackLogPage } from './pages/brain/Feedback';",
    "import { EntityUploadsPage } from './pages/settings/EntityUploadsPage';",
    "import { WebhooksPage } from './pages/settings/WebhooksPage';",
    "import { Integrations } from './pages/integrations/Integrations';",
    '          <Route path="integrations" element={<Integrations />} />',
    '          <Route path="users" element={<RequireCapability capability="manage_users"><UserManagement /></RequireCapability>} />',
]:
    drop(line)

anchor = "import { dashboardRoutes } from './pages/dashboard/routes';\n"
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + "import { settingsRoutes } from './pages/settings/routes';\n")

start = s.index('          <Route path="settings">\n')
end = s.index('          </Route>\n', start) + len('          </Route>\n')
s = s[:start] + '          {settingsRoutes()}\n' + s[end:]

p.write_text(s)
PY
```

`BillingSettingsPage`'s import stays: `/account-settings/billing` still uses it.

- [ ] **Step 6: Run the routes test**

Run: `npx vitest run src/pages/settings/routes.test.tsx`
Expected: PASS.

- [ ] **Step 7: Replace the Navbar settings test**

In `src/components/layout/Navbar.test.tsx`, replace the whole `describe('Navbar on Settings > AI (spec 2026-10-05 §2.1)', () => { … });` block (lines 871-890) with:

```tsx
describe('Navbar on Settings (settings spec 2026-10-06 §2.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/settings/general', '/settings/data', '/settings/ai-usage'])(
    'shows only the Settings title on %s: no tabs, no menu chevron',
    (url) => {
      renderNavbar(url);
      const title = screen.getByRole('heading', { level: 1, name: 'Settings' });
      // The old title sat in a clickable-looking wrapper with a ChevronDown
      // sibling and no menu behind it.
      expect(title.parentElement!.querySelector(':scope > svg')).toBeNull();
      expect(title.parentElement).not.toHaveClass('cursor-pointer');
      for (const name of ['Data', 'Currency', 'Products', 'Entity Uploads', 'Webhooks', 'Activities', 'Global Presets', 'Connect Widget', 'Agent Access', 'AI usage', 'AI skills', 'AI feedback']) {
        expect(screen.queryByRole('link', { name })).toBeNull();
      }
    },
  );
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run src/components/layout/Navbar.test.tsx -t "Navbar on Settings"`
Expected: FAIL: the `Data` link (and the chevron `svg`) is still there.

- [ ] **Step 9: Strip the Navbar tabs**

In `src/components/layout/Navbar.tsx`:

1. `import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';` → `import { useAppDispatch, useAppSelector } from '../../hooks';`
2. Delete the line `import { AI_SETTINGS_TABS } from '../../pages/settings/aiSettingsTabs';`
3. Delete these two lines (they sit right after `const isSettings = …`):

```ts
  // Settings > AI (spec 2026-10-05 §2.1, Decision 13): only for those who can open the pages.
  const canSeeAll = useCapability('view_all_accounts');
```

4. Replace the settings branch (lines 468-500, which carry trailing spaces) with a script:

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path('src/components/layout/Navbar.tsx')
s = p.read_text()
start_marker = '        ) : isSettings ? (\n'
end_marker = '        ) : isDashboard ? (\n'
assert s.count(start_marker) == 1 and s.count(end_marker) == 1
start = s.index(start_marker)
end = s.index(end_marker)
s = s[:start] + start_marker + '          <h1 className="text-[15px] font-bold text-ink tracking-tight">Settings</h1>\n' + s[end:]
p.write_text(s)
PY
```

`ChevronDown` stays imported (the Organizations title still uses it).

- [ ] **Step 10: Remove the dead placeholder and the old tab list**

```bash
git rm src/pages/settings/aiSettingsTabs.ts src/pages/settings/aiSettingsTabs.test.ts src/pages/settings/SettingPlaceholder.tsx
```

In `src/pages/settings/SettingsPage.tsx`:

1. Delete `import { SettingPlaceholder } from './SettingPlaceholder';`
2. Replace

```tsx
          ) : activeSubTab === 'Custom Objects' ? (
            <CustomObjectsPage />
          ) : (
            <SettingPlaceholder title={activeSubTab} />
          )}
```

with

```tsx
          ) : (
            <CustomObjectsPage />
          )}
```

3. The negative margins would pull the page under the new nav column. Replace
`    <div className="flex-1 flex flex-col h-full bg-surface overflow-hidden -m-4 md:-m-6 lg:-m-8 pt-1">`
with
`    <div className="flex-1 flex flex-col h-full bg-surface overflow-hidden pt-1">`

- [ ] **Step 11: Confirm nothing still names the removed pieces**

Run: `grep -rn "AI_SETTINGS_TABS\|aiSettingsTabs\|SettingPlaceholder\|canSeeAll" src`
Expected: only `src/pages/settings/CustomObjectsPage.tsx`'s historical comment ("falling through to SettingPlaceholder").

- [ ] **Step 12: Run the affected suites**

Run: `npx vitest run src/pages/settings src/components/layout src/layouts`
Expected: PASS (including `Navbar left wrapper height` on `/settings/data`).

- [ ] **Step 13: Suite, lint, build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all pass, exit 0.

- [ ] **Step 14: Commit**

```bash
git add src/pages/settings/redirects.tsx src/pages/settings/routes.tsx src/pages/settings/routes.test.tsx src/App.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/pages/settings/SettingsPage.tsx
git commit -F - <<'MSG'
feat(settings): route every settings page through the grouped frame

settingsRoutes() owns /settings/* inside WorkspaceSettingsLayout, adds
General, People & teams, Connections and Plan & billing, and redirects the
old addresses with replace (/integrations keeps its query and hash for the
OAuth callbacks). The Navbar shows only "Settings"; AI_SETTINGS_TABS and
SettingPlaceholder are gone.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

(The `git rm` in Step 10 already staged the three deletions.)

---

### Task 5: App sidebar without Users and Integrations; sources link to Connections

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (lines 3, 4, 84-87, 212-215)
- Modify: `src/components/layout/Sidebar.test.tsx` (comment at lines 13-16; drawer label list at line 407; one new describe)
- Modify: `src/components/layout/SourcesGroup.tsx:104`
- Modify: `src/components/layout/SourcesGroup.test.tsx` (lines 90 and 114)

**Interfaces:**
- Consumes: the `/settings/connections` route from Task 4.
- Produces: nothing new.

- [ ] **Step 1: Write the failing sidebar test**

In `src/components/layout/Sidebar.test.tsx`, add after the `describe('Sidebar Segments link', …)` block:

```tsx
// Settings spec 2026-10-06 §1: Users and Integrations live under Settings
// now (People & teams, Connections); Settings stays where it is.
describe('Sidebar SETUP section', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('keeps Settings and drops Users and Integrations, even for an admin', async () => {
    renderSidebar('admin');
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Integrations' })).toBeNull();
  });

  it('lights Settings on every settings page, including the ones that moved in', async () => {
    renderSidebar('admin', '/settings/people');
    expect((await screen.findByRole('link', { name: 'Settings' })).className).toMatch(/rv-sidebar-active-bg/);
  });
});
```

In the same file:
- line 407, remove `'Integrations'` from the drawer label list, so it reads
  `for (const label of ['Copilot', 'Dashboard', 'Organizations', 'Accounts', 'Contacts', 'Pipelines', 'Settings', 'Lifecycle']) {`
- the header comment (line 14) says the store is there for the Users link; replace the line

```tsx
// admin-only Users link) + real
```

with

```tsx
// capability-gated items) + real
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/layout/Sidebar.test.tsx -t "SETUP"`
Expected: FAIL: a `Users` link is found.

- [ ] **Step 3: Remove the two items**

In `src/components/layout/Sidebar.tsx`:

1. In the `lucide-react` import (line 3) remove `Plug, ` and `UserCog, ` so it reads
   `import { Box, Boxes, Brain, CircleDot, Columns, GitBranch, GitCommit, Globe, Layers, LayoutGrid, List, LogOut, Network, PenTool, PieChart, Sliders, Sparkles, Target, Users, X } from 'lucide-react';`
2. `import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';` → `import { useAppDispatch, useAppSelector } from '../../hooks';`
3. Delete

```ts
  // The Users link gates on the capability its page actually needs, not
  // on holding a role called "admin" — an org can define any role it
  // likes now, including one that grants exactly this and nothing else.
  const canManageUsers = useCapability('manage_users');
```

4. Delete

```tsx
        {canManageUsers && (
          <NavItem to="/users" icon={<UserCog className="w-5 h-5" aria-hidden="true" />} label="Users" expanded={isOpen} />
        )}
        <NavItem to="/integrations" icon={<Plug className="w-5 h-5" aria-hidden="true" />} label="Integrations" expanded={isOpen} />
```

- [ ] **Step 4: Point "connect a source" at Connections**

In `src/components/layout/SourcesGroup.tsx` line 104:

```ts
  const to = !source.connected ? '/integrations' : source.id === 'all' ? '/communications' : `/communications?source=${encodeURIComponent(source.id)}`;
```

→

```ts
  const to = !source.connected ? '/settings/connections' : source.id === 'all' ? '/communications' : `/communications?source=${encodeURIComponent(source.id)}`;
```

and the comment above it, `// A channel that is not connected leads to Integrations to connect it.` → `// A channel that is not connected leads to Settings › Connections to connect it.`

In `src/components/layout/SourcesGroup.test.tsx`, change both `expect(screen.getByTestId('where')).toHaveTextContent('/integrations');` (lines 90 and 114) to `expect(screen.getByTestId('where')).toHaveTextContent('/settings/connections');`.

- [ ] **Step 5: Run the layout component tests**

Run: `npx vitest run src/components/layout`
Expected: PASS (including `components/layout house rules`).

- [ ] **Step 6: Suite, lint, build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all pass, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/components/layout/SourcesGroup.tsx src/components/layout/SourcesGroup.test.tsx
git commit -F - <<'MSG'
feat(settings): drop Users and Integrations from the app sidebar

Both now live under Settings (People & teams, Connections); a source that is
not connected leads to /settings/connections.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 6: Attributes Filter and Download made real

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/csv.test.ts`
- Create: `src/pages/settings/testAttributes.ts` (test fixture)
- Create: `src/pages/settings/attributeFilters.ts`, `src/pages/settings/attributeFilters.test.ts`
- Create: `src/pages/settings/AttributesTabContent.test.tsx`
- Modify: `src/pages/settings/attributeConfig.ts` (append `attributeDescription`)
- Modify: `src/pages/settings/AttributesTable.tsx` (the Description cell)
- Modify: `src/pages/settings/AttributesTabContent.tsx` (whole file)
- Modify: `src/pages/settings/SettingsPage.tsx` (a `key` on each `AttributesTabContent`)
- Modify: `src/pages/settings/SettingsPage.test.tsx` (one new test)

**Interfaces:**
- Consumes: `AttributeDef<T>`, `AttributeType`, `usagePercent`, `attributeProperties` (`attributeConfig.ts`).
- Produces:
  - `type CsvCell = string | number`; `toCsv(rows: readonly (readonly CsvCell[])[]): string` (every cell quoted, inner `"` doubled, rows joined by `\r\n`); `downloadCsv(filename: string, csv: string): void`
  - `attributeDescription<T>(attr: AttributeDef<T>): string` (`'Default'` for custom, `'System Generated'` otherwise)
  - `type UsageFilter = 'filled' | 'empty'`; `interface AttributeFilters { types: AttributeType[]; usage: UsageFilter[] }`; `NO_ATTRIBUTE_FILTERS`; `activeFilterCount(filters): number`; `applyAttributeFilters<T>(attributes, entities, filters): AttributeDef<T>[]`; `ATTRIBUTE_CSV_HEADER`; `attributesCsv<T>(attributes, entities): string`

Decisions: the type checkboxes list the types in the entity's full attribute list (`allAttributes`), so typing in search never makes an option vanish. "Has values" means usage > 0, "Empty" means usage = 0; with both or neither ticked, usage does not narrow. Filters reset on a sub-tab change because each entity's `AttributesTabContent` gets its own `key`. The popover's reset is "Clear"; the empty state's is "Clear filters". Tooltips are native `title`s.

- [ ] **Step 1: Write the failing CSV tests**

Create `src/lib/csv.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv, toCsv } from './csv';

const { createObjectURL, revokeObjectURL } = URL;

afterEach(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.restoreAllMocks();
});

describe('toCsv', () => {
  it('quotes every value and doubles the quotes inside one', () => {
    expect(toCsv([['a', 'b,c'], ['say "hi"', 3]])).toBe('"a","b,c"\r\n"say ""hi""","3"');
  });

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('downloadCsv', () => {
  it('saves the text through an object URL it revokes afterwards', async () => {
    const captured: { blob?: Blob } = {};
    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      captured.blob = obj as Blob;
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadCsv('things.csv', '"a","b"');

    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('things.csv');
    expect(await captured.blob!.text()).toBe('"a","b"');
    expect(captured.blob!.type).toBe('text/csv;charset=utf-8');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: FAIL, `Failed to resolve import "./csv"`.

- [ ] **Step 3: Write `csv.ts`**

Create `src/lib/csv.ts`:

```ts
export type CsvCell = string | number;

/** RFC 4180 CSV: every value quoted, a quote inside one doubled, rows
 *  joined by CRLF. Quoting everything keeps commas and line breaks safe. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/** Hands `csv` to the browser as a file download, then frees the URL. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the shared attribute fixture**

Create `src/pages/settings/testAttributes.ts`:

```ts
import type { AttributeDef } from './attributeConfig';

// Test-only: three attributes over two records, giving one 100%, one 50%
// and one 0% usage, and a display name with a comma and a quote for CSV.
export interface Row {
  name: string;
  note: string;
  seats: number;
}

export const ROWS: Row[] = [
  { name: 'Acme', note: 'Renews in May', seats: 0 },
  { name: 'Globex', note: '', seats: 0 },
];

export const ATTRS: AttributeDef<Row>[] = [
  { displayName: 'Name', name: 'name', type: 'text', isCustom: true, required: true, getValue: (row) => row.name },
  { displayName: 'Note, "quoted"', name: 'note', type: 'text', isCustom: true, getValue: (row) => row.note },
  { displayName: 'Seats', name: 'seats', type: 'number', isCustom: false, getValue: (row) => row.seats },
];

export const CSV_HEADER = '"Display name","Name","Description","Type","Properties","Usage %"';
export const CSV_NAME = '"Name","name","Default","text","Required; UI Editable; Visible","100"';
export const CSV_NOTE = '"Note, ""quoted""","note","Default","text","UI Editable; Visible","50"';
export const CSV_SEATS = '"Seats","seats","System Generated","number","Visible","0"';
```

- [ ] **Step 6: Write the failing filter tests**

Create `src/pages/settings/attributeFilters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_ATTRIBUTE_FILTERS, activeFilterCount, applyAttributeFilters, attributesCsv } from './attributeFilters';
import { ATTRS, CSV_HEADER, CSV_NAME, CSV_NOTE, CSV_SEATS, ROWS } from './testAttributes';

const names = (list: { displayName: string }[]) => list.map((attr) => attr.displayName);

describe('applyAttributeFilters (settings spec 2026-10-06 §3.3)', () => {
  it('keeps everything with no filter', () => {
    expect(names(applyAttributeFilters(ATTRS, ROWS, NO_ATTRIBUTE_FILTERS))).toEqual(['Name', 'Note, "quoted"', 'Seats']);
  });

  it('narrows by type', () => {
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: ['number'], usage: [] }))).toEqual(['Seats']);
  });

  it('"Has values" keeps usage above 0 and "Empty" keeps usage of 0', () => {
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: [], usage: ['filled'] }))).toEqual(['Name', 'Note, "quoted"']);
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: [], usage: ['empty'] }))).toEqual(['Seats']);
    expect(names(applyAttributeFilters(ATTRS, ROWS, { types: [], usage: ['filled', 'empty'] }))).toHaveLength(3);
  });

  it('combines type and usage', () => {
    expect(applyAttributeFilters(ATTRS, ROWS, { types: ['text'], usage: ['empty'] })).toEqual([]);
  });
});

describe('activeFilterCount', () => {
  it('counts every ticked box', () => {
    expect(activeFilterCount(NO_ATTRIBUTE_FILTERS)).toBe(0);
    expect(activeFilterCount({ types: ['text', 'number'], usage: ['empty'] })).toBe(3);
  });
});

describe('attributesCsv', () => {
  it('writes the six columns for the rows it is given', () => {
    expect(attributesCsv(ATTRS, ROWS)).toBe([CSV_HEADER, CSV_NAME, CSV_NOTE, CSV_SEATS].join('\r\n'));
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/attributeFilters.test.ts`
Expected: FAIL, `Failed to resolve import "./attributeFilters"`.

- [ ] **Step 8: Add `attributeDescription` and use it in the table**

Append to `src/pages/settings/attributeConfig.ts`:

```ts
/** The table's Description column, shared with the CSV download. */
export function attributeDescription<T>(attr: AttributeDef<T>): string {
  return attr.isCustom ? 'Default' : 'System Generated';
}
```

In `src/pages/settings/AttributesTable.tsx`:
- `import { usagePercent, attributeProperties } from './attributeConfig';` → `import { usagePercent, attributeProperties, attributeDescription } from './attributeConfig';`
- `                        {attr.isCustom ? 'Default' : 'System Generated'}` → `                        {attributeDescription(attr)}`

- [ ] **Step 9: Write `attributeFilters.ts`**

Create `src/pages/settings/attributeFilters.ts`:

```ts
import { toCsv } from '../../lib/csv';
import { attributeDescription, attributeProperties, usagePercent } from './attributeConfig';
import type { AttributeDef, AttributeType } from './attributeConfig';

export type UsageFilter = 'filled' | 'empty';

export interface AttributeFilters {
  types: AttributeType[];
  usage: UsageFilter[];
}

export const NO_ATTRIBUTE_FILTERS: AttributeFilters = { types: [], usage: [] };

export function activeFilterCount(filters: AttributeFilters): number {
  return filters.types.length + filters.usage.length;
}

/** Client-side, over the rows already on screen (settings spec 2026-10-06
 *  §3.3). No type ticked means any type; "Has values" is usage above 0,
 *  "Empty" usage of 0, and both or neither means any usage. */
export function applyAttributeFilters<T>(attributes: AttributeDef<T>[], entities: T[], filters: AttributeFilters): AttributeDef<T>[] {
  return attributes.filter((attr) => {
    if (filters.types.length > 0 && !filters.types.includes(attr.type)) return false;
    if (filters.usage.length === 0) return true;
    const usage = usagePercent(attr, entities);
    return (filters.usage.includes('filled') && usage > 0) || (filters.usage.includes('empty') && usage === 0);
  });
}

export const ATTRIBUTE_CSV_HEADER = ['Display name', 'Name', 'Description', 'Type', 'Properties', 'Usage %'];

export function attributesCsv<T>(attributes: AttributeDef<T>[], entities: T[]): string {
  return toCsv([
    ATTRIBUTE_CSV_HEADER,
    ...attributes.map((attr) => [
      attr.displayName,
      attr.name,
      attributeDescription(attr),
      attr.type,
      attributeProperties(attr).join('; '),
      usagePercent(attr, entities),
    ]),
  ]);
}
```

- [ ] **Step 10: Run the unit tests**

Run: `npx vitest run src/pages/settings/attributeFilters.test.ts src/lib/csv.test.ts`
Expected: PASS.

- [ ] **Step 11: Write the failing component test**

Create `src/pages/settings/AttributesTabContent.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttributesTabContent } from './AttributesTabContent';
import { ATTRS, CSV_HEADER, CSV_NAME, CSV_NOTE, ROWS } from './testAttributes';

// Integration tier (see the `testing` skill): the real component and
// table over a fixed fixture; only the browser's download is stubbed.

const { createObjectURL, revokeObjectURL } = URL;

afterEach(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.restoreAllMocks();
});

function renderTab() {
  render(
    <AttributesTabContent
      entityLabel="organization"
      modelName="Customer"
      attributes={ATTRS}
      allAttributes={ATTRS}
      entities={ROWS}
      isLoading={false}
      error={null}
      searchQuery=""
      setSearchQuery={() => {}}
    />,
  );
}

const shown = (displayName: string) => screen.queryByText(displayName) !== null;

describe('AttributesTabContent Filter (settings spec 2026-10-06 §3.3)', () => {
  it('offers the types present in the list, plus Has values and Empty', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')!.textContent)).toEqual(['text', 'number', 'Has values', 'Empty']);
  });

  it('narrows the rows by type and counts the filter on the button', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'number' }));
    expect(shown('Seats')).toBe(true);
    expect(shown('Note, "quoted"')).toBe(false);
    const button = screen.getByRole('button', { name: 'Filter attributes, 1 active' });
    expect(button).toHaveTextContent('1');
  });

  it('"Empty" shows only the 0% rows', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Empty' }));
    expect(shown('Seats')).toBe(true);
    expect(shown('Note, "quoted"')).toBe(false);
    expect(screen.queryByText('name')).toBeNull();
  });

  it('Clear brings every row back', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'number' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(shown('Seats')).toBe(true);
    expect(shown('Note, "quoted"')).toBe(true);
    expect(screen.getByRole('button', { name: 'Filter attributes' })).toBeInTheDocument();
  });

  it('says when nothing matches, with its own Clear', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'number' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Has values' }));
    expect(screen.getByText('No attributes match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(shown('Note, "quoted"')).toBe(true);
  });

  it('closes on Escape', async () => {
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    expect(screen.getByRole('group', { name: 'Attribute filters' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Attribute filters' })).toBeNull();
  });
});

describe('AttributesTabContent Download (settings spec 2026-10-06 §3.3)', () => {
  it('saves <entity>-attributes.csv built from the filtered rows', async () => {
    const captured: { blob?: Blob } = {};
    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      captured.blob = obj as Blob;
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderTab();

    await userEvent.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'text' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download attributes as CSV' }));

    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('organization-attributes.csv');
    expect(await captured.blob!.text()).toBe([CSV_HEADER, CSV_NAME, CSV_NOTE].join('\r\n'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('gives both buttons a tooltip and a 36px target', () => {
    renderTab();
    for (const name of ['Filter attributes', 'Download attributes as CSV']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('title');
      expect(button).toHaveClass('min-h-9', 'min-w-9');
    }
  });
});
```

- [ ] **Step 12: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/AttributesTabContent.test.tsx`
Expected: FAIL: no button named "Filter attributes".

- [ ] **Step 13: Rewrite `AttributesTabContent.tsx`**

Replace the whole of `src/pages/settings/AttributesTabContent.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Download, Filter } from 'lucide-react';
import { AttributesTable } from './AttributesTable';
import type { AttributeDef } from './attributeConfig';
import {
  NO_ATTRIBUTE_FILTERS,
  activeFilterCount,
  applyAttributeFilters,
  attributesCsv,
  type AttributeFilters,
  type UsageFilter,
} from './attributeFilters';
import { downloadCsv } from '../../lib/csv';

export interface AttributesTabContentProps<T> {
  /** Lowercase noun used in the search placeholder — "organization"/
   * "account"/"opportunity". Also names the CSV download. */
  entityLabel: string;
  /** Lowercase plural, for the loading text — defaults to
   * `${entityLabel}s`, which is wrong for "opportunity" (not
   * "opportunitys"), so that one passes "opportunities" explicitly. */
  pluralLabel?: string;
  /** The real backend model name this mirrors, shown in the disabled
   * Add Attribute button's own tooltip — "Customer"/"Account". */
  modelName: string;
  /** Already filtered by `searchQuery` — see SettingsPage's own
   * per-entity useMemo. */
  attributes: AttributeDef<T>[];
  /** Unfiltered: the search placeholder's total count, and the attribute
   * types the Filter offers. */
  allAttributes: AttributeDef<T>[];
  entities: T[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}

const ICON_BUTTON =
  'inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-lg border border-line bg-surface px-2 text-ink-muted shadow-sm transition-colors hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

const QUIET_BUTTON =
  'inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-[13px] font-semibold text-ink hover:bg-subtle disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

const USAGE_OPTIONS: { key: UsageFilter; label: string }[] = [
  { key: 'filled', label: 'Has values' },
  { key: 'empty', label: 'Empty' },
];

function toggled<K>(list: K[], key: K): K[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

// Shared search bar + action bar + AttributesTable chrome for every
// entity's own Data sub-tab (Organization first, Account next — see
// organizationAttributes.ts/accountAttributes.ts) — split out so
// SettingsPage.tsx doesn't carry two copies of the same JSX, one per
// entity. Filter and Download work on the rows on screen (settings spec
// 2026-10-06 §3.3); SettingsPage keys each entity's copy, so the filters
// reset when the sub-tab changes.
export function AttributesTabContent<T>({
  entityLabel,
  pluralLabel = `${entityLabel}s`,
  modelName,
  attributes,
  allAttributes,
  entities,
  isLoading,
  error,
  searchQuery,
  setSearchQuery,
}: AttributesTabContentProps<T>) {
  const [filters, setFilters] = useState<AttributeFilters>(NO_ATTRIBUTE_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const typesPresent = useMemo(() => [...new Set(allAttributes.map((attr) => attr.type))], [allAttributes]);
  const visible = useMemo(() => applyAttributeFilters(attributes, entities, filters), [attributes, entities, filters]);
  const active = activeFilterCount(filters);

  // The popover closes on a click outside it and on Escape.
  useEffect(() => {
    if (!isFilterOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setIsFilterOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFilterOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isFilterOpen]);

  return (
    <>
      {/* Table Search & Action Bar */}
      <div className="px-8 pb-3 flex items-center justify-between gap-4">
        <div className="relative flex-1 group">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint group-focus-within:text-accent transition-colors" aria-hidden="true" />
           <input
             type="text"
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             placeholder={`Search from ${allAttributes.length} ${entityLabel} attributes`}
             className="w-full pl-9 pr-4 py-1.5 bg-subtle border border-line rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all font-medium"
           />
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled
            title={`Custom fields aren't supported yet — every row here mirrors a real field already on the ${modelName} model.`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold shadow-sm opacity-50 cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Attribute
          </button>

          <div ref={filterRef} className="relative">
            <button
              type="button"
              aria-label={active > 0 ? `Filter attributes, ${active} active` : 'Filter attributes'}
              aria-expanded={isFilterOpen}
              title="Filter attributes"
              onClick={() => setIsFilterOpen((open) => !open)}
              className={ICON_BUTTON}
            >
              <Filter className="w-3.5 h-3.5" aria-hidden="true" />
              {active > 0 && <span className="text-[11px] font-bold text-ink tabular-nums">{active}</span>}
            </button>
            {isFilterOpen && (
              <div
                role="group"
                aria-label="Attribute filters"
                className="absolute right-0 top-full z-20 mt-1 flex w-56 flex-col gap-3 rounded-lg border border-line bg-surface p-3 shadow-md"
              >
                <fieldset className="flex flex-col">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Type</legend>
                  {typesPresent.map((type) => (
                    <label key={type} className="flex min-h-9 items-center gap-2 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={filters.types.includes(type)}
                        onChange={() => setFilters((current) => ({ ...current, types: toggled(current.types, type) }))}
                      />
                      {type}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="flex flex-col">
                  <legend className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Usage</legend>
                  {USAGE_OPTIONS.map((option) => (
                    <label key={option.key} className="flex min-h-9 items-center gap-2 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={filters.usage.includes(option.key)}
                        onChange={() => setFilters((current) => ({ ...current, usage: toggled(current.usage, option.key) }))}
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>
                <button type="button" disabled={active === 0} onClick={() => setFilters(NO_ATTRIBUTE_FILTERS)} className={QUIET_BUTTON}>
                  Clear
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="Download attributes as CSV"
            title="Download as CSV"
            onClick={() => downloadCsv(`${entityLabel}-attributes.csv`, attributesCsv(visible, entities))}
            className={ICON_BUTTON}
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Attributes Table Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 scrollbar-thin scrollbar-thumb-line">
         {isLoading && entities.length === 0 ? (
           <div className="flex items-center justify-center h-full text-[13px] font-medium text-ink-faint">
             Loading {pluralLabel}…
           </div>
         ) : error ? (
           <div className="flex items-center justify-center h-full text-[13px] font-medium text-danger">{error}</div>
         ) : active > 0 && visible.length === 0 ? (
           <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
             <p className="text-[13px] font-medium text-ink-muted">No attributes match these filters</p>
             <button type="button" onClick={() => setFilters(NO_ATTRIBUTE_FILTERS)} className={QUIET_BUTTON}>
               Clear filters
             </button>
           </div>
         ) : (
           <AttributesTable entities={entities} attributes={visible} />
         )}
      </div>
    </>
  );
}
```

(Besides the two real buttons, the edit swaps the Add Attribute button's raw `text-white` for the token `text-on-accent` and hides its icon from screen readers, per Global Constraints.)

- [ ] **Step 14: Run the component test**

Run: `npx vitest run src/pages/settings/AttributesTabContent.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 15: Write the failing reset-on-sub-tab test**

In `src/pages/settings/SettingsPage.test.tsx`, inside `describe('SettingsPage — Data tab, Organization sub-tab', …)`, after the test `'searching filters the attribute list by display name or field name'`, add:

```tsx
  it('resets the attribute filters when the sub-tab changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/auth/me/')) return Promise.resolve(jsonResponse(200, (currentStore?.getState() as { auth: { user: unknown } }).auth.user));
        return Promise.resolve(jsonResponse(200, { count: 1, next: null, previous: null, results: [filledOrg] }));
      }),
    );
    const user = userEvent.setup();

    renderSettingsPageAsAdmin();
    await screen.findByText('Custom Attributes');
    await user.click(screen.getByRole('button', { name: 'Filter attributes' }));
    await user.click(screen.getByRole('checkbox', { name: 'date' }));
    expect(screen.getByRole('button', { name: 'Filter attributes, 1 active' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(await screen.findByRole('button', { name: 'Filter attributes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter attributes, 1 active' })).toBeNull();
  });
```

- [ ] **Step 16: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/SettingsPage.test.tsx -t "resets the attribute filters"`
Expected: FAIL: React keeps the same `AttributesTabContent` instance across the sub-tabs, so the button still reads "Filter attributes, 1 active".

- [ ] **Step 17: Key each entity's tab content**

In `src/pages/settings/SettingsPage.tsx`, add a `key` as the first prop of each of the five `<AttributesTabContent` elements, using these exact one-line replacements:

| Old | New |
|---|---|
| `              entityLabel="organization"` | `              key="organization"` + newline + `              entityLabel="organization"` |
| `              entityLabel="account"` | `              key="account"` + newline + `              entityLabel="account"` |
| `              entityLabel="contact"` | `              key="contact"` + newline + `              entityLabel="contact"` |
| `                  entityLabel="opportunity"` | `                  key="opportunity"` + newline + `                  entityLabel="opportunity"` |
| `                  entityLabel="risk"` | `                  key="risk"` + newline + `                  entityLabel="risk"` |

- [ ] **Step 18: Run the settings tests**

Run: `npx vitest run src/pages/settings src/lib`
Expected: PASS.

- [ ] **Step 19: Suite, lint, build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all pass, exit 0.

- [ ] **Step 20: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts src/pages/settings/testAttributes.ts src/pages/settings/attributeFilters.ts src/pages/settings/attributeFilters.test.ts src/pages/settings/attributeConfig.ts src/pages/settings/AttributesTable.tsx src/pages/settings/AttributesTabContent.tsx src/pages/settings/AttributesTabContent.test.tsx src/pages/settings/SettingsPage.tsx src/pages/settings/SettingsPage.test.tsx
git commit -F - <<'MSG'
feat(settings): make the attributes filter and download real

Filter narrows the rows on screen by type and by Has values / Empty, counts
itself on the button and resets per sub-tab; Download saves the filtered
rows as <entity>-attributes.csv through a small toCsv helper.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 7: Webhooks' read-only event line

**Files:**
- Modify: `src/pages/settings/WebhooksPage.tsx:113`
- Modify: `src/pages/settings/WebhooksPage.test.tsx` (one new test)

**Interfaces:**
- Consumes: nothing new. Produces: nothing new. Wording only (spec §3.4); there is no event picker today and none is added.

- [ ] **Step 1: Write the failing test**

In `src/pages/settings/WebhooksPage.test.tsx`, inside `describe('WebhooksPage', …)`, after `'shows the empty state when there are no webhooks'`, add:

```tsx
  it('states the one event as a read-only line, not a choice', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('No webhooks yet.');
    await user.click(screen.getByRole('button', { name: 'Add Webhook' }));

    expect(screen.getByText('Sends when: Organization created')).toBeInTheDocument();
    expect(screen.queryByText(/the only event available/)).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/settings/WebhooksPage.test.tsx -t "read-only line"`
Expected: FAIL: unable to find "Sends when: Organization created".

- [ ] **Step 3: Change the wording**

In `src/pages/settings/WebhooksPage.tsx`, replace

```tsx
          <p className="text-[12px] text-ink-faint">Event: Organization Created — the only event available right now.</p>
```

with

```tsx
          <p className="text-[12px] text-ink-faint">Sends when: Organization created</p>
```

- [ ] **Step 4: Run the Webhooks tests**

Run: `npx vitest run src/pages/settings/WebhooksPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/WebhooksPage.tsx src/pages/settings/WebhooksPage.test.tsx
git commit -F - <<'MSG'
feat(settings): state the webhook event as a read-only line

The backend sends one event, so the form says "Sends when: Organization
created" rather than hinting at a choice.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 8: Docs (app flow, UI/UX, repo architecture) and final verification

**Files:**
- Modify: `docs/04-app-flow.md` (route table lines 84-89; sidebar sentence lines 107-108; section titles 4.5f, 4.5g, 4.9; section 4.10; line 1302; Redux map line 1407; dead-ends row line 1421)
- Modify: `docs/03-ui-ux-design.md` (new `### Settings: the frame` before `### Overlays`)
- Modify: `.agents/workflows/repo-architecture.md` (line 84; route tree lines 157-169; §8 table; line 821)

**Interfaces:** none (docs only). The spec (§5) requires the two `docs/` files; `repo-architecture.md` names files this round deletes (`aiSettingsTabs.ts`, `SettingPlaceholder.tsx`), so it is corrected in the same PR.

- [ ] **Step 1: Route table in `docs/04-app-flow.md`**

Delete these two rows (lines 84 and 86):

```markdown
| `/integrations` | `Integrations` | auth |
| `/users` | `UserManagement` | `manage_users` |
```

Then replace the three settings rows (lines 87-89):

```markdown
| `/settings/{data,currency,products,entity-uploads,webhooks,global-presets,ai-agent}` | one page each | auth, writes gated per capability |
| `/settings/{activities,connect-widget}` | `SettingPlaceholder` | auth |
| `/settings/{ai-usage,ai-skills,ai-feedback}` | `AgentsPage`, `SkillsPage`, `FeedbackLogPage` (the former Brain > Agents, Skills, Feedback Log) | `view_all_accounts` |
```

with

```markdown
| `/settings` | `WorkspaceSettingsLayout` (`pages/settings/routes.tsx`): the grouped settings nav, a select below `md`; the index redirects to `/settings/general` | auth |
| `/settings/general` | `GeneralSettingsPage`: name, slug and owner; the owner hands the workspace on (`POST /auth/organisation/owner/`, then `/auth/me/`) | auth (transfer: the owner) |
| `/settings/people` | `UserManagement` (members, roles, access) | `manage_users` |
| `/settings/connections` | `Integrations` (mailbox, connectors, CallSense) | auth, connector writes `manage_integrations` |
| `/settings/billing` | `BillingSettingsPage` (the ledger needs `manage_org_settings`) | auth |
| `/settings/{data,defaults,products,entity-uploads,ai-agent,ai-attributes,brief-delivery,webhooks,agent-access}` | `SettingsPage` (attributes), `DefaultsPage` (Currency + New organisations), then one page each | auth, writes gated per capability |
| `/settings/{ai-usage,ai-skills,ai-feedback}` | `AgentsPage`, `SkillsPage`, `FeedbackLogPage` (the former Brain > Agents, Skills, Feedback Log) | `view_all_accounts` |
| `/settings/{currency,global-presets}`, `/settings/{activities,connect-widget}` | redirect to `/settings/defaults`, `/settings/general` | auth |
| `/users`, `/integrations` | redirect to `/settings/people`, `/settings/connections`; `/integrations` keeps its query and hash, so the backend's OAuth callbacks (`${FRONTEND_URL}/integrations?<result>`) still land with their result | auth |
```

- [ ] **Step 2: Sidebar sentence and section titles in `docs/04-app-flow.md`**

1. Replace the two lines

```markdown
questions are the Brain bar's tabs — SETUP (Settings, Lifecycle, Health,
Users, Integrations).
```

with

```markdown
questions are the Brain bar's tabs — SETUP (Settings, Lifecycle). Users and
Integrations live under Settings as People & teams and Connections.
```
2. `### 4.5f Brief delivery (Settings > Brief Delivery)` → `### 4.5f Brief delivery (Settings › AI › Briefs)`
3. `### 4.5g Agent access (Settings > Agent Access)` → `### 4.5g Agent access (Settings › Developers › Agent access)`
4. `### 4.9 Integrations` → `### 4.9 Connections (Settings › Workspace › Connections)`, and add as the section's first line: ``Reached at `/settings/connections`; `/integrations` redirects there with its query and hash.``
5. Replace the two lines

```markdown
Agents, Skills and Feedback Log have moved to Settings > AI usage / AI
skills / AI feedback.
```

with

```markdown
Agents, Skills and Feedback Log have moved to Settings › AI (AI usage, AI
skills, AI feedback).
```
6. Redux map: replace the row

```markdown
| `feedback`, `agents`, `skills` | Settings > AI feedback, AI usage, AI skills (and Agent Access) |
```

   with

```markdown
| `feedback`, `agents`, `skills` | Settings › AI feedback, AI usage, AI skills (and Developers › Agent access) |
```
7. Dead ends table: delete the row `| Settings: Activities, Connect Widget | Placeholder |`.

- [ ] **Step 3: Rewrite section 4.10 in `docs/04-app-flow.md`**

Replace the first two paragraphs of `### 4.10 Settings and administration`: from the line starting `Nine settings pages reached from the Navbar sub-navigation,` through the line

```markdown
Domains need `manage_org_settings`; the rest needs `manage_users`.
```

with:

```markdown
`/settings` is the workspace's settings (spec
`docs/superpowers/specs/2026-10-06-settings-rework-design.md`), in
`WorkspaceSettingsLayout`: a grouped left nav from `md`, a grouped select below
it (see 03 UI/UX, "Settings: the frame"). An item is shown only to someone its
route lets in; each page gates its own writes by capability. The Navbar shows
only "Settings" here.

- **Workspace.** General (`GeneralSettingsPage`): the name and slug,
  read-only, and the owner. The owner picks another active member, confirms
  ("You keep your role but lose the owner's rights."), and the page posts
  `/auth/organisation/owner/ {user_id}`, then reads `/auth/me/` again so
  `is_owner` flips; a refusal shows the server's message below the picker.
  Everyone else reads "Only the owner, <name>, can hand the workspace on."
  People & teams (`UserManagement`, `manage_users`), Connections
  (`Integrations`), Plan & billing (`BillingSettingsPage`).
- **Data.** Attributes (`SettingsPage`): usage per entity with a Filter (the
  types present, Has values / Empty, a count on the button, Clear; reset per
  sub-tab) and Download of the rows on screen as `<entity>-attributes.csv`,
  plus the global attribute mapping. Defaults (`DefaultsPage`): Currency with
  its exchange rates, and New organisations' default lifecycle stage, each with
  its own Save. Products, Imports (CSV importer with column mapping).
- **AI.** AI agent, AI attributes, AI skills, AI usage and AI feedback (the
  last three `view_all_accounts`), Briefs.
- **Developers.** Webhooks (one event, stated as "Sends when: Organization
  created"), Agent access.

Old addresses land with `replace`: `/settings` → General,
`/settings/currency` and `/settings/global-presets` → Defaults,
`/settings/activities` and `/settings/connect-widget` → General, `/users` →
People & teams, `/integrations` → Connections with query and hash kept.

People & teams manages members with inline role, function, manager and active
controls, a Roles tab that edits capability checkboxes live, and an Access tab
(`AccessTab.tsx`, `features/access/accessSlice.ts`): people waiting to join
(approve with a role, or reject), invitations (send by address and role; the
invited person signs in and is let straight in; cancel), and email domains
(add, copy the TXT record, check DNS; verified domains route sign-ins here).
Domains need `manage_org_settings`; the rest needs `manage_users`.
```

In the `/account-settings/*` paragraph that follows, replace

```markdown
`manage_org_settings`, the credit ledger), integrations, personalization
```

with

```markdown
`manage_org_settings`, the credit ledger; also reachable as Settings › Plan &
billing until the account-settings round removes the duplicate), integrations,
personalization
```

- [ ] **Step 4: The frame entry in `docs/03-ui-ux-design.md`**

Insert before the line `### Overlays`:

```markdown
### Settings: the frame

Spec `docs/superpowers/specs/2026-10-06-settings-rework-design.md` §2. Every
`/settings/*` route sits in `WorkspaceSettingsLayout` (`src/layouts/`): a nav
column (`w-56`, `border-r border-line`), then the page, which keeps its own
scroll. The nav reads `WORKSPACE_SETTINGS_NAV`
(`pages/settings/workspaceSettingsNav.ts`) in four groups, Workspace, Data, AI
and Developers, each under an 11px uppercase `text-ink-faint` label. A row is
`min-h-9` with a 16px Lucide icon and 13px text; the current row is
`bg-subtle text-ink font-semibold` with `aria-current="page"`; focus is
`focus-visible:outline-accent`. An item is drawn only for someone its route
lets in (People & teams needs `manage_users`; AI skills, AI usage and AI
feedback need `view_all_accounts`). Below `md` the column is a native
`<select aria-label="Settings section">` above the page, grouped with
`<optgroup>`, `min-h-11`; choosing one navigates, and nothing scrolls
sideways. On these routes the Navbar shows only "Settings": no tabs, no
chevron. Solid surfaces, no glass. Pages keep their own `text-[20px] font-bold`
h1. Work and Agents get groups when their features land; nothing is drawn for
them before.
```

- [ ] **Step 5: `.agents/workflows/repo-architecture.md`**

1. Line 84: replace `← Settings module (data, currency, etc.); aiSettingsTabs.ts (the AI usage/skills/feedback tab list, view_all_accounts)` with `← Workspace settings: routes.tsx (settingsRoutes), workspaceSettingsNav.ts (the grouped nav), General, Defaults and the other pages`.
2. Replace the route-tree lines from `├── settings/` through `├── users                      → User Management [ADMIN ONLY — AdminRoute]` with:

```text
├── settings/                  → WorkspaceSettingsLayout (pages/settings/routes.tsx)
│   ├── (index)                → Redirects to /settings/general
│   ├── general                → GeneralSettingsPage (workspace, ownership transfer)
│   ├── people                 → UserManagement [manage_users]
│   ├── connections            → Integrations
│   ├── billing                → BillingSettingsPage
│   ├── data                   → SettingsPage (attributes, Filter, Download)
│   ├── defaults               → DefaultsPage (Currency + New organisations)
│   ├── products, entity-uploads, ai-agent, ai-attributes, brief-delivery, webhooks, agent-access → one page each
│   ├── ai-skills, ai-usage, ai-feedback → SkillsPage, AgentsPage, FeedbackLogPage [view_all_accounts]
│   └── currency, global-presets, activities, connect-widget → Redirects (Defaults, General)
├── integrations               → Redirects to /settings/connections (query and hash kept)
├── profile                    → My Profile (any role)
├── users                      → Redirects to /settings/people
```

3. In the section headed `### 8. Settings (pages/settings/)` (the heading has the path in backticks), replace the line `Multi-tab settings module:` with `Workspace settings, one grouped frame (WorkspaceSettingsLayout):` and replace the table rows

```markdown
| `SettingsPage.tsx` | Main page — tabs + active sub-route shell |
| `AttributesTable.tsx` (9.5 KB) | Data attributes management table (add/edit/delete) |
| `GlobalConfigSidebar.tsx` (3.8 KB) | Global configuration right panel |
| `SettingPlaceholder.tsx` | Generic stub for unimplemented settings tabs |
```

with

```markdown
| `routes.tsx` | `settingsRoutes(stub?)`: the settings tree and the `/users`, `/integrations` redirects |
| `workspaceSettingsNav.ts` | `WORKSPACE_SETTINGS_NAV` and `visibleSettingsNav` |
| `GeneralSettingsPage.tsx`, `ownershipApi.ts` | Workspace identity and ownership transfer |
| `DefaultsPage.tsx`, `CurrencySection.tsx`, `LifecycleDefaultSection.tsx` | Currency with FX rates; the default lifecycle stage |
| `SettingsPage.tsx` | Attributes: entity sub-tabs, `AttributesTabContent` (search, Filter, Download), `AttributesTable` |
| `attributeFilters.ts` | Filter state, filtering and the attributes CSV (`lib/csv.ts`) |
| `GlobalConfigSidebar.tsx` | Global configuration right panel |
```

4. Delete this row (line 821):

```markdown
| `/settings/currency` … `/settings/ai-agent` | Stub `SettingPlaceholder` |
```

- [ ] **Step 6: Check nothing in the docs still points at removed things**

Run: `grep -n "SettingPlaceholder\|aiSettingsTabs\|Global Presets\|/settings/currency" docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md`
Expected: only the redirect rows that name `/settings/currency` as an old address.

- [ ] **Step 7: Final verification (verification-before-completion)**

Run each and read the output before claiming anything:

```bash
npx vitest run
npm run lint
npm run build
grep -rn "AI_SETTINGS_TABS\|SettingPlaceholder\|CurrencyPage\|GlobalPresetsPage\|'/integrations'\|\"/users\"" src
git status --short
```

Expected: the suite passes; lint and build exit 0; the grep finds only `CustomObjectsPage.tsx`'s historical comment and the `'/integrations'` route path test strings in `routes.test.tsx` (none in app code); `git status` shows only the three docs files modified and no `node_modules`.

- [ ] **Step 8: Commit**

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md
git commit -F - <<'MSG'
docs(settings): settings frame, routes and redirects as built

App flow: the new route table, redirects and section 4.10; UI/UX: the
settings frame; repo architecture: the settings tree and files.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Self-review

**Spec coverage.**
- §1 IA table, "Shown to" rule, groups and order → Task 1 (constant, layout), Task 4 (routes and guards, every nav path tested to open for an admin).
- §1 redirects with `replace`, `/integrations` keeping search and hash → Task 4 (`KeepLocation`, routes test cases including query and hash).
- §1 app sidebar items removed, `SourcesGroup` link → Task 5.
- §2.1 layout, tokens, `w-56`, group label, row, active row, focus, phone select with optgroups, no glass → Task 1; Navbar tabs and chevron removed → Task 4.
- §2.2 page heads: `UserManagement` and `Integrations` already own their scroll and `max-w-4xl mx-auto py-8 px-4`; no second title is added; `SettingsPage`'s negative margins removed and `BillingSettingsPage` padded in its route (Task 4).
- §3.1 General → Task 2. §3.2 Defaults, stale comment removed, no dead file → Task 3. §3.3 Filter and Download, `toCsv` unit test → Task 6. §3.4 Webhooks → Task 7. §3.5 removals → Tasks 4 and 5.
- §4 testing list: layout (Task 1), redirects (Task 4), Navbar (Task 4), General (Task 2), Defaults (Task 3), Attributes (Task 6), Webhooks (Task 7), Sidebar (Task 5); lint, build, suite after every task.
- §5 docs → Task 8.

**Placeholder scan.** No TBD/TODO; every code step carries the code or an exact old→new replacement.

**Type consistency.** `WORKSPACE_SETTINGS_NAV`/`visibleSettingsNav` (Task 1) are consumed in Tasks 1 and 4; `GeneralSettingsPage` (Task 2) and `DefaultsPage` (Task 3) in Task 4; `AttributeFilters`, `NO_ATTRIBUTE_FILTERS`, `activeFilterCount`, `applyAttributeFilters`, `attributesCsv` (Task 6) match their tests; `toCsv`/`downloadCsv` signatures match `csv.test.ts`.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-10-06-settings-rework.md`. Two execution options:

1. **Subagent-driven (recommended):** a fresh subagent per task, a review between tasks (superpowers:subagent-driven-development).
2. **Inline execution:** run the tasks in one session with checkpoints (superpowers:executing-plans).
