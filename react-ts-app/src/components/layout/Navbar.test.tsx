import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import customersReducer, { type Contact } from '../../features/customers/customersSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import type { Notification } from '../../features/notifications/types';
import * as notificationApi from '../../features/notifications/notificationApi';
import { stubWork } from '../../features/work/testWork';
import { Navbar } from './Navbar';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { openedHere } from '../work/useTaskLink';

// The bell dropdown calls the real API on click (optimistic local update +
// a real sync call, see Navbar.tsx's own handleNotificationClick/
// handleMarkAllRead) — mocked here the same way pages elsewhere in this
// suite mock their own API modules, so these tests exercise the real
// dispatch/navigate wiring without a real network call.
vi.mock('../../features/notifications/notificationApi');

const mockUser = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice Admin',
  avatar: 'https://i.pravatar.cc/150?u=alice@acme.io',
  role: 'admin' as const,
  role_id: 1,
  role_name: 'Admin',
  permissions: ALL_CAPABILITIES,
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional' },
  is_active: true,
};

// Minimal but real shape, matching revenact-backend's CustomerSerializer —
// see customersSlice.test.ts / docs/API_CONTRACTS.md -> customers.
const globex = {
  id: 10,
  name: 'Globex Corp',
  address: '',
  domain: 'globex.example',
  industry: '',
  email: '',
  phone: '',
  owner: null,
  created_by: null,
  modified_by: null,
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  lifecycle_stage: 'onboarding' as const,
  health_score: '5.0',
  health_category: 'average' as const,
  pulse: [],
  ai_pulse_score: '' as const,
  health_score_is_overridden: false,
  csat_breakdown: { responses: 0, bands: [] },
  health_breakdown: [],
  ai_pulse_reason: '',
  nps_score: null,
  csat_score: null,
  joined_date: null,
  renewal_date: null,
  contract_start_date: null,
  contract_end_date: null,
  currency: 'USD' as const,
  currency_display: 'US Dollar ($)',
  arr_billed_at_account: '0.00',
  arr_billed_at_hq: '0.00',
  implementation_fee: '0.00',
  total_contract_value: '0.00',
  total_forecasted_renewal_revenue: '0.00',
  primary_product: null,
  primary_product_name: '',
  additional_products_count: null,
  top_source_channel: '',
  total_contracted_seats: null,
  total_active_seats: null,
  seat_utilization_percentage: null,
  total_hires: null,
  scope_web_app: '',
  ces_percentage: null,
  churn_date: null,
  churn_reason: '' as const,
  churn_reason_display: '',
  churn_comment: '',
  is_archived: false,
};

/** Stands in for /segments/:id, saying where the bell sent it — and, for the
 *  task-panel route, whether the push carried the same `OPENED_HERE` history
 *  state an in-app task link stamps (so TaskPanelHost's Close can step back
 *  over it instead of leaving a dead Back entry). */
function SegmentMarker() {
  const location = useLocation();
  return (
    <p data-testid="segment-marker">
      {`${location.pathname}${location.search}`}
      {openedHere(location.state) ? ' (opened-here)' : ''}
    </p>
  );
}

