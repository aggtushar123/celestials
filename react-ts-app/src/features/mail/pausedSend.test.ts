import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import mailReducer, { sendEmail } from './mailSlice';
import mailboxReducer, { replyToMailMessage } from './mailboxSlice';
import communicationsReducer, { replyToEmail } from '../communications/communicationsSlice';

// Integration tier for the three send thunks: the real reducers, fetch
// answering contract §3's 409 MAILBOX_PAUSED.

const WORDS = "Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.";

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => body })));
}

const paused = () => answer(409, { code: 'MAILBOX_PAUSED', detail: "Your Gmail connection is paused: your workspace isn't enabled for Gmail.", paused_reason: 'workspace_off' });

afterEach(() => vi.unstubAllGlobals());

describe('a paused Google mailbox refuses to send (contract §3)', () => {
  it('compose says why and what to do', async () => {
    paused();
    const store = configureStore({ reducer: { mail: mailReducer } });
    await store.dispatch(sendEmail({ customerId: 3, to: ['ann@pizzahut.com'], subject: 'Hi', body: 'Hello' }));
    expect(store.getState().mail.sendError).toBe(WORDS);
  });

  it('a mailbox reply says why and what to do', async () => {
    paused();
    const store = configureStore({ reducer: { mailbox: mailboxReducer } });
    await store.dispatch(replyToMailMessage({ id: 1, body: 'Thanks' }));
    expect(store.getState().mailbox.replyError).toBe(WORDS);
  });

  it('a queue reply says why and what to do', async () => {
    paused();
    const store = configureStore({ reducer: { communications: communicationsReducer } });
    await store.dispatch(replyToEmail({ rowId: 'email:412', body: 'Thanks' }));
    expect(store.getState().communications.replyError).toBe(WORDS);
  });

  it('other refusals keep their own words', async () => {
    answer(502, { detail: 'Gmail is down.' });
    const store = configureStore({ reducer: { mailbox: mailboxReducer } });
    await store.dispatch(replyToMailMessage({ id: 1, body: 'Thanks' }));
    expect(store.getState().mailbox.replyError).toBe('Gmail is down.');
  });
});
