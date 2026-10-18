import { combineReducers, configureStore, type Middleware } from '@reduxjs/toolkit';
import authReducer, { loggedOut, refreshSession } from './features/auth/authSlice';
import tasksReducer from './features/tasks/tasksSlice';
import userManagementReducer from './features/userManagement/userManagementSlice';
import accessReducer from './features/access/accessSlice';
import platformReducer from './features/platform/platformSlice';
import billingReducer from './features/billing/billingSlice';
import customersReducer from './features/customers/customersSlice';
import copilotSessionsReducer from './features/copilotSessions/copilotSessionsSlice';
import notificationsReducer from './features/notifications/notificationsSlice';
import ticketsReducer from './features/tickets/ticketsSlice';
import healthReducer from './features/health/healthSlice';
import interactionsReducer from './features/interactions/interactionsSlice';
import usageReducer from './features/usage/usageSlice';
import forecastReducer from './features/forecast/forecastSlice';
import activityReducer from './features/activity/activitySlice';
import portfolioReducer from './features/portfolio/portfolioSlice';
import productsReducer from './features/products/productsSlice';
import metricsReducer from './features/metrics/metricsSlice';
import feedbackReducer from './features/feedback/feedbackSlice';
import agentsReducer from './features/agents/agentsSlice';
import skillsReducer from './features/skills/skillsSlice';
import connectorsReducer from './features/connectors/connectorsSlice';
import knowledgeReducer from './features/knowledge/knowledgeSlice';
import mailReducer from './features/mail/mailSlice';
import mailboxReducer from './features/mail/mailboxSlice';
import filesReducer from './features/files/filesSlice';
import callsReducer from './features/calls/callsSlice';
import communicationsReducer from './features/communications/communicationsSlice';
import settingsReducer from './features/settings/settingsSlice';
import { endSession, setAuthHooks } from './lib/apiClient';

const appReducer = combineReducers({
  communications: communicationsReducer,
  settings: settingsReducer,
  auth: authReducer,
  tasks: tasksReducer,
  userManagement: userManagementReducer,
  access: accessReducer,
  platform: platformReducer,
  billing: billingReducer,
  customers: customersReducer,
  copilotSessions: copilotSessionsReducer,
  notifications: notificationsReducer,
  tickets: ticketsReducer,
  health: healthReducer,
  interactions: interactionsReducer,
  usage: usageReducer,
  forecast: forecastReducer,
  activity: activityReducer,
  portfolio: portfolioReducer,
  products: productsReducer,
  metrics: metricsReducer,
  feedback: feedbackReducer,
  agents: agentsReducer,
  skills: skillsReducer,
  connectors: connectorsReducer,
  knowledge: knowledgeReducer,
  mail: mailReducer,
  mailbox: mailboxReducer,
  files: filesReducer,
  calls: callsReducer,
});

// Sign-out must not leave the next person signed into this tab able to see
// a trace of the previous one's data (SOC2 session hygiene). Every slice
// but `auth` used to survive a logout untouched — e.g. the previous
// customer's filters, draft notes, or notification list stayed in memory
// until a hard refresh. `loggedOut` fires both from a manual sign-out (the
// `logout` thunk, above) and from apiClient's onAuthFailure hook (session
// died silently), so resetting on it covers both paths; replaying the
// action through every reducer with `state: undefined` puts each slice
// back at its own initial state, same as a fresh page load.
export function rootReducer(state: ReturnType<typeof appReducer> | undefined, action: Parameters<typeof appReducer>[1]) {
  if (action.type === loggedOut.type) {
    return appReducer(undefined, action);
  }
  return appReducer(state, action);
}

// A thunk started before sign-out (a customers or notifications fetch,
// say) that resolves afterward would otherwise write the previous
// person's data straight back into a slice `rootReducer` just reset —
// the one remaining way the next person in the tab could see a trace of
// the last one (fix/impact-cleanups review, Minor 7). Checked against
// live state rather than a separate flag, so it needs no wiring at every
// call site, and any future way to sign in unblocks it automatically the
// moment it sets `isAuthenticated`. Everything under `auth/` — including
// `loggedOut` itself and every login path — always gets through, or
// nobody could ever sign in again.
export const sessionGuard: Middleware<unknown, ReturnType<typeof appReducer>> = (api) => {
  // Async thunks (createAsyncThunk) by meta.requestId: those started and not
  // yet settled, and those that were still out when the session ended. A
  // stale one's fulfilled or rejected is dropped, so a thunk that catches
  // the dropped response and rejects with its own fallback text still
  // writes nothing into the next person's slices. `auth/` is exempt.
  const outstanding = new Set<string>();
  const stale = new Set<string>();
  return (next) => (action) => {
    const before = api.getState().auth;
    const signedOut = !before.isAuthenticated;
    const type = typeof action === 'object' && action !== null && 'type' in action ? action.type : undefined;
    const requestId =
      typeof action === 'object' && action !== null && 'meta' in action && typeof (action.meta as { requestId?: unknown } | null)?.requestId === 'string'
        ? (action.meta as { requestId: string }).requestId
        : null;
    if (signedOut && typeof type === 'string' && !type.startsWith('auth/')) {
      // Forget a stale thunk that settles while nobody is signed in.
      if (requestId !== null && !type.endsWith('/pending')) stale.delete(requestId);
      return action;
    }
    const tracked = requestId !== null && typeof type === 'string' && !type.startsWith('auth/');
    if (tracked && typeof type === 'string') {
      if (type.endsWith('/pending')) outstanding.add(requestId);
      else if (type.endsWith('/fulfilled') || type.endsWith('/rejected')) {
        outstanding.delete(requestId);
        if (stale.delete(requestId)) return action;
      }
    }
    // A thunk whose request was dropped because the session changed
    // (apiClient's SessionChangedError) must not write anything, not even
    // its rejection into the next person's slice.
    const failure = typeof action === 'object' && action !== null && 'error' in action ? (action.error as { name?: string } | null) : null;
    if (failure?.name === 'SessionChangedError') return action;
    const result = next(action);
    // The session ended (signed out, or its refresh died) or passed to someone
    // else: every request still out belongs to the last one, so apiClient drops
    // their answers and the thunks started under it settle silently.
    const after = api.getState().auth;
    if ((before.isAuthenticated && !after.isAuthenticated) || (before.user && after.user && before.user.id !== after.user.id)) {
      endSession();
      outstanding.forEach((id) => stale.add(id));
      outstanding.clear();
    }
    return result;
  };
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sessionGuard),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Wires apiClient's auto-refresh-on-401 to this store, without apiClient
// importing the store or authSlice directly (that would cycle back through
// authSlice's own thunks, which call apiFetch). See lib/apiClient.ts.
setAuthHooks({
  getAccessToken: () => store.getState().auth.accessToken,
  refreshAccessToken: async () => {
    const result = await store.dispatch(refreshSession());
    return refreshSession.fulfilled.match(result) ? result.payload.accessToken : null;
  },
  onAuthFailure: () => store.dispatch(loggedOut()),
});