function renderNavbar(
  initialRoute: string | { pathname: string; state?: unknown } = '/dashboard',
  selectedCustomer: typeof globex | null = null,
  selectedContact: Contact | null = null,
  notifications: Notification[] = [],
  setSlot: (el: HTMLElement | null) => void = () => {},
  user: typeof mockUser = mockUser,
  drawer: { isMenuOpen?: boolean; onOpenMenu?: () => void } = {},
) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      customers: customersReducer,
      notifications: notificationsReducer,
    },
    preloadedState: {
      notifications: { items: notifications },
      auth: {
        user,
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
      customers: {
        customers: [],
        count: 0,
        totalCount: 0,
        next: null,
        previous: null,
        isLoading: false,
        error: null,
        renewals: [],
        renewalsCount: 0,
        renewalsLoading: false,
        renewalsError: null,
        stats: null,
        statsLoading: false,
        statsError: null,
        selectedCustomer,
        selectedCustomerLoading: false,
        selectedCustomerError: null,
        accountsForCustomer: [],
        accountsLoading: false,
        accountsError: null,
        accountsCustomerId: null,
        allAccounts: [],
        allAccountsCount: 0,
        allAccountsNext: null,
        allAccountsPrevious: null,
        allAccountsLoading: false,
        allAccountsError: null,
        accountStats: null,
        accountStatsLoading: false,
        accountStatsError: null,
        activities: [],
        activitiesLoading: false,
        activitiesError: null,
        emails: [],
        emailsLoading: false,
        emailsError: null,
        tasks: [],
        tasksLoading: false,
        tasksError: null,
        notes: [],
        notesLoading: false,
        notesError: null,
        headlines: [],
        headlinesLoading: false,
        headlinesError: null,
        headlinesGenerating: false,
        headlinesGenerateError: null,
        tickets: [],
        ticketsLoading: false,
        ticketsError: null,
        calendarEvents: [],
        calendarEventsLoading: false,
        calendarEventsError: null,
        contacts: [],
        contactsLoading: false,
        contactsError: null,
        contactsFor: null,
        allContacts: [],
        allContactsCount: 0,
        allContactsNext: null,
        allContactsPrevious: null,
        allContactsLoading: false,
        allContactsError: null,
        allContactsSummary: null,
        allContactsLoadingMore: false,
        allContactsMoreError: null,
        selectedContact,
        selectedContactLoading: false,
        selectedContactError: null,
        selectedContactHistory: null,
        selectedContactHistoryLoading: false,
        selectedContactHistoryError: null,
        opportunities: [],
        opportunitiesLoading: false,
        opportunitiesError: null,
        risks: [],
        risksLoading: false,
        risksError: null,
        pipelineOpportunities: [],
        pipelineOpportunitiesLoading: false,
        pipelineOpportunitiesError: null,
        pipelineOpportunitiesFor: null,
        pipelineRisks: [],
        pipelineRisksLoading: false,
        pipelineRisksError: null,
        pipelineRisksFor: null,
        entitySurveys: [],
        entitySurveysLoading: false,
        entitySurveysError: null,
        surveys: [],
        surveysLoading: false,
        surveysError: null,
      },
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <NavActionsSlotContext.Provider value={{ slot: null, setSlot }}>
          <Navbar isMenuOpen={drawer.isMenuOpen} onOpenMenu={drawer.onOpenMenu} />
        </NavActionsSlotContext.Provider>
        <Routes>
          <Route path="/dashboard" element={<div>Dashboard Marker</div>} />
          <Route path="/organizations/list" element={<div>Organizations Marker</div>} />
          <Route path="/organizations/board" element={<div>Organizations Marker</div>} />
          <Route path="/users" element={<div>Users Marker</div>} />
          <Route path="/profile" element={<div>Profile Marker</div>} />
          <Route path="/login" element={<div>Login Marker</div>} />
          <Route path="/organizations/:id" element={<div>Details Marker</div>} />
          <Route path="/accounts/list" element={<div>Accounts Marker</div>} />
          <Route path="/accounts/:id" element={<div>Account Details Marker</div>} />
          <Route path="/contacts/:id" element={<div>Contact Details Marker</div>} />
          <Route path="/segments/:id" element={<SegmentMarker />} />
          <Route path="/scenarios/rules/:id" element={<SegmentMarker />} />
          <Route path="/brain/review" element={<SegmentMarker />} />
          <Route path="/work/today" element={<SegmentMarker />} />
          <Route path="/work/recommended" element={<SegmentMarker />} />
          <Route path="/work/mine" element={<SegmentMarker />} />
          <Route path="/work" element={<SegmentMarker />} />
          <Route path="/communications" element={<SegmentMarker />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('Navbar account menu', () => {
  // Off the dashboard: the dashboard's top bar has no avatar (the sidebar's does the job).
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('is closed by default', () => {
    renderNavbar('/users');
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('opens on avatar click and shows the real logged-in user', async () => {
    const user = userEvent.setup();
    renderNavbar('/users');

    await user.click(screen.getByAltText('Alice Admin'));

    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('alice@acme.io')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('navigates to /profile and closes the menu', async () => {
    const user = userEvent.setup();
    renderNavbar('/users');

    await user.click(screen.getByAltText('Alice Admin'));
    await user.click(screen.getByText('My Profile'));

    expect(await screen.findByText('Profile Marker')).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('signs out and redirects to /login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 205, json: async () => null })
    );
    const user = userEvent.setup();
    renderNavbar('/users');

    await user.click(screen.getByAltText('Alice Admin'));
    await user.click(screen.getByText('Sign out'));

    expect(await screen.findByText('Login Marker')).toBeInTheDocument();
  });

  it('falls back to an initials avatar with no third-party (pravatar) image request when the user has no avatar', async () => {
    const user = userEvent.setup();
    renderNavbar('/users', null, null, [], () => {}, { ...mockUser, avatar: '' });

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();

    await user.click(screen.getByText('A'));
    expect(screen.getByText('My Profile')).toBeInTheDocument();
  });

  it('closes when clicking outside the menu', async () => {
    const user = userEvent.setup();
    renderNavbar('/users');

    await user.click(screen.getByAltText('Alice Admin'));
    expect(screen.getByText('My Profile')).toBeInTheDocument();

    await user.click(screen.getByText('Users Marker'));

    await waitFor(() => expect(screen.queryByText('My Profile')).not.toBeInTheDocument());
  });
});

describe('Navbar on the routes whose pages title themselves (PageHeader)', () => {
  it.each(['/organizations/list', '/organizations/board', '/organizations/10', '/accounts/list', '/accounts/board', '/accounts/17', '/accounts/not-a-number', '/contacts', '/contacts/11', '/contacts/not-a-number', '/organizations/list/', '/organizations/abc', '/organizations/7/', '/contacts/1/', '/pipelines/list', '/pipelines/board', '/brain', '/brain/graph', '/brain/requests', '/work/today', '/work/team', '/communications',
'/segments', '/segments/new', '/segments/7', '/segments/7/edit', '/segments/7/survey', '/segments/7/rule', '/segments/abc',
'/surveys', '/surveys/new', '/surveys/3', '/surveys/3/edit', '/surveys/abc',
'/scenarios', '/scenarios/rules/new', '/scenarios/rules/5', '/scenarios/rules/5/edit', '/scenarios/rules/abc',
'/projects', '/projects/new', '/projects/41', '/projects/templates', '/projects/templates/new', '/projects/templates/10/edit',
'/campaigns', '/campaigns/new', '/campaigns/11', '/campaigns/11/edit', '/campaigns/abc',
'/canvas', '/canvas/301', '/canvas/abc',
'/segments/7/', '/surveys/3/', '/scenarios/rules/5/', '/projects/', '/projects/41/', '/projects/templates/', '/projects/templates/10/edit/', '/projects/templates/abc/edit', '/campaigns/11/', '/canvas/301/',
])(
    'on %s draws the framed bar with an empty title slot, the actions slot and no avatar',
    (url) => {
      renderNavbar(url, null, null, [], vi.fn());
      const header = document.querySelector('header')!;
      expect(header).toHaveClass('h-16', 'max-sm:flex-wrap');
      expect(header).toHaveAttribute('data-page-header');
      const titleSlot = header.querySelector('[data-nav-title-slot]')!;
      expect(titleSlot).toBeEmptyDOMElement();
      expect(titleSlot).toHaveClass('max-sm:contents');
      expect(header.querySelector('[data-nav-actions-slot]')).not.toBeNull();
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
      expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
    },
  );
});

describe('Navbar off the plans routes (final fix wave item 15)', () => {
  it.each(['/projects/41/x', '/projects/templates/10', '/projects/41/edit', '/projects/templates/10/edit/x'])('does not frame %s, which no plans route matches', (url) => {
    renderNavbar(url, null, null, [], vi.fn());
    expect(document.querySelector('header')).not.toHaveAttribute('data-page-header');
  });
});

describe('Navbar on the legacy canvas builder (rules spec 2026-10-04 §2)', () => {
  it.each(['/scenarios/create', '/scenarios/12'])('is not drawn by DashboardLayout on %s, so it has no title slot to offer', (url) => {
    renderNavbar(url);
    expect(document.querySelector('[data-nav-title-slot]')).toBeNull();
  });
});

const unreadInvite: Notification = {
  id: 1,
  kind: 'copilot_invite',
  message: 'Carl invited you to a live Copilot session',
  link: '/organizations/10',
  actor: { id: 2, name: 'Carl' },
  is_read: false,
  created_at: '2026-09-06T09:00:00Z',
};

const readAssignment: Notification = {
  id: 2,
  kind: 'customer_assigned',
  message: 'Carl assigned you the organization Globex Corp',
  link: '/organizations/10',
  actor: { id: 2, name: 'Carl' },
  is_read: true,
  created_at: '2026-09-05T09:00:00Z',
};

// Backend PR #84: the nightly step's alert to a segment's owner.
const segmentAlert: Notification = {
  id: 3,
  kind: 'segment_changes',
  message: 'Renewal risk: 3 entered, 1 left',
  link: '/segments/7?tab=changes',
  actor: null,
  is_read: false,
  created_at: '2026-10-03T06:00:00Z',
};

// Rules backend Decisions 11 and 21: a night's digest, linked to the night
// for someone who may read the rule, and the owner's review notice.
const ruleDigest: Notification = {
  id: 4,
  kind: 'rule_fired',
  message: 'Renewal watch: Globex, Initech and Pizza Hut fell below 60',
  link: '/scenarios/rules/5?run=9',
  actor: null,
  is_read: false,
  created_at: '2026-10-04T02:00:06Z',
};
const ruleReview: Notification = {
  id: 5,
  kind: 'rule_review',
  message: 'A survey from your rules is waiting for your review.',
  link: '/brain/review',
  actor: null,
  is_read: false,
  created_at: '2026-10-04T02:00:07Z',
};

// Plans spec §1.7: a plan started for its owner, and tasks given to someone.
const planStarted: Notification = {
  id: 6,
  kind: 'plan_started',
  message: 'A rule started Save plan · Pizza EMEA for you',
  link: '/projects/47',
  actor: null,
  is_read: false,
  created_at: '2026-10-04T02:00:08Z',
};
const planTasks: Notification = { ...planStarted, id: 7, kind: 'plan_task_assigned', message: 'Alice gave you 3 tasks in QBR · Pizza Hut', link: '/projects/43' };

// Work spec §1.3: a task given to someone, opening the task panel.
const taskAssigned: Notification = {
  ...planStarted,
  id: 8,
  kind: 'task_assigned',
  message: 'Mona Manager assigned you “Prep the QBR” on Pizza Hut.',
  link: '/work/today?task=41',
  actor: { id: 2, name: 'Mona Manager' },
};

// Work spec §2.2: the daily notice of recommendations waiting, opening Recommended.
const recsWaiting: Notification = {
  ...planStarted,
  id: 9,
  kind: 'recommendations_waiting',
  message: '3 tasks recommended for your team.',
  link: '/work/recommended',
  actor: null,
};

// Work spec §3.2: an overdue nudge and an escalation, each opening the task panel.
const taskOverdue: Notification = {
  ...planStarted,
  id: 10,
  kind: 'task_overdue',
  message: '“Call Pizza Hut” on Pizza Hut is 2 days overdue.',
  link: '/work/today?task=41',
  actor: null,
};
const taskEscalated: Notification = {
  ...planStarted,
  id: 11,
  kind: 'task_escalated',
  message: '“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days overdue.',
  link: '/work/today?task=41',
  actor: null,
};
// Two-way Gmail D2 §5: a change that did not reach Gmail, opening its conversation.
const mailFailed: Notification = {
  ...planStarted,
  id: 12,
  kind: 'mail_action_failed',
  message: "Couldn't archive in Gmail: the message no longer exists.",
  link: '/communications?source=mailbox:google&message=9012',
  actor: null,
};

// Work in one place D2 §4: the new links, and the once-a-day AI proposal notice.
const taskOnMyWork: Notification = { ...taskAssigned, id: 13, link: '/work/mine?task=46' };
const suggestionsWaiting: Notification = { ...recsWaiting, id: 14, link: '/work/mine?kind=suggestion' };
const proposalWaiting: Notification = {
  ...planStarted,
  id: 15,
  kind: 'agent_proposal_waiting',
  message: 'Bundles are waiting for your decision.',
  link: '/work?queue=mine&kind=bundle',
  actor: null,
};

describe('Navbar notification bell', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(notificationApi.markNotificationRead).mockReset().mockResolvedValue(readAssignment);
    vi.mocked(notificationApi.markAllNotificationsRead)
      .mockReset()
      .mockResolvedValue({ detail: 'ok' });
  });

  it('is closed by default and shows no unread badge with an empty list', () => {
    renderNavbar();

    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark all as read')).not.toBeInTheDocument();
  });

  it('shows a real unread count badge for unread notifications only', () => {
    renderNavbar('/dashboard', null, null, [unreadInvite, readAssignment]);

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens on click and lists real notifications, newest state first as given', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [unreadInvite, readAssignment]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Carl invited you to a live Copilot session')).toBeInTheDocument();
    expect(screen.getByText('Carl assigned you the organization Globex Corp')).toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, []);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
    expect(screen.queryByText('Mark all as read')).not.toBeInTheDocument();
  });

  it('clicking an unread notification marks it read and navigates to its real link', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [unreadInvite]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Carl invited you to a live Copilot session'));

    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Details Marker')).toBeInTheDocument();
  });

  it('clicking an already-read notification navigates without re-marking it read', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [readAssignment]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Carl assigned you the organization Globex Corp'));

    expect(notificationApi.markNotificationRead).not.toHaveBeenCalled();
    expect(await screen.findByText('Details Marker')).toBeInTheDocument();
  });

  it('"Mark all as read" clears the unread badge and calls the real API', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [unreadInvite]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Mark all as read'));

    expect(notificationApi.markAllNotificationsRead).toHaveBeenCalled();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('lists a segment alert by its message and opens that segment on its Changes tab', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [segmentAlert]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Renewal risk: 3 entered, 1 left'));

    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(3);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/segments/7?tab=changes');
  });

  it("opens a rule's night from its digest, and the Review Queue from a rule review", async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [ruleDigest, ruleReview]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Renewal watch: Globex, Initech and Pizza Hut fell below 60'));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(4);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/scenarios/rules/5?run=9');

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('A survey from your rules is waiting for your review.'));
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/brain/review');
  });

  it('marks the two plan kinds with an icon, and no other kind', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [planStarted, planTasks, ruleReview]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="plan_started"]')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('[data-kind-icon="plan_task_assigned"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-kind-icon]')).toHaveLength(2);
  });

  it('opens the task panel from a task_assigned notification, with its icon, and steps back over it like an in-app task link', async () => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [taskAssigned]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="task_assigned"]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText('Mona Manager assigned you “Prep the QBR” on Pizza Hut.'));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(8);
    // Carries the same OPENED_HERE history state useTaskLink stamps, so
    // TaskPanelHost's Close does navigate(-1) instead of stripping ?task=
    // in place and leaving this push behind as a dead Back entry.
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/work/today?task=41 (opened-here)');
  });

  it('opens Recommended from a recommendations_waiting notification, with its icon, as an ordinary link', async () => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [recsWaiting]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="recommendations_waiting"]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText('3 tasks recommended for your team.'));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(9);
    const marker = await screen.findByTestId('segment-marker');
    expect(marker).toHaveTextContent('/work/recommended');
    expect(marker).not.toHaveTextContent('opened-here');
  });

  it.each([
    ['task_overdue', taskOverdue, 10],
    ['task_escalated', taskEscalated, 11],
  ])('opens the task panel from a %s notification, with its icon, like a task_assigned', async (_kind, notification, id) => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [notification]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector(`[data-kind-icon="${notification.kind}"]`)).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText(notification.message));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(id);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/work/today?task=41 (opened-here)');
  });

  it('opens a task notice on My work with the panel’s history state', async () => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [taskOnMyWork]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText(taskOnMyWork.message));
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/work/mine?task=46 (opened-here)');
  });

  it('follows a new-suggestions notice to My work’s Suggested chip', async () => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [suggestionsWaiting]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText(suggestionsWaiting.message));
    const marker = await screen.findByTestId('segment-marker');
    expect(marker).toHaveTextContent('/work/mine?kind=suggestion');
    expect(marker).not.toHaveTextContent('opened-here');
  });

  it('shows a Bundles waiting notice with its icon and opens the Bundles chip', async () => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [proposalWaiting]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="agent_proposal_waiting"]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText('Bundles are waiting for your decision.'));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(15);
    const marker = await screen.findByTestId('segment-marker');
    expect(marker).toHaveTextContent('/work?queue=mine&kind=bundle');
    expect(marker).not.toHaveTextContent('opened-here');
  });

  it('opens the conversation from a mail_action_failed notification, with its icon', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [mailFailed]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="mail_action_failed"]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText(mailFailed.message));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(12);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/communications?source=mailbox:google&message=9012');
  });

  it('navigates a non-task link with no history state', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [segmentAlert]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Renewal risk: 3 entered, 1 left'));
    const marker = await screen.findByTestId('segment-marker');
    expect(marker).toHaveTextContent('/segments/7?tab=changes');
    expect(marker).not.toHaveTextContent('opened-here');
  });
});

