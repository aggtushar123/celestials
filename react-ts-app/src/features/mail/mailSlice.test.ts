import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import reducer, { disconnectMailbox, fetchMailbox, saveSignature, syncMailbox, syncWaitExpired } from './mailSlice';
import { GOOGLE, OUTLOOK, PROVIDERS } from './testMail';

// Unit tier: the reducer alone, fed the thunks' own action creators with
// contract-shaped payloads (contract §3).

const base = reducer(undefined, { type: '@@init' });
const loaded = (connection = GOOGLE) => reducer(base, fetchMailbox.fulfilled({ connection, disconnected: null, providers: PROVIDERS }, 'r'));

describe('mailSlice: the connection', () => {
  it('keeps the disconnected block and the provider gates from GET mail/connection/', () => {
    const disconnected = { provider: 'google' as const, address: 'dana@doughco.com', disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' };
    const gated = PROVIDERS.map((p) => (p.key === 'google' ? { ...p, gate: 'GMAIL_NOT_ENABLED' as const } : p));
    const state = reducer(base, fetchMailbox.fulfilled({ connection: null, disconnected, providers: gated }, 'r'));
    expect(state.connection).toBeNull();
    expect(state.disconnected).toEqual(disconnected);
    expect(state.providers[0].gate).toBe('GMAIL_NOT_ENABLED');
  });

  it('reads a missing disconnected block as null', () => {
    const state = reducer(base, fetchMailbox.fulfilled({ connection: GOOGLE, providers: PROVIDERS } as never, 'r'));
    expect(state.disconnected).toBeNull();
  });
});

describe('mailSlice: Sync now', () => {
  it('queues a Google sync and waits until last_synced_at moves', () => {
    let state = reducer(loaded(), syncMailbox.fulfilled({ ...GOOGLE, filed: null, queued: true }, 'r'));
    expect(state.syncQueued).toBe(true);
    expect(state.syncQueuedFrom).toBe(GOOGLE.last_synced_at);
    expect(state.connection).toEqual(GOOGLE);
    state = reducer(state, fetchMailbox.fulfilled({ connection: GOOGLE, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(state.syncQueued).toBe(true);
    state = reducer(state, fetchMailbox.fulfilled({ connection: { ...GOOGLE, last_synced_at: '2026-10-10T09:20:00Z' }, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(state.syncQueued).toBe(false);
    expect(state.syncQueuedFrom).toBeNull();
  });

  it('never queues an inline sync (Outlook, IMAP)', () => {
    const state = reducer(loaded(OUTLOOK), syncMailbox.fulfilled({ ...OUTLOOK, filed: 3 }, 'r'));
    expect(state.syncQueued).toBe(false);
    expect(state.connection).toEqual(OUTLOOK);
  });

  it('stops waiting when the connection pauses or errors', () => {
    const queued = reducer(loaded(), syncMailbox.fulfilled({ ...GOOGLE, filed: null, queued: true }, 'r'));
    const paused = reducer(queued, fetchMailbox.fulfilled({ connection: { ...GOOGLE, paused_reason: 'workspace_off' }, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(paused.syncQueued).toBe(false);
    const errored = reducer(queued, fetchMailbox.fulfilled({ connection: { ...GOOGLE, status: 'error', error: 'Google access was revoked. Reconnect Google.' }, disconnected: null, providers: PROVIDERS }, 'r'));
    expect(errored.syncQueued).toBe(false);
  });

  it('gives up on syncWaitExpired, and a disconnect clears any wait', () => {
    const queued = reducer(loaded(), syncMailbox.fulfilled({ ...GOOGLE, filed: null, queued: true }, 'r'));
    expect(reducer(queued, syncWaitExpired()).syncQueued).toBe(false);
    const gone = reducer(queued, disconnectMailbox.fulfilled(undefined, 'r'));
    expect(gone.connection).toBeNull();
    expect(gone.syncQueued).toBe(false);
  });
});

describe('saveSignature (round 2 D1 contract §4.3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('patches the signature and keeps the answered connection', async () => {
    const connection = { ...OUTLOOK, signature: { text: 'Carl CSM\nAcme', editable: true, source: 'revenact' as const } };
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ connection }) }));
    vi.stubGlobal('fetch', spy);
    const store = configureStore({ reducer: { mail: reducer } });
    const result = await store.dispatch(saveSignature('Carl CSM\nAcme'));
    expect(saveSignature.fulfilled.match(result)).toBe(true);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/v1/mail/connection/');
    expect(JSON.parse(String(init.body))).toEqual({ signature: 'Carl CSM\nAcme' });
    expect(init.method).toBe('PATCH');
    expect(store.getState().mail.connection?.signature?.text).toBe('Carl CSM\nAcme');
  });

  it('hands back the server sentence on a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ signature: ['Keep the signature to 10 lines.'] }) })));
    const store = configureStore({ reducer: { mail: reducer } });
    const result = await store.dispatch(saveSignature('x'));
    expect(result.payload).toBe('Keep the signature to 10 lines.');
  });
});
