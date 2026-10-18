import { describe, expect, it, vi } from 'vitest';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { rootReducer, sessionGuard, type RootState } from './store';
import { loggedOut, logout, type User } from './features/auth/authSlice';
import { setTheme } from './features/settings/settingsSlice';
import { notificationsReceived } from './features/notifications/notificationsSlice';
import { ALL_CAPABILITIES } from './test/capabilities';

// Builds a fresh store from the same root reducer the app uses, so these
// tests exercise the real reset wiring instead of a reimplementation of it.
function buildStore() {
  return configureStore({ reducer: rootReducer });
}

const SIGNED_IN_USER: User = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice',
  avatar: '',
  role: 'admin',
  role_id: 1,
  role_name: 'Admin',
  permissions: ALL_CAPABILITIES,
  function: 'cs',
  function_display: 'Customer Success',
  reports_to: null,
  organisation: {
    id: 1,
    name: 'Acme Inc',
    slug: 'acme-inc',
    currency: 'USD',
    currency_display: 'US Dollar ($)',
    default_lifecycle_stage: '',
    ai_agent_enabled: true,
    ai_agent_tone: 'professional',
    ai_agent_tone_display: 'Professional',
  },
  is_active: true,
};

/** A store already signed in, with the real `sessionGuard` middleware
 *  wired in (the plain `buildStore()` above never signs in, so it would
 *  not exercise this at all). Signs in by dispatching the same shape
 *  `login.fulfilled` carries, rather than a `preloadedState` — `auth/*`
 *  always reaches the reducer, signed in or not, so this is itself a
 *  small proof that the guard does not block signing in. */
function buildAuthedStore() {
  const store = configureStore({ reducer: rootReducer, middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sessionGuard) });
  store.dispatch({ type: 'auth/login/fulfilled', payload: { user: SIGNED_IN_USER, accessToken: 'token', refreshToken: 'refresh' } });
  return store;
}

describe('rootReducer sign-out reset', () => {
  it('resets every slice to its initial state on loggedOut', () => {
    const store = buildStore();
    const before = store.getState();

    // Dirty a few unrelated slices so the reset has something to undo.
    store.dispatch(setTheme('dark'));
    store.dispatch(
      notificationsReceived([
        {
          id: 1,
          kind: 'question_asked',
          message: 'x',
          link: '',
          actor: null,
          is_read: false,
          created_at: '2026-01-01T00:00:00Z',
        },
      ]),
    );

    const dirtied = store.getState();
    expect(dirtied.settings).not.toEqual(before.settings);
    expect(dirtied.notifications).not.toEqual(before.notifications);

    store.dispatch(loggedOut());

    const after = store.getState();
    (Object.keys(after) as (keyof RootState)[]).forEach((key) => {
      expect(after[key]).toEqual(before[key]);
    });
  });

  it('resets every slice when the logout thunk is dispatched', async () => {
    const store = buildStore();
    const before = store.getState();

    store.dispatch(setTheme('dark'));
    await store.dispatch(logout());

    const after = store.getState();
    (Object.keys(after) as (keyof RootState)[]).forEach((key) => {
      expect(after[key]).toEqual(before[key]);
    });
  });

  it('leaves the rest of the state untouched for unrelated actions', () => {
    const store = buildStore();
    store.dispatch(setTheme('dark'));
    const dirtied = store.getState();

    // An arbitrary non-logout action should not trigger a reset.
    store.dispatch({ type: 'some/unrelatedAction' });

    expect(store.getState().settings).toEqual(dirtied.settings);
  });
});

describe('sessionGuard (Minor 7 of the fix/impact-cleanups review)', () => {
  it('lets ordinary actions through while someone is signed in', () => {
    const store = buildAuthedStore();
    store.dispatch(setTheme('dark'));
    expect(store.getState().settings.theme).toBe('dark');
  });

  it("drops a late-arriving action once sign-out has already reset its slice, so it can't repopulate the old person's data", () => {
    const store = buildAuthedStore();
    const before = store.getState().notifications;

    store.dispatch(loggedOut());
    // A notifications fetch that was already in flight resolving after
    // sign-out — exactly what `onUpdate`/`setState` in a thunk's `.then`
    // would dispatch.
    store.dispatch(
      notificationsReceived([
        { id: 1, kind: 'question_asked', message: 'late', link: '', actor: null, is_read: false, created_at: '2026-01-01T00:00:00Z' },
      ]),
    );

    expect(store.getState().notifications).toEqual(before);
  });

  it('still lets every auth/* action through while signed out, so signing in again works', () => {
    const store = buildAuthedStore();
    store.dispatch(loggedOut());
    expect(store.getState().auth.isAuthenticated).toBe(false);

    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: SIGNED_IN_USER, accessToken: 'new-token', refreshToken: 'new-refresh' } });

    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user).toEqual(SIGNED_IN_USER);
  });

  it('unblocks the rest of the app the moment a fresh sign-in lands', () => {
    const store = buildAuthedStore();
    store.dispatch(loggedOut());
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: SIGNED_IN_USER, accessToken: 'new-token', refreshToken: 'new-refresh' } });

    store.dispatch(setTheme('dark'));
    expect(store.getState().settings.theme).toBe('dark');
  });
});