describe('Navbar dashboard area tabs', () => {
  it('carries only the shared filters into every area link', () => {
    // owner/lifecycle/customer mean the same thing in every area; a period
    // key like `days` belongs to one view and must not leak into another.
    renderNavbar('/dashboard/health/usage?owner=7&lifecycle=pilot&customer=3&days=30');
    const nav = screen.getByRole('navigation', { name: 'Dashboard areas' });
    for (const name of ['Overview', 'Revenue', 'Health', 'Support']) {
      const href = within(nav).getByRole('link', { name }).getAttribute('href')!;
      const params = new URLSearchParams(href.split('?')[1] ?? '');
      expect(params.get('owner')).toBe('7');
      expect(params.get('lifecycle')).toBe('pilot');
      expect(params.get('customer')).toBe('3');
      expect(params.has('days')).toBe(false);
    }
  });

  it('links to the bare area when no shared filter is set', () => {
    renderNavbar('/dashboard/health/usage?days=30');
    const nav = screen.getByRole('navigation', { name: 'Dashboard areas' });
    expect(within(nav).getByRole('link', { name: 'Revenue' })).toHaveAttribute('href', '/dashboard/revenue');
  });

  it('shows keyboard focus on the area tabs', () => {
    renderNavbar('/dashboard/health/usage');
    const nav = screen.getByRole('navigation', { name: 'Dashboard areas' });
    expect(within(nav).getByRole('link', { name: 'Revenue' })).toHaveClass(
      'focus-visible:outline',
      'focus-visible:outline-2',
      'focus-visible:outline-accent',
    );
  });
});

