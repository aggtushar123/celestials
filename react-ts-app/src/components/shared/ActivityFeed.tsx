import { useEffect, useState } from 'react';
import { Search, Plus, Filter, Sparkles, Layout, FileText, Zap, Globe, MapPin, Mail, Phone, Briefcase } from 'lucide-react';
import React from 'react';
import {
  EmailsTab,
  EmailThreadPanel,
  TasksTab,
  NotesTab,
  TicketsTab,
  CalendarEventsTab,
  ActivitiesTab,
  AllActivityTab,
  CallSenseTab,
  FilesTab,
  HeadlinesTab,
  SlackTab,
  SurveysTab,
  SessionsTab,
} from '../organizations/activity';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { ComposeEmailModal } from './ComposeEmailModal';
import {
  fetchActivitiesForCustomer,
  fetchActivitiesForAccount,
  clearActivities,
  fetchEmailsForCustomer,
  fetchEmailsForAccount,
  clearEmails,
  fetchTasksForCustomer,
  fetchTasksForAccount,
  clearTasks,
  fetchNotesForCustomer,
  fetchNotesForAccount,
  createNote,
  createTask,
  clearNotes,
  fetchHeadlinesForCustomer,
  fetchHeadlinesForAccount,
  clearHeadlines,
  regenerateHeadlines,
  fetchTicketsForCustomer,
  fetchTicketsForAccount,
  clearTickets,
  fetchCalendarEventsForCustomer,
  fetchCalendarEventsForAccount,
  clearCalendarEvents,
  fetchSurveysForCustomer,
  fetchSurveysForAccount,
  clearSurveys,
  type Email,
} from '../../features/customers/customersSlice';

