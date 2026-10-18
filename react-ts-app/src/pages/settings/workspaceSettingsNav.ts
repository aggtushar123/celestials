import { Bot, Building2, CreditCard, Database, Globe, Info, ListTodo, Package, Plug, SlidersHorizontal, Sparkles, Upload, User, Users, Webhook, Zap, type LucideIcon } from 'lucide-react';
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
 *  the person's own group, You, then the workspace's four groups. Work,
 *  Agents, AI and Developers are pages with tabs; their old one-page
 *  addresses redirect (routes.tsx). You is what account settings held
 *  (owner, 2026-10-17: one Settings, Plan & billing once, under Workspace);
 *  /account-settings/* redirects here. */
export const WORKSPACE_SETTINGS_NAV: readonly WorkspaceSettingsGroup[] = [
  {
    label: 'You',
    items: [
      { label: 'Account', path: '/settings/account', icon: User },
      { label: 'Personalization', path: '/settings/personalization', icon: Globe },
      { label: 'Your skills & tasks', path: '/settings/skills', icon: Zap },
      { label: 'About', path: '/settings/about', icon: Info },
    ],
  },
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