describe('Navbar actions on the dashboard', () => {
  // The four decorative icons do nothing; the dashboard puts its Ask
  // controls there instead, through a slot it portals into.
  const DECORATIVE = 'svg.lucide-search, svg.lucide-circle-plus, svg.lucide-circle-question-mark, svg.lucide-message-square';

  it('drops the decorative icons and renders the actions slot on /dashboard/*', () => {
    const setSlot = vi.fn();
    renderNavbar('/dashboard/overview', null, null, [], setSlot);
    expect(document.querySelectorAll(DECORATIVE)).toHaveLength(0);
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  // The dashboard's top bar is Communications' header: transparent, h-16,
  // px-4, the pill then the bell on the right, no avatar (the sidebar has it).
  it('is shaped like Communications\' header on /dashboard/*, with no avatar', () => {
    renderNavbar('/dashboard/overview');
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    for (const cls of ['bg-surface', 'shadow-sm', 'px-6', 'h-[64px]']) expect(header).not.toHaveClass(cls);
    // Its hairline is transparent until the content scrolls (UI foundations spec §6.1).
    expect(header).toHaveClass('border-transparent', 'data-[scrolled]:border-line-subtle');
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Dashboard areas' })).toBeInTheDocument();
    // The pill slot comes before the bell.
    const bell = screen.getByRole('button', { name: 'Notifications' });
    const slot = header!.querySelector('[data-nav-actions-slot]');
    expect(slot).not.toBeNull();
    expect(slot!.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the other pages as they were, with no slot (and, since fix 18, none of the dead icons)', () => {
    const setSlot = vi.fn();
    renderNavbar('/users', null, null, [], setSlot);
    expect(document.querySelectorAll(DECORATIVE)).toHaveLength(0);
    expect(setSlot).not.toHaveBeenCalledWith(expect.any(HTMLElement));
    // Overflow fix (review round 2): px-6 became px-3 sm:px-6 below `sm`.
    expect(document.querySelector('header')).toHaveClass('h-[64px]', 'border-b', 'bg-surface', 'shadow-sm', 'px-3', 'sm:px-6');
    expect(screen.getByAltText('Alice Admin')).toBeInTheDocument();
  });
});

describe('Navbar over a record\'s New plan (plans spec §2.2)', () => {
  // The record page under the modal draws its Back link into the title slot.
  it.each(['/organizations/7/plans/new', '/accounts/12/plans/new'])('keeps the record page\'s bar on %s', (url) => {
    renderNavbar(url);
    const header = document.querySelector('header')!;
    expect(header).toHaveClass('h-16', 'px-4');
    expect(header.querySelector('[data-nav-title-slot]')).not.toBeNull();
  });
});

describe('Navbar on Settings (UI foundations spec §6.1, Settings PR)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/settings/general', '/settings/data', '/settings/ai-usage', '/settings/people'])(
    'draws the framed bar with an empty title slot on %s, and no title of its own',
    (url) => {
      renderNavbar(url);
      const header = document.querySelector('header')!;
      expect(header).toHaveAttribute('data-page-header');
      expect(header).toHaveClass('h-16', 'px-4', 'border-transparent');
      expect(header.querySelector('[data-nav-title-slot]')).toBeEmptyDOMElement();
      expect(within(header).queryByRole('heading')).toBeNull();
      expect(within(header).queryByText('Settings')).toBeNull();
    },
  );

});

