import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Box, Boxes, Brain, CircleDot, Columns, GitBranch, GitCommit, Globe, Layers, LayoutGrid, List, ListTodo, LogOut, Network, PenTool, PieChart, Sliders, Sparkles, Target, Users, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { useFeedCount } from '../work/useFeedCount';
import { fetchCustomObjectDefinitions } from '../../features/customObjects/customObjectsApi';
import type { CustomObjectDefinition } from '../../features/customObjects/types';
import { logout } from '../../features/auth/authSlice';
import { trapTab } from '../../lib/focusTrap';
import { MD, useMediaQuery } from '../../lib/useMediaQuery';
import { isBrainPath } from '../../features/brain/brainTabs';
import { feedBadgeName } from '../../features/work/feed';
import { isWorkPath } from '../../features/work/workTabs';
import { DRAWER_ID } from './MenuButton';
import { SourcesGroup } from './SourcesGroup';
import { useHoverLabel } from './useHoverLabel';
import { UserAvatar } from './UserAvatar';

/** Below `md` the rail is an off-canvas drawer (phone shell spec
 *  2026-10-06, option A): closed by default, opened by a menu button
 *  DashboardLayout owns the state for, translated fully offscreen so it
 *  never overlaps the page, and shown over a scrim with the usual dialog
 *  semantics while open. At `md` and up nothing here changes: it stays in
 *  flow, always visible, never a dialog. */
