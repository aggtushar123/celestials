import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Navbar } from '../components/layout/Navbar';
import { MenuButton } from '../components/layout/MenuButton';
import { TaskPanelHost } from '../components/work/TaskPanelHost';
import { useAppDispatch, useAppSelector } from '../hooks';
import { isBrainPath } from '../features/brain/brainTabs';
import { isWorkPath } from '../features/work/workTabs';
import { fetchNotifications } from '../features/notifications/notificationApi';
import { connectNotificationSocket } from '../features/notifications/notificationSocket';
import { taskChanged } from '../components/work/taskChanges';
import {
  notificationsReceived,
  notificationAdded,
} from '../features/notifications/notificationsSlice';
import { NavActionsSlotContext } from './navActionsSlot';

export function DashboardLayout() {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  // Only the canvas builder (/scenarios/create, /scenarios/:id) wants the
  // full-canvas, no-Navbar treatment. /scenarios and the rule pages
  // (/scenarios/rules/…) are framed pages under the shared Navbar (rules
  // spec 2026-10-04 §2).
  const isScenarios = /^\/scenarios\/(?!rules(?:\/|$))[^/]+\/?$/.test(location.pathname);
  // /scenarios and the rule pages wear the Organizations frame, which gutters them.
  const isRules = /^\/scenarios(\/rules\/[^/]+(\/edit)?)?\/?$/.test(location.pathname);
  // The Copilot is the home page: nothing above it, nothing framing it.
  const isCopilot = location.pathname === '/copilot';
  const isCommunications = location.pathname.startsWith('/communications');
  const isSettings = location.pathname.startsWith('/settings');
  // The dashboard's frame pads itself the way Communications' body does.
  const isDashboard = location.pathname.startsWith('/dashboard');
  // The Organizations frame: the list, the board and an organization's page.
  // …/plans/new is the New plan modal over this page (plans spec §2.2).
  const isOrgView =
    location.pathname === '/organizations/list' ||
    location.pathname === '/organizations/board' ||
    /^\/organizations\/\d+(\/plans\/new)?$/.test(location.pathname);
  // The Contacts frame (spec 2026-09-28 §3): the list, and a person on it.
  // A trailing slash still reads as the same route (fix round 1, 2026-09-28).
  const isContacts = /^\/contacts(\/\d+)?\/?$/.test(location.pathname);
  // The Accounts list and board wear the Organizations frame too (accounts
  // spec 2026-09-29 §1), whose own px-4 pb-4 already gutters them — without
  // this <main> doubled the side padding and added a gap under the
  // transparent bar (fix round 1, 2026-09-30). An account's page wears the
  // organization page's bleed frame (§2.1), so it takes no padding either —
  // including a non-numeric id (fix round 2, 2026-09-30: a digits-only
  // regex left the not-found page double-guttered, matching Navbar.tsx's
  // own `isAccountDetail`).
  // …/plans/new is the New plan modal over this page (plans spec §2.2).
  const isAccountsView = /^\/accounts\/[^/]+(\/plans\/new)?\/?$/.test(location.pathname);
  // The Pipelines list and board wear the Organizations frame too (pipelines
  // spec 2026-09-30 §1), whose own px-4 pb-4 gutters them.
  const isPipelinesView = /^\/pipelines\/(list|board)\/?$/.test(location.pathname);
  // Segments wear the Organizations frame too (segments spec 2026-10-03 §3):
  // the list, a segment, its builder and a new one, guttered by the frame.
  // Survey these and Automate open their modals over the segment (/survey, /rule).
  const isSegments = /^\/segments(\/[^/]+(\/edit|\/survey|\/rule)?)?\/?$/.test(location.pathname);
  // Surveys wear the Organizations frame too (surveys spec 2026-10-03 §2),
  // guttered by the frame: without this <main> doubled the padding (UI
  // broken-things fix 11). The public answer page (/s/:token) is not here.
  const isSurveys = /^\/surveys(\/.*)?$/.test(location.pathname);
  // Plans wear the Organizations frame too (plans spec 2026-10-04 §2): the
  // list and board, a plan, the templates and every modal over them.
  const isProjects = /^\/projects(\/.*)?$/.test(location.pathname);
  // Campaigns wear the Organizations frame too (campaigns spec 2026-10-04 §2).
  const isCampaigns = /^\/campaigns(\/.*)?$/.test(location.pathname);
  // Canvas wears the Organizations frame too (canvas spec 2026-10-04 §2, Decision 4):
  // any id, so the not-found map keeps the frame's single gutter.
  const isCanvas = /^\/canvas(\/[^/]+)?\/?$/.test(location.pathname);
  // The Brain wears BrainFrame (brain UI spec 2026-10-06 §1.4), whose own
  // px-4 pb-6 gutters it: every /brain route, not a path that only begins
  // with the same letters (fix wave item 7: the one regex Navbar and
  // Sidebar already import, not a second copy of it here).
  const isBrain = isBrainPath(location.pathname);
  // Work wears WorkFrame, whose own px-4 pb-6 gutters it (Work spec §1.5).
  const isWork = isWorkPath(location.pathname);
  // The Navbar's actions slot (the Ask pill, a scope switch) and its title
  // slot (a page's PageHeader), which pages below portal into.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Undefined until the Navbar resolves it, so a PageHeader never draws in
  // place first and then remounts into the bar (one badge read, not two).
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null | undefined>(undefined);
  const slotValue = useMemo(() => ({ slot, setSlot, titleSlot, setTitleSlot }), [slot, titleSlot]);

  // The phone drawer (phone shell spec 2026-10-06, option A): closed by
  // default, opened by the menu button in the Navbar or in the slim bar
  // below, closed by a route change too — answering a question on another
  // page shouldn't leave the drawer open behind it. Lives here, not Redux:
  // the Sidebar it opens is this layout's own sibling. The same shape as
  // this file's own notification fetch below, and as CommunicationsPage's
  // / ScenariosList's / Profile's own route- or prop-driven resets: eslint
  // flags it (`react-hooks/set-state-in-effect`) but it's the sanctioned
  // pattern here, not the alternative — adjusting state during render via a
  // ref, which this same config's `react-hooks/refs` rule forbids outright.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Real notifications — fetched once and pushed live for as long as
  // this layout is mounted, i.e. the whole logged-in session (not
  // Navbar itself, which unmounts on /scenarios/* routes above and
  // would otherwise disconnect the socket every time a CSM opens the
  // scenario builder). A deliberate contrast with Multiplayer
  // Copilot's own session socket (features/copilotSessions/
  // sessionSocket.ts), which only connects while one specific
  // conversation is open.
  useEffect(() => {
    if (!accessToken) return;

    const loadNotifications = () =>
      fetchNotifications()
        .then((notifications) => dispatch(notificationsReceived(notifications)))
        .catch(() => {
          // A failed load just leaves the bell as it was — the next real
          // WebSocket push (or a manual refresh) still catches up, not
          // worth a blocking error banner for this.
        });
    loadNotifications();

    // The socket closes while the person is away (lib/presence.ts) and
    // reloads the bell when they return, for whatever arrived meanwhile.
    const socket = connectNotificationSocket(
      accessToken,
      (notification) => {
        dispatch(notificationAdded(notification));
        // A priority bundle (guided agent, 2026-10-18): Work, if open, reads its feed again at once.
        if (notification.kind === 'agent_bundle_priority') taskChanged();
      },
      { onResume: loadNotifications }
    );
    return () => socket.disconnect();
  }, [accessToken, dispatch]);

  return (
    <NavActionsSlotContext.Provider value={slotValue}>
      <div className="flex bg-surface h-[100dvh] w-full overflow-hidden text-ink font-sans">
        <Sidebar isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
        {/* Minor 1 (review round 2): while the dialog is open, the page
            behind it is inert too — Tab already stays inside the drawer
            (`trapTab`), but a screen reader's virtual cursor could still
            wander into the page without this. */}
        <div inert={isDrawerOpen} data-part="content-canvas" className="flex-1 flex flex-col relative w-full h-full overflow-hidden rv-canvas">
          {!isScenarios && !isCopilot ? (
            <Navbar isMenuOpen={isDrawerOpen} onOpenMenu={() => setIsDrawerOpen(true)} />
          ) : (
            <div className="md:hidden flex h-14 shrink-0 items-center px-2 border-b border-line-subtle bg-surface">
              <MenuButton isOpen={isDrawerOpen} onClick={() => setIsDrawerOpen(true)} />
            </div>
          )}
          <main className={`flex-1 overflow-hidden h-full flex flex-col ${(isScenarios || isSettings || isCopilot || isCommunications || isDashboard || isOrgView || isContacts || isAccountsView || isPipelinesView || isSegments || isSurveys || isRules || isProjects || isCampaigns || isCanvas || isBrain || isWork) ? 'p-0' : 'p-2 md:p-3 lg:p-4'}`}>
            <Outlet />
            {/* The task panel (Work spec §1.5): ?task=<id> opens it on any route. */}
            <TaskPanelHost />
          </main>
        </div>
      </div>
    </NavActionsSlotContext.Provider>
  );
}