describe('Navbar phone menu button (phone shell spec 2026-10-06, option A)', () => {
  it('renders at the left edge, hidden at md and up, carries the drawer aria wiring, and opens it on click', async () => {
    const onOpenMenu = vi.fn();
    renderNavbar('/users', null, null, [], () => {}, mockUser, { isMenuOpen: false, onOpenMenu });

    const menuButton = screen.getByRole('button', { name: 'Open navigation' });
    expect(menuButton.className).toMatch(/\bmd:hidden\b/);
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-controls', 'phone-nav-drawer');

    await userEvent.click(menuButton);
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it('reflects an open drawer in aria-expanded', () => {
    renderNavbar('/users', null, null, [], () => {}, mockUser, { isMenuOpen: true });
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders on the framed bar too (an organization page), still at the left edge', () => {
    renderNavbar('/organizations/10', globex);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });
});

describe('Navbar touch targets on phones (phone shell spec 2026-10-06)', () => {
  it('gives the decorative icon buttons, the bell and the avatar a 44px target, 36px from sm', () => {
    renderNavbar('/users');
    for (const name of ['Notifications']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).toMatch(/\bmin-h-11\b/);
      expect(button.className).toMatch(/\bmin-w-11\b/);
      expect(button.className).toMatch(/\bsm:min-h-9\b/);
      expect(button.className).toMatch(/\bsm:min-w-9\b/);
    }
    const avatarButton = screen.getByAltText('Alice Admin').closest('button')!;
    expect(avatarButton.className).toMatch(/\bmin-h-11\b/);
    expect(avatarButton.className).toMatch(/\bsm:min-h-9\b/);
    // The avatar image itself stays 30px inside the larger button.
    expect(screen.getByAltText('Alice Admin').className).toMatch(/\bw-full\b/);
  });
});

describe('Navbar left wrapper height (review round 2, Critical)', () => {
  // Without h-full, the wrapper's height is indefinite (the header only
  // centers), so every h-full tab/nav below it collapses to its own content
  // height instead of the header's. Pins the fix on both a framed
  // settings page and a framed tabs page.
  it.each(['/settings/data', '/dashboard/overview', '/organizations/list'])(
    'keeps the left wrapper h-full on %s',
    (url) => {
      renderNavbar(url);
      const header = document.querySelector('header')!;
      expect(header.firstElementChild).toHaveClass('h-full');
    },
  );
});

describe('Navbar phone overflow fix (review round 2, Important 1 + 2)', () => {
  it.each(['/users', '/integrations'])('tightens the non-framed header padding below sm on %s', (url) => {
    renderNavbar(url);
    expect(document.querySelector('header')).toHaveClass('px-3', 'sm:px-6');
  });

  // UI broken-things fix 18: Search, Add, Help and Messages had no handler
  // and no accessible name. They are gone at every width; every button left
  // in the bar has a name.
  it.each(['/users', '/integrations', '/profile'])('shows no dead icon buttons on %s', (url) => {
    renderNavbar(url);
    const header = document.querySelector('header')!;
    for (const icon of ['svg.lucide-search', 'svg.lucide-circle-plus', 'svg.lucide-circle-question-mark', 'svg.lucide-message-square']) {
      expect(header.querySelector(icon)).toBeNull();
    }
    for (const button of within(header as HTMLElement).getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('truncates the default-branch title, so an arbitrary long route segment never forces horizontal overflow', () => {
    renderNavbar('/users');
    // The text itself is the raw path segment ("users"); `capitalize` is a
    // CSS text-transform, not a change to the accessible name.
    const heading = screen.getByRole('heading', { level: 1, name: 'users' });
    expect(heading).toHaveClass('truncate', 'min-w-0');
    expect(heading.parentElement).toHaveClass('min-w-0');
  });

  it('lets the left wrapper and its title row shrink (min-w-0), not force overflow', () => {
    renderNavbar('/integrations');
    const header = document.querySelector('header')!;
    expect(header.firstElementChild).toHaveClass('min-w-0');
  });
});

describe('Navbar on a phone (UI broken-things fix 1)', () => {
  // Below sm the tools no longer cover the tabs: the framed bar wraps, its
  // wrappers dissolve so the tab strip becomes the header's own last row,
  // full width, scrolling sideways with a fade at its right edge.
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ count: 0, results: [] }) })));
  });

  function expectPhoneRow(header: Element, nav: HTMLElement) {
    expect(header).toHaveClass('max-sm:flex-wrap', 'max-sm:h-auto');
    expect(nav).toHaveClass('max-sm:order-last', 'max-sm:basis-full', 'max-sm:overflow-x-auto');
    expect(nav.className).toMatch(/max-sm:\[mask-image:linear-gradient/);
    // Every wrapper between the header and the strip dissolves on a phone,
    // so the strip is a flex item of the header itself: the nearest
    // ancestor that does not dissolve is the header.
    expect(nav.parentElement!.closest(':not(.max-sm\\:contents)')).toBe(header);
    for (const link of within(nav).getAllByRole('link')) expect(link).toHaveClass('shrink-0', 'whitespace-nowrap');
  }

  it.each([
    ['/dashboard/overview', 'Dashboard areas'],
  ])('on %s the "%s" tabs get their own scrolling row', async (url, name) => {
    renderNavbar(url, null, null, [], vi.fn());
    const header = document.querySelector('header')!;
    const nav = await screen.findByRole('navigation', { name });
    expectPhoneRow(header, nav);
    // The tools stay on the first row, pushed right, and never shrink.
    const tools = within(header as HTMLElement).getByTestId('nav-tools');
    expect(tools).toHaveClass('ml-auto', 'shrink-0');
    expect(within(tools).getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  // Fix round 1: a framed page without tabs keeps the 64px bar on a phone,
  // and a long title truncates instead of wrapping the tools to a new row.
  it.each([
    ['/dashboard/overview', 'Dashboard'],
  ])('on %s keeps the bar 64px tall and truncates "%s"', (url, title) => {
    renderNavbar(url, null, null, [], vi.fn());
    const header = document.querySelector('header')!;
    expect(header).toHaveClass('h-16', 'max-sm:min-h-16');
    const heading = screen.getByRole('heading', { level: 1, name: title });
    expect(heading).toHaveClass('min-w-0', 'truncate');
    // Its own wrapper (on a page without tabs) may shrink too.
    const wrapper = heading.parentElement!;
    if (!wrapper.classList.contains('max-sm:contents')) expect(wrapper).toHaveClass('min-w-0');
  });

  // Fix 2: the drawer's scrim is z-30 (Sidebar.tsx). Nothing in the bar,
  // framed or not, may stack above it, or the tools stay undimmed.
  it.each(['/dashboard/overview', '/brain', '/users'])('stacks nothing in the bar above the drawer scrim on %s', async (url) => {
    renderNavbar(url, null, null, [], vi.fn());
    const header = document.querySelector('header')!;
    const zs = [header, ...header.querySelectorAll('*')].flatMap((el) =>
      [...String(el.getAttribute('class') ?? '').matchAll(/(?:^|\s)z-(\d+)/g)].map((m) => Number(m[1])),
    );
    // Popovers opened from the bar (z-50) are closed here; none render.
    expect(zs.every((z) => z < 30)).toBe(true);
  });

  it('leaves the unframed bar alone', () => {
    renderNavbar('/users');
    const header = document.querySelector('header')!;
    expect(header).not.toHaveClass('max-sm:flex-wrap');
    expect(header.querySelector('.max-sm\\:contents')).toBeNull();
  });
});