export function Sidebar({ isOpen = false, onClose = () => {} }: { isOpen?: boolean; onClose?: () => void }) {
  const navigate = useNavigate();
  const currentUser = useAppSelector((state) => state.auth.user);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const location = useLocation();
  // Review round 2, Minor 3: the open state must not survive crossing `md`
  // (e.g. an iPad rotating from 744px portrait to landscape) — the dialog
  // role, the Tab trap and `inert` are all gated on this too, not just
  // `isOpen`, below.
  const isMdUp = useMediaQuery(MD);

  // A caller passing a new inline onClose each render (DashboardLayout does)
  // must not re-run the open effect below — same fix as Sheet.tsx's.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Closes the drawer itself if the viewport widens past `md` while it's
  // open, rather than leaving a dialog sitting open over a rail that's now
  // always in flow.
  useEffect(() => {
    if (isMdUp && isOpen) onCloseRef.current();
  }, [isMdUp, isOpen]);

  // Phone drawer: Escape closes it, Tab stays inside it, and focus moves to
  // its Close button on open and back to whatever opened it (the menu
  // button) on close. Only wired while actually open below `md` — at `md`
  // and up the rail is always in flow and never a dialog.
  useEffect(() => {
    if (!isOpen || isMdUp) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current();
      if (event.key === 'Tab' && drawerRef.current) trapTab(event, drawerRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [isOpen, isMdUp]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isUserMenuOpen]);

  const isOrgsActive = location.pathname.includes('/organizations');
  const isSettingsActive = location.pathname.startsWith('/settings');

  // The org's own real custom object types (Settings > Custom Objects)
  // — replaces the single hardcoded "SFDC Opportunity Line Item" nav
  // item this section used to have, which linked to a dead /sfdc route
  // with nothing behind it. Fetched once (not per accordion toggle —
  // there's no accordion behavior wired to that chevron yet, same as
  // before) rather than kept in Redux: the sidebar is the second place
  // that needs this list (after Settings' own page), still not enough
  // call sites to justify a shared slice over a plain fetch.
  const [customObjects, setCustomObjects] = useState<CustomObjectDefinition[]>([]);
  const accountRef = useRef<HTMLButtonElement>(null);
  const account = useHoverLabel(accountRef, currentUser?.name || 'Your account');

  useEffect(() => {
    fetchCustomObjectDefinitions()
      .then(setCustomObjects)
      .catch(() => {
        // A failed fetch just leaves this section showing no items —
        // not worth a blocking error in a sidebar.
      });
  }, []);

  // Review round 2, Important 2: an off-canvas drawer is only translated
  // offscreen, so without this its 25+ links stay in the tab order and the
  // accessibility tree on phones — the first Tab press (or a screen
  // reader's swipe) would walk through invisible links before reaching the
  // menu button. `inert` drops it from both. Gated on `!isMdUp` too: at `md`
  // and up the rail is always in flow and must never be inert.
  const isDrawerInert = !isOpen && !isMdUp;
  const isDialog = isOpen && !isMdUp;

  return (
    <>
      {isDialog && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-scrim md:hidden"
        />
      )}
      <aside
        id={DRAWER_ID}
        ref={drawerRef}
        inert={isDrawerInert}
        role={isDialog ? 'dialog' : undefined}
        aria-modal={isDialog ? true : undefined}
        aria-label={isDialog ? 'Navigation' : undefined}
        className={`h-full ${isOpen ? 'w-64 max-w-[85vw]' : 'w-[72px]'} md:w-[72px] border-r border-[var(--rv-sidebar-border)] bg-[var(--rv-sidebar-bg)] flex flex-col z-40 shrink-0 fixed inset-y-0 left-0 transition-transform duration-200 md:static md:translate-x-0 md:transition-none ${isOpen ? 'translate-x-0 ease-out' : '-translate-x-full ease-in'}`}
      >
        {/* Header section with Logo, and the phone-only close button */}
        <div className="flex items-center justify-between md:justify-center h-[60px] shrink-0 mt-3 mb-6 px-2">
          <div className="w-8 h-8 shrink-0 bg-brand rounded-[8px] shadow-sm flex items-center justify-center text-on-brand font-extrabold text-[15px] tracking-tighter" aria-label="Revenact">
            R
          </div>
          <button
            type="button"
            data-drawer-close=""
            onClick={onClose}
            aria-label="Close navigation"
            className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

      {/* Nav Content. Minor 4: a tap on the current page's own item doesn't
          change the route, so DashboardLayout's route-change effect never
          fires — close on any link click here too, delegated so every
          NavItem (and the forceActive Link) is covered without threading a
          handler through each one. Only matters while actually open. */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-2 flex flex-col items-center gap-1 px-2"
        onClick={(event) => {
          if (isOpen && (event.target as HTMLElement).closest('a')) onClose();
        }}
      >

        {/* Top Links */}
        {/* Work first: it is the home page (owner, 2026-10-17). */}
        <WorkNavItem expanded={isOpen} />
        {/* KNOWLEDGE BRAIN (brain UI spec 2026-10-06 §1.3; owner 2026-10-17:
            right after Work): one item for every member, lit on every Brain
            route. The four questions are the Brain bar's tabs; Agents, Skills
            and Feedback Log live in Settings > AI. */}
        <BrainNavItem expanded={isOpen} />
        <NavItem to="/copilot" icon={<Sparkles className="w-5 h-5" aria-hidden="true" />} label="Copilot" expanded={isOpen} />
        <NavItem to="/dashboard" icon={<LayoutGrid className="w-5 h-5" aria-hidden="true" />} label="Dashboard" expanded={isOpen} />
        <SourcesGroup expanded={isOpen} />

        {/* ENTITIES Section */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>
        
        <NavItem to="/organizations/list" icon={<Network className="w-5 h-5" aria-hidden="true" />} label="Organizations" isActiveOverride={isOrgsActive} expanded={isOpen} />
        <NavItem to="/accounts" icon={<Layers className="w-5 h-5" aria-hidden="true" />} label="Accounts" expanded={isOpen} />
        <NavItem to="/contacts" icon={<Users className="w-5 h-5" aria-hidden="true" />} label="Contacts" expanded={isOpen} />
        <NavItem to="/pipelines" icon={<Target className="w-5 h-5" aria-hidden="true" />} label="Pipelines" expanded={isOpen} />

        {/* CUSTOM OBJECTS Section */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>

        {customObjects.map((definition) => (
          <NavItem
            key={definition.id}
            to={`/custom-objects/${definition.id}`}
            icon={<Boxes className="w-5 h-5" aria-hidden="true" />}
            label={definition.name} expanded={isOpen} />
        ))}
        <NavItem to="/feedbacks" icon={<Globe className="w-5 h-5" aria-hidden="true" />} label="Product Feedbacks" expanded={isOpen} />

        {/* TOOLS Section */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>

        <NavItem to="/segments" icon={<PieChart className="w-5 h-5" aria-hidden="true" />} label="Segments" expanded={isOpen} />
        <NavItem to="/projects" icon={<GitCommit className="w-5 h-5" aria-hidden="true" />} label="Project Management" expanded={isOpen} />
        <NavItem to="/scenarios" icon={<GitBranch className="w-5 h-5" aria-hidden="true" />} label="Scenarios" expanded={isOpen} />
        <NavItem to="/surveys" icon={<List className="w-5 h-5" aria-hidden="true" />} label="Surveys" expanded={isOpen} />
        <NavItem to="/campaigns" icon={<Columns className="w-5 h-5" aria-hidden="true" />} label="Campaigns" expanded={isOpen} />
        <NavItem to="/canvas" icon={<PenTool className="w-5 h-5" aria-hidden="true" />} label="Canvas" expanded={isOpen} />

        {/* SETUP Section */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>

        <NavItem to="/settings" icon={<Box className="w-5 h-5" aria-hidden="true" />} label="Settings" isActiveOverride={isSettingsActive} expanded={isOpen} />
        <NavItem to="/lifecycle" icon={<CircleDot className="w-5 h-5" aria-hidden="true" />} label="Lifecycle" expanded={isOpen} />

      </div>

      {/* Bottom Avatar / Initials Icon (Purple circle 'T' with Account Settings & Sign Out) */}
      <div ref={userMenuRef} className="relative p-2 border-t border-line shrink-0 bg-surface">
        {isUserMenuOpen && (
          <div
            className="absolute bottom-[calc(100%+8px)] left-2 w-56 bg-surface border border-line rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center gap-3 p-3 border-b border-line-subtle">
              <UserAvatar
                name={currentUser?.name}
                email={currentUser?.email}
                avatarUrl={currentUser?.avatar}
                className="w-9 h-9 rounded-full object-cover shrink-0 shadow-xs select-none"
              />
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-ink truncate">
                  {currentUser?.name || 'Your account'}
                </div>
                <div className="text-[11px] text-ink-muted truncate">
                  {currentUser?.email ?? ''}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                navigate('/settings/account');
              }}
              className={`w-full min-h-11 flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-all cursor-pointer ${
                location.pathname.startsWith('/settings')
                  ? 'text-accent bg-accent-dim font-semibold'
                  : 'text-ink-muted hover:text-ink hover:bg-subtle'
              }`}
            >
              <Sliders className="w-[15px] h-[15px]" aria-hidden="true" />
              Settings
            </button>

            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                dispatch(logout());
                navigate('/login');
              }}
              className="w-full min-h-11 flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-ink-muted hover:text-danger hover:bg-danger-dim transition-all border-t border-line-subtle cursor-pointer"
            >
              <LogOut className="w-[15px] h-[15px]" aria-hidden="true" />
              Sign out
            </button>
          </div>
        )}

        <button
          ref={accountRef}
          {...account.handlers}
          type="button"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          aria-label={currentUser?.name ? `${currentUser.name} — account settings` : 'Account settings'}
          className="w-full min-h-11 min-w-11 flex items-center justify-center p-1.5 rounded-lg hover:bg-subtle transition-all cursor-pointer select-none"
        >
          <UserAvatar
            name={currentUser?.name}
            email={currentUser?.email}
            avatarUrl={currentUser?.avatar}
            className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-transparent hover:ring-accent/30 transition-all"
          />
        </button>
        {account.node}
      </div>
      </aside>
    </>
  );
}

/** The Brain (brain UI spec 2026-10-06 §1.3): one item for every member, to
 *  /brain, lit on every Brain route. No badge: what waits on the reader
 *  lives in Work (work in one place §5). Exported for the Brain's journeys. */
export function BrainNavItem({ expanded = false }: { expanded?: boolean }) {
  const location = useLocation();
  return <NavItem to="/brain" icon={<Brain className="w-5 h-5" aria-hidden="true" />} label="Brain" forceActive={isBrainPath(location.pathname)} expanded={expanded} />;
}

/** Work (work in one place §5): one item to My work, lit on every Work
 *  route, with the one badge (decisions waiting plus overdue tasks) named
 *  "Work, 3 to decide, 1 overdue" (Decision 12). Exported for the journeys. */
export function WorkNavItem({ expanded = false }: { expanded?: boolean }) {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const count = useFeedCount(userId);
  const location = useLocation();
  return (
    <NavItem
      to="/work"
      icon={<ListTodo className="w-5 h-5" aria-hidden="true" />}
      label="Work"
      badge={count?.badge}
      badgeName={count ? feedBadgeName(count.decide, count.overdue) : undefined}
      forceActive={isWorkPath(location.pathname)}
      expanded={expanded}
    />
  );
}

// Collapsed (the rail everywhere at `md` and up, and on phones while the
// drawer is closed — not that it's ever visible closed): a 44px square,
// icon only, the name in a pill on hover (`useHoverLabel`). Expanded (the
// open phone drawer, spec 2026-10-06 round 2: a phone has no hover, so an
// icon alone names nothing) — a full-width row, icon then its name as
// visible text, same label string the hover pill would have shown. `md:`
// collapses it back even if `expanded` were ever true there (it never is:
// DashboardLayout only opens the drawer below `md`), the same belt-and-
// suspenders the scrim and Close button already use.
const NAV_ITEM_COLLAPSED = 'relative w-11 h-11 shrink-0 flex items-center justify-center rounded-xl transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const NAV_ITEM_EXPANDED = 'relative w-full min-h-11 shrink-0 flex items-center gap-3 px-3 rounded-xl transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:w-11 md:h-11 md:justify-center md:gap-0 md:px-0';
const NAV_ITEM_ACTIVE = 'bg-[var(--rv-sidebar-active-bg)] border border-[var(--rv-sidebar-active-border)] shadow-xs text-ink';
const NAV_ITEM_INACTIVE = 'border border-transparent text-ink-muted hover:text-ink hover:bg-subtle';

function NavItem({
  icon,
  to,
  label,
  isActiveOverride = false,
  badge,
  badgeNoun = 'waiting',
  badgeName,
  end = false,
  forceActive = false,
  expanded = false,
}: {
  icon: React.ReactNode;
  to: string;
  label: string;
  isActiveOverride?: boolean;
  badge?: number;
  /** The word after the badge's count in the link's name ("Brain, 3 waiting", "Work, 2 overdue"). */
  badgeNoun?: string;
  /** The words after the label when the badge shows, in place of
   *  "<badge> <badgeNoun>" (Work: "3 to decide, 1 overdue"). */
  badgeName?: string;
  end?: boolean;
  /** Final review minor #6: a route the item lights for but never itself
   *  resolves to (e.g. a link whose `to` points elsewhere). OR'd into the
   *  same active check as the match computed from `to`/`end` below, so it
   *  reaches `aria-current` too, not only the active class. */
  forceActive?: boolean;
  /** The open phone drawer (spec 2026-10-06, round 2): show the name as
   *  visible text beside the icon instead of only on hover. */
  expanded?: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const hover = useHoverLabel(ref, label);
  const location = useLocation();
  // I2: the count belongs in the link's own accessible name. An
  // `aria-label` on the link overrides its text content, and one on the
  // badge's `<span>` is never read (a generic element's `aria-label` isn't
  // exposed), so without this a screen reader announced "Waiting on you,
  // link" with no count at all.
  const name = badge !== undefined && badge > 0 ? `${label}, ${badgeName || `${badge} ${badgeNoun}`}` : label;
  const content = (
    <>
      <span className="relative shrink-0 [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true">
        {icon}
        {badge !== undefined && badge > 0 ? (
          <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-warning text-on-accent font-mono-brand text-[11px] font-bold leading-4 text-center">
            {badge}
          </span>
        ) : null}
      </span>
      {expanded && (
        <span className="md:hidden min-w-0 flex-1 truncate text-[13px] font-medium">{label}</span>
      )}
    </>
  );
  // A single `Link`, always — never a `NavLink`/`Link` switch keyed on
  // `forceActive`. `forceActive` flips true/false across a route change
  // (BrainNavItem: a Brain route vs. not), and switching element types on
  // that flip tears the old `<a>` down and builds a new one — an M9 test
  // holding a ref across the navigation caught exactly that, since the
  // stale node's badge could never update again. Matching `to`/`end` the
  // same way `NavLink` does internally keeps one stable host element
  // across every route change instead.
  const isActive = (() => {
    const pathname = location.pathname.toLowerCase();
    const toPath = to.toLowerCase();
    const endSlash = toPath !== '/' && toPath.endsWith('/') ? toPath.length - 1 : toPath.length;
    return pathname === toPath || (!end && pathname.startsWith(toPath) && pathname.charAt(endSlash) === '/');
  })();
  // Fix wave item 10: `aria-current` says this route *is* the page, so it
  // comes from `isActive`/`forceActive` only, not `isActiveOverride` — an
  // item highlighted for being in a section (Organizations on its board or
  // a detail page, neither of which `to` resolves to) stays highlighted,
  // but isn't `aria-current`.
  const current = isActive || forceActive;
  const active = current || isActiveOverride;
  return (
    <>
      <Link
        ref={ref}
        {...hover.handlers}
        to={to}
        aria-label={name}
        aria-current={current ? 'page' : undefined}
        className={`${expanded ? NAV_ITEM_EXPANDED : NAV_ITEM_COLLAPSED} ${active ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
      >
        {content}
      </Link>
      {hover.node}
    </>
  );
}