// ── Data sources ─────────────────────────────────────────────────────────────
// Activities/Emails/Tasks/Notes/Tickets/Calendar Events/Headlines are
// all wired to real backend models below, not this mock injection
// scheme (see fetchActivitiesFor*/fetchEmailsFor*/fetchTasksFor*/
// fetchNotesFor*/fetchTicketsFor*/fetchCalendarEventsFor*/
// fetchHeadlinesFor* above) — only Slack (and the numeric id it and
// CallSense need) still uses it.
import { ACCOUNT_ID_MAP } from '../organizations/accountActivityData';
import { useCustomerMeetings } from '../../features/calendar/useCustomerMeetings';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityFeedProps {
  entityId: number | string;
  entityType: 'organization' | 'account';
  /** The parent Customer id — needed to hit the nested
   * /customers/<customerId>/accounts/<accountId>/activities/ endpoint
   * when entityType is 'account'. Ignored for entityType 'organization'
   * (entityId already IS the customer id there). Omit it for an account
   * reached with no resolvable real id (a direct URL visit/refresh with
   * no navigation state, e.g. AccountDetails' own mock fallback) —
   * without a real customerId there's no real Activity data to fetch,
   * so the Activities tab just shows its empty state. */
  customerId?: number;
  /** Shown in Overview tab */
  overviewInfo?: {
    domain?: string;
    location?: string;
    email?: string;
    phone?: string;
    /** Free-text, hand-entered via Add/Edit Organization/Account — the
     * same field the backend's Copilot folds into its semantic company
     * matching once set (see revenact-backend's
     * services/copilot/retrieval.py). */
    industry?: string;
  };
  /** Tailwind class for the health dot in ActivitiesTab */
  healthColor?: string;
  /** Pre-selects one of FILTER_ITEMS on mount instead of the default
   * 'All'. Used to be fed from the standalone Surveys page's row-click,
   * which navigated here with `location.state.activityFilter:
   * 'Surveys'`; organizations/Details.tsx and accounts/Details.tsx no
   * longer read any navigation state (accounts spec 2026-09-29 §2, and
   * the org page before it), so nothing sets this prop today — left in
   * place for a later cleanup pass (plan decision 17). Any value passed
   * in falls through to the usual "coming soon" placeholder unless it
   * names an implemented filter. */
  initialFilter?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FEED_TABS = [
  { name: 'Activity Feed', icon: null },
  { name: 'Headlines', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { name: 'Overview', icon: <Layout className="w-3.5 h-3.5" /> },
  { name: 'Files', icon: <FileText className="w-3.5 h-3.5" /> },
  { name: 'CallSense', icon: <Zap className="w-3.5 h-3.5" /> },
];

const FILTER_ITEMS = [
  'All', 'Activities', 'Emails', 'Tasks', 'Notes', 'Tickets',
  'Calendar Events', 'Pulse', 'Conversations', 'Revenact Support',
  'Surveys', 'Sessions', 'Slack',
];

const IMPLEMENTED_FILTERS = ['All', 'Activities', 'Emails', 'Tasks', 'Notes', 'Tickets', 'Calendar Events', 'Surveys', 'Sessions', 'Slack'];

// ── Account id resolution ────────────────────────────────────────────────────
// Slack is still fully mock (SlackTab keeps its own SLACK_DATA
// locally) — it takes a resolved numeric id the same way the
// mock-swapped filters used to. CallSense and Files read real data.
// ACCOUNT_ID_MAP only knows the mock's own string ids (e.g.
// 'acc-1'), so a real account id falls back to the stub 101, same
// fallback those tabs' own mock content already keys off.
//
// Headlines no longer goes through here: it reads real, per-entity
// data off the same entityId/customerId every other wired tab uses.
// Routing it through this shim is what made every account render the
// same two hardcoded cards — every real account id collapsed onto
// the stub 101.

function resolveAccountId(accountId: string): number {
  return ACCOUNT_ID_MAP[accountId] ?? 101;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityFeed({
  entityId,
  entityType,
  customerId,
  overviewInfo,
  healthColor = 'bg-success',
  initialFilter,
}: ActivityFeedProps) {
  const [activeSubTab, setActiveSubTab] = useState('Activity Feed');
  const [filter, setFilter] = useState(initialFilter ?? 'All');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [composing, setComposing] = useState(false);
  const dispatch = useAppDispatch();
  // A real record we can email: an organisation by id, or an account with its parent id in hand.
  const canEmail = entityType === 'organization' ? Number.isFinite(Number(entityId)) : customerId !== undefined;
  const {
    activities,
    activitiesLoading,
    activitiesError,
    emails,
    emailsLoading,
    emailsError,
    tasks,
    tasksLoading,
    tasksError,
    notes,
    notesLoading,
    notesError,
    headlines,
    headlinesLoading,
    headlinesError,
    headlinesGenerating,
    headlinesGenerateError,
    tickets,
    ticketsLoading,
    ticketsError,
    calendarEvents,
    calendarEventsLoading,
    calendarEventsError,
    entitySurveys,
    entitySurveysLoading,
    entitySurveysError,
  } = useAppSelector((state) => state.customers);

  // Multiplayer Copilot sessions "about" this company (FR1.3) — real
  // data now (Phase 2a), but only whatever this browser has actually
  // fetched into the copilotSessions slice already (opened, polled, or
  // just made live) — there's no "list every session about company X"
  // endpoint, same limitation the slice's own docstring notes.
  const sessionsById = useAppSelector((state) => state.copilotSessions.byId);
  const numericEntityId = Number(entityId);
  const sessionsForThisEntity = Object.values(sessionsById).filter((s) =>
    entityType === 'organization' ? s.customer_id === numericEntityId : s.account_id === numericEntityId
  );

  // Resolve numeric ID for the still-mock Slack tab — see
  // resolveAccountId's own comment.
  let resolvedId: number;
  if (entityType === 'account') {
    resolvedId = resolveAccountId(String(entityId));
  } else {
    resolvedId = Number(entityId);
  }

  // Activities is wired to the real backend model, not the mock
  // injection above — org case always has a resolvable customer id
  // (entityId itself); account case only does when reached with a real
  // account (customerId set — see this component's own prop doc).
  // Re-fires whenever the entity being viewed changes, same as
  // fetchAccountsForCustomer's own effect in organizations/Details.tsx.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchActivitiesForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchActivitiesForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearActivities());
    }
  }, [dispatch, entityType, entityId, customerId]);

  // Emails is wired to the real backend model the same way Activities
  // is above — same resolvability rules, same clear-on-no-real-id
  // fallback.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchEmailsForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchEmailsForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearEmails());
    }
  }, [dispatch, entityType, entityId, customerId]);

  // Tasks is wired to the real backend model the same way
  // Activities/Emails are above — same resolvability rules, same
  // clear-on-no-real-id fallback.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchTasksForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchTasksForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearTasks());
    }
  }, [dispatch, entityType, entityId, customerId]);

  // Notes is wired to the real backend model the same way
  // Activities/Emails/Tasks are above — same resolvability rules, same
  // clear-on-no-real-id fallback.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchNotesForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchNotesForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearNotes());
    }
  }, [dispatch, entityType, entityId, customerId]);

  // Headlines is wired to the real backend model the same way
  // Activities/Emails/Tasks/Notes are above — same resolvability
  // rules, same clear-on-no-real-id fallback. Note this uses the real
  // `entityId`, not `resolvedId`: the tab used to take the shim's
  // stubbed 101 for every account, which is exactly why they all
  // showed the same cards.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchHeadlinesForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchHeadlinesForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearHeadlines());
    }
  }, [dispatch, entityType, entityId, customerId]);

  // The "Regenerate" button's action. Undefined — so the button isn't
  // offered at all — in the same no-resolvable-parent case the fetch
  // above falls back to clearing: there'd be nothing to generate
  // against, and the request could only 404.
  const canRegenerate = entityType === 'organization' || customerId !== undefined;
  const handleRegenerate = canRegenerate
    ? async () => {
        await dispatch(
          regenerateHeadlines(
            entityType === 'organization'
              ? { customerId: Number(entityId) }
              : { customerId: customerId as number, accountId: Number(entityId) }
          )
        );
      }
    : undefined;

  // Tickets is wired to the real backend model the same way
  // Activities/Emails/Tasks/Notes are above — same resolvability
  // rules, same clear-on-no-real-id fallback.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchTicketsForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchTicketsForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearTickets());
    }
  }, [dispatch, entityType, entityId, customerId]);

  // Calendar Events is wired to the real backend model the same way
  // Activities/Emails/Tasks/Notes/Tickets are above — same
  // resolvability rules, same clear-on-no-real-id fallback.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchCalendarEventsForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchCalendarEventsForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearCalendarEvents());
    }
  }, [dispatch, entityType, entityId, customerId]);

  // People's Google Calendar meetings with this customer (Calendar delivery 2).
  const meetings = useCustomerMeetings(
    entityType === 'organization' ? Number(entityId) : customerId,
    entityType === 'account' ? Number(entityId) : undefined,
  );

  // Surveys is wired to the real backend model the same way
  // Activities/Emails/Tasks/Notes/Tickets/Calendar Events are above —
  // same resolvability rules, same clear-on-no-real-id fallback.
  useEffect(() => {
    if (entityType === 'organization') {
      dispatch(fetchSurveysForCustomer(Number(entityId)));
    } else if (customerId !== undefined) {
      dispatch(fetchSurveysForAccount({ customerId, accountId: Number(entityId) }));
    } else {
      dispatch(clearSurveys());
    }
  }, [dispatch, entityType, entityId, customerId]);

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs: Activity Feed | Headlines | Overview | Files | CallSense */}
      <div className="px-4 pt-3 flex items-center justify-between border-b border-line-subtle flex-wrap shrink-0">
        <div className="flex gap-5">
          {FEED_TABS.map(tab => (
            <button
              key={tab.name}
              onClick={() => setActiveSubTab(tab.name)}
              className={`flex items-center gap-1.5 pb-2.5 text-[13px] font-semibold transition-all relative ${activeSubTab === tab.name ? 'text-accent' : 'text-ink-faint hover:text-ink-muted'
                }`}
            >
              {tab.icon && tab.icon}
              {tab.name}
              {activeSubTab === tab.name && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {activeSubTab === 'Activity Feed' ? (
          <>
            <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 relative bg-surface z-0">
              {/* Filter Toolbar */}
            <div className="p-4 flex flex-col gap-4 border-b border-line-subtle shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                  <input
                    type="text"
                    placeholder={`Search ${filter.toLowerCase()}...`}
                    className="w-full pl-9 pr-4 py-1.5 bg-surface border border-line rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-accent/20 placeholder:text-ink-faint"
                  />
                </div>
                <button className="flex items-center gap-2 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-bold transition-all shadow-sm">
                  <Plus className="w-4 h-4" />
                  Add Action
                </button>
                <button className="p-1.5 border border-line rounded-lg text-ink-faint hover:text-ink-muted hover:bg-subtle">
                  <Filter className="w-4 h-4" />
                </button>
              </div>

              {/* Activity type chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar whitespace-nowrap">
                {FILTER_ITEMS.map(item => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`px-3 py-1 rounded-full text-[12px] font-bold transition-all border ${filter === item
                      ? 'bg-accent-dim border-accent/30 text-accent'
                      : 'bg-surface border-transparent text-ink-muted hover:bg-subtle'
                      }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {filter === 'All' && (
                <AllActivityTab
                  activities={activities}
                  emails={emails}
                  tasks={tasks}
                  notes={notes}
                  tickets={tickets}
                  calendarEvents={calendarEvents}
                  surveys={entitySurveys}
                  isLoading={
                    activitiesLoading ||
                    emailsLoading ||
                    tasksLoading ||
                    notesLoading ||
                    ticketsLoading ||
                    calendarEventsLoading ||
                    entitySurveysLoading
                  }
                  errors={[
                    activitiesError,
                    emailsError,
                    tasksError,
                    notesError,
                    ticketsError,
                    calendarEventsError,
                    entitySurveysError,
                  ].filter((e): e is string => e !== null)}
                />
              )}
              {filter === 'Activities' && (
                <ActivitiesTab
                  activities={activities}
                  isLoading={activitiesLoading}
                  error={activitiesError}
                  healthColor={healthColor}
                />
              )}
              {filter === 'Emails' && (
                <EmailsTab
                  emails={emails}
                  isLoading={emailsLoading}
                  error={emailsError}
                  selectedEmail={selectedEmail}
                  onSelectEmail={setSelectedEmail}
                  onCompose={canEmail ? () => setComposing(true) : undefined}
                />
              )}
              {composing && canEmail && (
                <ComposeEmailModal
                  customerId={entityType === 'account' ? (customerId as number) : Number(entityId)}
                  accountId={entityType === 'account' ? Number(entityId) : undefined}
                  recordName={entityType === 'account' ? 'this account' : 'this organisation'}
                  onClose={() => setComposing(false)}
                  onSent={() => {
                    if (entityType === 'account') {
                      dispatch(fetchEmailsForAccount({ customerId: customerId as number, accountId: Number(entityId) }));
                    } else {
                      dispatch(fetchEmailsForCustomer(Number(entityId)));
                    }
                  }}
                />
              )}
              {filter === 'Tasks' && (
                <TasksTab
                  tasks={tasks}
                  isLoading={tasksLoading}
                  error={tasksError}
                  onCreate={
                    canEmail
                      ? async (task) => {
                          const result = await dispatch(
                            createTask({
                              customerId: entityType === 'account' ? (customerId as number) : Number(entityId),
                              accountId: entityType === 'account' ? Number(entityId) : undefined,
                              ...task,
                            }),
                          );
                          return createTask.fulfilled.match(result);
                        }
                      : undefined
                  }
                />
              )}
              {filter === 'Notes' && (
                <NotesTab
                  notes={notes}
                  isLoading={notesLoading}
                  error={notesError}
                  onCreate={
                    canEmail
                      ? async (note) => {
                          const result = await dispatch(
                            createNote({
                              customerId: entityType === 'account' ? (customerId as number) : Number(entityId),
                              accountId: entityType === 'account' ? Number(entityId) : undefined,
                              ...note,
                            }),
                          );
                          return createNote.fulfilled.match(result);
                        }
                      : undefined
                  }
                />
              )}
              {filter === 'Tickets' && (
                <TicketsTab tickets={tickets} isLoading={ticketsLoading} error={ticketsError} />
              )}
              {filter === 'Calendar Events' && (
                <CalendarEventsTab
                  events={calendarEvents}
                  meetings={meetings}
                  isLoading={calendarEventsLoading}
                  error={calendarEventsError}
                />
              )}
              {filter === 'Surveys' && (
                <SurveysTab
                  surveys={entitySurveys}
                  isLoading={entitySurveysLoading}
                  error={entitySurveysError}
                  entityType={entityType}
                  entityId={entityId}
                  customerId={customerId}
                />
              )}
              {filter === 'Sessions' && <SessionsTab sessions={sessionsForThisEntity} />}
              {filter === 'Slack' && <SlackTab entityId={resolvedId} />}

              {!IMPLEMENTED_FILTERS.includes(filter) && (
                <div className="flex flex-col items-center justify-center flex-1 py-16 opacity-30">
                  <Layout className="w-12 h-12 text-ink-faint mb-2" />
                  <span className="text-sm font-bold text-ink-muted uppercase tracking-widest">
                    {filter} coming soon
                  </span>
                </div>
              )}
            </div>
            </div>
            
            {/* Slide-in panel area */}
            {selectedEmail && (
              <div 
                className="w-[420px] shrink-0 bg-surface h-full shadow-[0_0_20px_rgba(0,0,0,0.05)] z-10 border-l border-line-subtle relative"
                style={{ animation: 'slideInRight 0.3s cubic-bezier(0.4,0,0.2,1)' }}
              >
                <EmailThreadPanel email={selectedEmail} onClose={() => setSelectedEmail(null)} />
              </div>
            )}
            {/* Slide-in animation */}
            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to   { transform: translateX(0);   opacity: 1; }
              }
            `}</style>
          </>
        ) : activeSubTab === 'Overview' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-subtle/20">
            <div className="grid grid-cols-2 gap-4 max-w-4xl">
              <InfoCard icon={<Globe className="w-4 h-4" />} label="Domain" value={overviewInfo?.domain ?? '—'} />
              <InfoCard icon={<MapPin className="w-4 h-4" />} label="Location" value={overviewInfo?.location ?? '—'} />
              <InfoCard icon={<Mail className="w-4 h-4" />} label="Email" value={overviewInfo?.email ?? '—'} />
              <InfoCard icon={<Phone className="w-4 h-4" />} label="Phone" value={overviewInfo?.phone ?? '—'} />
              <InfoCard icon={<Briefcase className="w-4 h-4" />} label="Industry" value={overviewInfo?.industry ?? '—'} />
            </div>
          </div>
        ) : activeSubTab === 'Headlines' ? (
          <HeadlinesTab
            headlines={headlines}
            isLoading={headlinesLoading}
            error={headlinesError}
            onRegenerate={handleRegenerate}
            isRegenerating={headlinesGenerating}
            regenerateError={headlinesGenerateError}
          />
        ) : activeSubTab === 'CallSense' ? (
          <CallSenseTab entityType={entityType} entityId={entityId} customerId={customerId} />
        ) : activeSubTab === 'Files' ? (
          <FilesTab entityType={entityType} entityId={entityId} customerId={customerId} />
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 py-10 opacity-30">
            <Layout className="w-12 h-12 text-ink-faint mb-2" />
            <span className="text-sm font-bold text-ink-muted uppercase tracking-widest">
              {activeSubTab} coming soon
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-4 bg-surface rounded-xl border border-line-subtle shadow-sm flex items-start gap-3 hover:shadow-md transition-shadow">
      <div className="p-2 bg-accent-dim/50 rounded-lg text-accent">{icon}</div>
      <div>
        <p className="text-[11px] font-bold text-ink-faint uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}
