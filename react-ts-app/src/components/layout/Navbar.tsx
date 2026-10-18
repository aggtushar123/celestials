import { useState, useEffect, useRef, useContext } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { formatRelativeTime } from '../../features/customers/formatters';
import {
  Bell,
  User as UserIcon,
  LogOut,
  Check,
  Sliders,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { logout } from '../../features/auth/authSlice';
import {
  markNotificationRead,
  markAllNotificationsRead,
} from '../../features/notifications/notificationApi';
import { notificationRead, allRead } from '../../features/notifications/notificationsSlice';
import { AREAS } from '../../pages/dashboard/areas';
import { sharedSearch } from '../../pages/dashboard/shared/useDashboardFilters';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { PHONE_TABS, PHONE_UNWRAP } from './phoneHeader';
import { pipelinesViewOf } from '../../features/pipelines/askContext';
import { isBrainPath } from '../../features/brain/brainTabs';
import { isWorkPath } from '../../features/work/workTabs';
import { taskParam } from '../../features/work/taskParam';
import { NotificationKindIcon } from './NotificationKindIcon';
import { MenuButton } from './MenuButton';
import { UserAvatar } from './UserAvatar';
import { OPENED_HERE } from '../work/useTaskLink';

/** `isMenuOpen`/`onOpenMenu` wire the phone drawer's menu button (phone
 *  shell spec 2026-10-06): DashboardLayout owns the open state, since the
 *  Sidebar it opens is its sibling, not the Navbar's. Both default so every
 *  existing `<Navbar />` call site (the tests included) still renders. */
export function Navbar({ isMenuOpen = false, onOpenMenu = () => {} }: { isMenuOpen?: boolean; onOpenMenu?: () => void } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const notifications = useAppSelector((state) => state.notifications.items);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { setSlot, setTitleSlot } = useContext(NavActionsSlotContext);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleNotificationClick(notification: (typeof notifications)[number]) {
    setIsNotificationsOpen(false);
    if (!notification.is_read) {
      dispatch(notificationRead({ id: notification.id }));
      markNotificationRead(notification.id).catch(() => {
        // The optimistic local read-state stands even if this particular
        // sync call fails — a stale unread badge is the worst case, not
        // a broken UI; the next real fetch reconciles it either way.
      });
    }
    if (notification.link) {
      // A link into the task panel (?task=<id>) gets the same history state
      // useTaskLink stamps on an in-app task link: Close reads it to step
      // back over this entry (TaskPanelHost) instead of falling back to
      // stripping the param in place, which would leave this push behind as
      // a dead Back entry.
      const query = notification.link.split('?')[1] ?? '';
      if (taskParam(query) !== null) navigate(notification.link, { state: OPENED_HERE });
      else navigate(notification.link);
    }
  }

  function handleMarkAllRead() {
    dispatch(allRead());
    markAllNotificationsRead().catch(() => {});
  }


  // The Accounts list and board wear the Organizations frame (accounts spec
  // 2026-09-29 §1): the transparent bar, "Accounts", List | Board carrying
  // the query, the actions slot (where `AccountsAskLayout`'s rail portals
  // the Ask pill), no avatar.
  const isAccountsView = /^\/accounts\/(list|board)\/?$/.test(location.pathname);
  // An account's page wears the same frame (accounts spec 2026-09-29 §2.1):
  // the page draws its own name row from the URL id, so the bar only leads
  // back, as on an organization's page. A trailing slash is the same route.
  // Any single segment that isn't list/board is an account id to the route
  // (`/accounts/:id`) — including a non-numeric one, which the page itself
  // renders as "Account not found" still inside this frame (fix round 2,
  // 2026-09-30: a digits-only regex left that page double-guttered).
  // …/plans/new is the New plan modal over this page (plans spec §2.2).
  const isAccountDetail = /^\/accounts\/(?!list\/?$|board\/?$)[^/]+(\/plans\/new)?\/?$/.test(location.pathname);
  // Workspace settings (UI foundations spec §6.1, Settings PR): every page
  // under WorkspaceSettingsLayout, which draws "Settings" into this bar's
  // title slot once (as text: each page's SettingsFrame owns the h1).
  const isSettings = /^\/settings(\/|$)/.test(location.pathname);
  // Every Brain route wears the framed bar (brain UI spec 2026-10-06 §1.1):
  // BrainAskLayout draws "Brain" and the four tabs through PageHeader; the
  // bar keeps the actions slot (where each page's scope switch lands through
  // PageHeaderActions) and no avatar.
  const isBrain = isBrainPath(location.pathname);
  // Every Work route wears the framed bar (Work spec §1.5): WorkLayout draws
  // "Work" and its tabs through PageHeader; the bar keeps the actions slot
  // (where the scope switch lands through PageHeaderActions) and no avatar.
  const isWork = isWorkPath(location.pathname);
  // Communications wears the framed bar too (UI foundations spec §6.1): the
  // page draws its title, and its Copilot controls portal into the slot.
  const isCommunications = /^\/communications\/?$/.test(location.pathname);
  // The Pipelines list and board wear the Organizations frame (pipelines spec
  // 2026-09-30 §1): the transparent bar, where the page draws "Pipelines" and
  // List | Board carrying the query through PageHeader (Opportunities | Risks
  // leads the page's toolbar since the Ops PR), the actions slot (where
  // `PipelinesAskLayout`'s rail portals the Ask pill) and no avatar.
  const isPipelinesView = pipelinesViewOf(location.pathname) !== null;
  const isDashboard = location.pathname.startsWith('/dashboard');
  // The Organizations list and board wear the dashboard's frame (portfolio
  // spec §1, owner decisions 2026-09-26): the transparent top bar, the
  // actions slot (empty until Ask Revenact lands on Organizations), and no
  // avatar.
  const isOrgView = /^\/organizations\/(list|board)\/?$/.test(location.pathname);
  // An organization's page wears the same frame (organization page spec
  // §1.1): the page draws its own name row, so the bar only leads back.
  // …/plans/new is the New plan modal over this page (plans spec §2.2).
  // Any single segment that is not list/board, as on Accounts: a non-numeric
  // id is the page's own "not found", still in this frame. A trailing slash
  // is the same route.
  const isOrgDetail = /^\/organizations\/(?!list\/?$|board\/?$)[^/]+(\/plans\/new)?\/?$/.test(location.pathname);
  // Contacts wears the same frame (spec 2026-09-28 §3): the list and the
  // person open on it share one page, titled here; the page draws the rest.
  // A trailing slash still reads as the same route (fix round 1, 2026-09-28).
  // Any single segment, as on Accounts: a non-numeric id is the page's own
  // "not found", still in this frame.
  const isContacts = /^\/contacts(\/[^/]+)?\/?$/.test(location.pathname);
  // Segments wear the same frame (segments spec 2026-10-03 §3, plan Decision
  // 10): the list draws "Segments" through PageHeader; a segment, its builder
  // and a new one draw a Back link to the list.
  const isSegments = /^\/segments\/?$/.test(location.pathname);
  // Survey these opens the survey modal over the segment (/segments/:id/survey).
  // Automate opens the rule builder over the segment (/segments/:id/rule).
  const isSegmentPage = /^\/segments\/[^/]+(\/edit|\/survey|\/rule)?\/?$/.test(location.pathname);
  // Surveys wear the same frame (surveys spec 2026-10-03 §2): the tabs page
  // draws "Surveys" through PageHeader; a send, its edit modal and a new one
  // draw a Back link. Any id, so a missing send keeps the frame.
  const isSurveys = /^\/surveys\/?$/.test(location.pathname);
  const isSurveyPage = /^\/surveys\/[^/]+(\/edit)?\/?$/.test(location.pathname);
  // Scenarios wear the same frame (rules spec 2026-10-04 §2.1): the tabs page
  // draws "Scenarios" through PageHeader; a rule, its edit modal and a new one
  // draw a Back link. The canvas builder keeps no Navbar (DashboardLayout).
  const isScenarios = /^\/scenarios\/?$/.test(location.pathname);
  const isRulePage = /^\/scenarios\/rules\/[^/]+(\/edit)?\/?$/.test(location.pathname);
  // Plans wear the same frame (plans spec 2026-10-04 §2.1, Decision 2):
  // /projects draws "Project Management" through PageHeader; every other
  // plans page draws a Back link. Only the routed shapes (App.tsx): New
  // plan, the templates, a new or edited template (any id, as the route
  // takes it, so a missing one keeps the frame) and a plan.
  const isProjects = /^\/projects\/?$/.test(location.pathname);
  const isPlanPage = /^\/projects\/(new|templates(\/new|\/[^/]+\/edit)?|[^/]+)\/?$/.test(location.pathname);
  // Campaigns wear the same frame (campaigns spec 2026-10-04 §2, Decision 2):
  // the list draws "Campaigns" through PageHeader; a campaign, its editor and
  // a new one draw a Back link. Any id, so a missing campaign keeps the frame.
  const isCampaigns = /^\/campaigns\/?$/.test(location.pathname);
  const isCampaignPage = /^\/campaigns\/[^/]+(\/edit)?\/?$/.test(location.pathname);
  // Canvas wears the same frame (canvas spec 2026-10-04 §2, Decision 4): the
  // gallery draws "Canvas" through PageHeader; a map draws a Back link. Any
  // id, so a missing map keeps the frame.
  const isCanvas = /^\/canvas\/?$/.test(location.pathname);
  const isCanvasPage = /^\/canvas\/[^/]+\/?$/.test(location.pathname);
  // Impact (UI foundations spec §6.1, §9.2 row 3): each page draws its own
  // title or Back link, its tabs and its primary through PageHeader into
  // this bar's title slot. The legacy canvas builder (/scenarios/create,
  // /scenarios/:id) has no Navbar at all (DashboardLayout).
  const isImpact =
    isSegments || isSegmentPage || isSurveys || isSurveyPage || isScenarios || isRulePage || isProjects || isPlanPage || isCampaigns || isCampaignPage || isCanvas || isCanvasPage;
  // Records, Ops, Impact and Settings (UI foundations spec §6.1): each page, or its
  // route layout (Brain, Work), draws its own title, Back link and tabs
  // through PageHeader into this bar's title slot.
  const titledByPage = isOrgView || isOrgDetail || isAccountsView || isAccountDetail || isContacts || isPipelinesView || isBrain || isWork || isCommunications || isImpact || isSettings;
  const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts || isAccountsView || isAccountDetail || isPipelinesView || isImpact || isBrain || isWork || isCommunications || isSettings;
  const dashboardSharedSearch = sharedSearch(location.search);


  return (
    // The dashboard's top bar is Communications' header, class for class:
    // transparent on the canvas, the Ask pill then the bell on the right, and
    // no avatar (the sidebar carries the account menu).
    <header
      data-page-header={isFramed ? '' : undefined}
      className={
        isFramed
          ? 'h-16 shrink-0 flex items-center gap-3 px-4 border-b border-transparent data-[scrolled]:border-line-subtle max-sm:h-auto max-sm:min-h-16 max-sm:flex-wrap max-sm:gap-y-0 max-sm:pt-2'
          : 'h-[64px] border-b border-line-subtle bg-surface flex items-center justify-between px-3 sm:px-6 shrink-0 z-20 transition-all duration-300 shadow-sm'
      }
    >
      {/* Critical fix (review round 2): this wrapper needs `h-full` too — the
          header only centers (`items-center`), so without it the wrapper's
          height is indefinite, and every `h-full` nav/tab below it (Dashboard
          areas, Organizations/Accounts/Pipelines tabs) collapses
          from 64px to its own content height, floating its border-b underline
          under the text instead of on the header's bottom edge. */}
      <div className={`flex h-full min-w-0 items-center gap-1 sm:gap-2 ${isFramed ? PHONE_UNWRAP : ''}`}>
        <MenuButton isOpen={isMenuOpen} onClick={onOpenMenu} />
      <div className={`flex items-center gap-8 h-full min-w-0 ${isFramed ? PHONE_UNWRAP : ''}`}>
        {titledByPage ? (
          <div ref={(el) => setTitleSlot?.(el ?? undefined)} data-nav-title-slot="" className={`flex h-full min-w-0 items-center gap-4 ${PHONE_UNWRAP}`} />
        ) : isDashboard ? (
          <div className={`flex items-center gap-4 h-full ${PHONE_UNWRAP}`}>
            <h1 className="min-w-0 truncate text-[15px] font-bold text-ink tracking-tight">Dashboard</h1>

            <nav aria-label="Dashboard areas" className={`flex items-center gap-4 h-full ${PHONE_TABS}`}>
              {[{ key: 'overview', label: 'Overview' }, ...AREAS].map((area) => (
                <NavLink
                  key={area.key}
                  // Only the shared book filters travel between areas.
                  to={{ pathname: `/dashboard/${area.key}`, search: dashboardSharedSearch }}
                  className={({ isActive }) =>
                    `h-full inline-flex shrink-0 items-center whitespace-nowrap text-[13px] font-semibold border-b-2 transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                      isActive ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                    }`
                  }
                >
                  {area.label}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 py-1.5 px-2 -ml-2 rounded-md">
            <h1 className="min-w-0 truncate text-[15px] font-bold text-ink tracking-tight capitalize">
               {location.pathname.split('/')[1] || 'Dashboard'}
            </h1>
          </div>
        )}
      </div>
      </div>

      <div data-testid="nav-tools" className={isFramed ? 'ml-auto flex shrink-0 items-center gap-3' : 'flex items-center gap-2 sm:gap-4'}>
        {/* Right side actions. The Copilot is the home page now, first in
            the sidebar; it no longer needs a button on every other page. */}
        <div className={isFramed ? 'flex items-center gap-3 text-ink-faint' : 'flex items-center gap-1 sm:gap-1.5 text-ink-faint ml-0 sm:ml-1'}>
          {/* The dashboard and the Organizations list and board put their
              Ask controls here (portaled by AskRail) in place of the
              decorative icons. */}
          {/* UI broken-things fix 18: the unframed bar's Search, Add, Help and
              Messages icons had no handler and no name, so they are gone;
              the framed bar keeps its actions slot. */}
          {isFramed ? <div ref={setSlot} data-nav-actions-slot="" className="flex items-center" /> : null}

          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => setIsNotificationsOpen((open) => !open)}
              aria-label="Notifications"
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 flex items-center justify-center hover:text-ink hover:bg-subtle rounded-lg transition-all border border-transparent hover:border-line-subtle"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
            </button>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-0.5 min-w-[15px] h-[15px] bg-accent text-on-accent flex items-center justify-center text-[11px] font-bold rounded-full px-0.5 border-2 border-surface shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}

            {isNotificationsOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-80 bg-surface border border-line rounded-xl shadow-xl overflow-hidden z-50">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line-subtle">
                  <span className="text-[13px] font-bold text-ink">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="flex min-h-11 items-center gap-1 text-[11px] font-semibold text-ink-faint hover:text-accent transition-colors"
                    >
                      <Check className="w-3 h-3" aria-hidden="true" />
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-[13px] text-ink-faint font-medium px-3.5 py-6 text-center">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full min-h-11 text-left flex items-start gap-2 px-3.5 py-2.5 border-b border-line-subtle last:border-b-0 transition-colors hover:bg-subtle ${
                          notification.is_read ? '' : 'bg-accent-dim/30'
                        }`}
                      >
                        {!notification.is_read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        )}
                        <NotificationKindIcon kind={notification.kind} />
                        <div className={`min-w-0 ${notification.is_read ? 'pl-3.5' : ''}`}>
                          <p className="text-[13px] text-ink font-medium leading-snug">
                            {notification.message}
                          </p>
                          <p className="text-[11px] text-ink-faint mt-0.5">
                            {formatRelativeTime(notification.created_at)}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User avatar + account menu (not on the dashboard; see the header) */}
        {isFramed ? null : (
        <div className="relative ml-0 sm:ml-1" ref={accountMenuRef}>
          <button
            onClick={() => setIsAccountMenuOpen((open) => !open)}
            className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 rounded-full flex items-center justify-center cursor-pointer select-none"
          >
            <span className="w-[30px] h-[30px] rounded-full bg-accent-dim flex items-center justify-center ring-2 ring-surface shadow-sm overflow-hidden">
              <UserAvatar name={user?.name} email={user?.email} avatarUrl={user?.avatar} className="w-full h-full object-cover" />
            </span>
          </button>

          {isAccountMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] w-56 bg-surface border border-line rounded-xl shadow-xl overflow-hidden z-50">
              <div className="flex items-center gap-3 p-3 border-b border-line-subtle">
                <UserAvatar name={user?.name} email={user?.email} avatarUrl={user?.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink truncate">{user?.name || 'User'}</div>
                  <div className="text-[11px] text-ink-muted truncate">{user?.email || 'My Workspace'}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  navigate('/settings/account');
                }}
                className="w-full min-h-11 flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-subtle transition-all cursor-pointer"
              >
                <Sliders className="w-[15px] h-[15px]" aria-hidden="true" />
                Settings
              </button>
              <button
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  navigate('/profile');
                }}
                className="w-full min-h-11 flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-subtle transition-all cursor-pointer"
              >
                <UserIcon className="w-[15px] h-[15px]" aria-hidden="true" />
                My Profile
              </button>
              <button
                onClick={() => {
                  setIsAccountMenuOpen(false);
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
        </div>
        )}
      </div>
    </header>
  );
}