describe('sessionGuard and late API answers', () => {
  it('ends the api session when someone signs out, so a request already out is dropped', async () => {
    const store = buildAuthedStore();
    const { apiFetch, SessionChangedError } = await import('./lib/apiClient');
    let answer: (r: unknown) => void = () => undefined;
    vi.stubGlobal('fetch', () => new Promise((resolve) => (answer = resolve)));
    const late = apiFetch('/customers/').catch((e: unknown) => e);
    store.dispatch(loggedOut());
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: { ...SIGNED_IN_USER, id: 2, name: 'Bea' }, accessToken: 'b', refreshToken: 'b' } });
    answer({ ok: true, status: 200, json: async () => ({ owner: 'alice' }) });
    expect(await late).toBeInstanceOf(SessionChangedError);
    vi.unstubAllGlobals();
  });

  it("drops a thunk's rejection for a dropped answer, even once someone else is signed in", () => {
    const seen: string[] = [];
    const record: Middleware = () => (next) => (action) => {
      seen.push((action as { type: string }).type);
      return next(action);
    };
    const store = configureStore({ reducer: rootReducer, middleware: (getDefault) => getDefault().concat(sessionGuard, record) });
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: SIGNED_IN_USER, accessToken: 'a', refreshToken: 'a' } });
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: { ...SIGNED_IN_USER, id: 2 }, accessToken: 'b', refreshToken: 'b' } });
    store.dispatch({ type: 'notifications/fetch/rejected', error: { name: 'SessionChangedError', message: 'x' } });
    store.dispatch({ type: 'notifications/fetch/rejected', error: { name: 'Error', message: 'y' } });
    expect(seen.filter((t) => t === 'notifications/fetch/rejected')).toHaveLength(1);
  });

  it('ends the api session when the user changes without a sign-out', async () => {
    const store = buildAuthedStore();
    const { apiFetch, SessionChangedError } = await import('./lib/apiClient');
    let answer: (r: unknown) => void = () => undefined;
    vi.stubGlobal('fetch', () => new Promise((resolve) => (answer = resolve)));
    const late = apiFetch('/customers/').catch((e: unknown) => e);
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: { ...SIGNED_IN_USER, id: 2 }, accessToken: 'b', refreshToken: 'b' } });
    answer({ ok: true, status: 200, json: async () => ({}) });
    expect(await late).toBeInstanceOf(SessionChangedError);
    vi.unstubAllGlobals();
  });
});

describe('late settlements and the real auth wiring', () => {
  it("drops a catch-and-rejectWithValue thunk's rejection once someone else is signed in", () => {
    const seen: string[] = [];
    const record: Middleware = () => (next) => (action) => {
      seen.push((action as { type: string }).type);
      return next(action);
    };
    const store = configureStore({ reducer: rootReducer, middleware: (getDefault) => getDefault().concat(sessionGuard, record) });
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: SIGNED_IN_USER, accessToken: 'a', refreshToken: 'a' } });
    store.dispatch({ type: 'things/load/pending', meta: { requestId: 'r1' } });
    store.dispatch({ type: 'things/load/pending', meta: { requestId: 'r2' } });
    store.dispatch(loggedOut());
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: { ...SIGNED_IN_USER, id: 2 }, accessToken: 'b', refreshToken: 'b' } });
    store.dispatch({ type: 'things/load/rejected', payload: 'Could not load things.', meta: { requestId: 'r1' } });
    store.dispatch({ type: 'things/load/fulfilled', payload: [], meta: { requestId: 'r2' } });
    // One started after the change settles normally.
    store.dispatch({ type: 'things/load/pending', meta: { requestId: 'r3' } });
    store.dispatch({ type: 'things/load/fulfilled', payload: [], meta: { requestId: 'r3' } });
    expect(seen.filter((t) => t === 'things/load/rejected')).toHaveLength(0);
    expect(seen.filter((t) => t === 'things/load/fulfilled')).toHaveLength(1);
  });

  it('a 401 whose refresh fails still signs out and resets the slices (real wiring)', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'expired' }) }));
    const real = await import('./store');
    const { apiFetch } = await import('./lib/apiClient');
    real.store.dispatch({ type: 'auth/login/fulfilled', payload: { user: SIGNED_IN_USER, accessToken: 'a', refreshToken: 'r' } });
    real.store.dispatch(setTheme('dark'));
    await expect(apiFetch('/customers/')).rejects.toMatchObject({ status: 401 });
    expect(real.store.getState().auth.isAuthenticated).toBe(false);
    expect(real.store.getState().settings).toEqual(buildStore().getState().settings);
    vi.unstubAllGlobals();
  });

  it('forgets a stale thunk that settles while signed out, so its id does not linger', () => {
    const seen: string[] = [];
    const record: Middleware = () => (next) => (action) => {
      seen.push(`${(action as { type: string }).type}:${(action as { meta?: { requestId?: string } }).meta?.requestId ?? ''}`);
      return next(action);
    };
    const store = configureStore({ reducer: rootReducer, middleware: (getDefault) => getDefault().concat(sessionGuard, record) });
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: SIGNED_IN_USER, accessToken: 'a', refreshToken: 'a' } });
    store.dispatch({ type: 'things/load/pending', meta: { requestId: 'r1' } });
    store.dispatch(loggedOut());
    // Settles while nobody is signed in: dropped, and forgotten.
    store.dispatch({ type: 'things/load/fulfilled', payload: [], meta: { requestId: 'r1' } });
    store.dispatch({ type: 'auth/login/fulfilled', payload: { user: { ...SIGNED_IN_USER, id: 2 }, accessToken: 'b', refreshToken: 'b' } });
    // The same id coming back for a new run is not mistaken for the old one.
    store.dispatch({ type: 'things/load/pending', meta: { requestId: 'r1' } });
    store.dispatch({ type: 'things/load/fulfilled', payload: [], meta: { requestId: 'r1' } });
    expect(seen.filter((t) => t === 'things/load/fulfilled:r1')).toHaveLength(1);
  });
});
