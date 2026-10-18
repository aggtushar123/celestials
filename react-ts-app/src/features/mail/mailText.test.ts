import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import {
  RECONNECT_REVOKED,
  RECONNECT_TWO_WAY,
  REFUSED_FALLBACK,
  WRONG_DOMAIN_FALLBACK,
  disconnectedLine,
  importLine,
  pausedLine,
  pausedNotice,
  pausedSendMessage,
  reconnectBanner,
  refusalCopy,
  sendFailure,
} from './mailText';

describe('refusalCopy (contract §1)', () => {
  it('says each callback refusal in the contract words', () => {
    expect(refusalCopy('GOOGLE_DENIED', null)).toBe("Google didn't grant access. Either you cancelled, or this Google account isn't on Revenact's test-user list yet: ask Revenact support.");
    expect(refusalCopy('SCOPES_MISSING', null)).toBe('Revenact needs all the Gmail permissions on the consent screen. Connect again and leave them all ticked.');
    expect(refusalCopy('ADDRESS_IN_USE', null)).toBe('This Google account is already connected by someone else in Revenact.');
    expect(refusalCopy('NO_SEAT', null)).toBe('You need a seat in this workspace to connect Gmail. Ask an admin.');
    expect(refusalCopy('GMAIL_NOT_ENABLED', null)).toBe("Your workspace isn't enabled for Gmail yet: ask Revenact support.");
  });

  it('asks a forwarded connect link to be finished from the starting browser (contract decision 33)', () => {
    expect(refusalCopy('BROWSER_MISMATCH', 'anything the server said')).toBe(
      'Finish connecting in the same browser you started from. If someone sent you a connect link, start from your own Integrations page instead.',
    );
  });

  it('shows the server WRONG_DOMAIN sentence only in its own shape', () => {
    expect(refusalCopy('WRONG_DOMAIN', 'Connect your pizzahut.com account.')).toBe('Connect your pizzahut.com account.');
    expect(refusalCopy('WRONG_DOMAIN', 'Connect your pizzahut.com or pizzahut.co.uk account.')).toBe('Connect your pizzahut.com or pizzahut.co.uk account.');
    expect(refusalCopy('WRONG_DOMAIN', 'Connect your a.com, b.com or c.com account.')).toBe('Connect your a.com, b.com or c.com account.');
    expect(refusalCopy('WRONG_DOMAIN', 'Call +1 555 0100 to unlock your account.')).toBe(WRONG_DOMAIN_FALLBACK);
    expect(refusalCopy('WRONG_DOMAIN', null)).toBe(WRONG_DOMAIN_FALLBACK);
  });

  it('falls back for an unknown or missing code', () => {
    expect(refusalCopy('SOMETHING_NEW', 'anything')).toBe(REFUSED_FALLBACK);
    expect(refusalCopy(null, null)).toBe(REFUSED_FALLBACK);
    for (const inherited of ['constructor', 'toString', '__proto__']) expect(refusalCopy(inherited, null)).toBe(REFUSED_FALLBACK);
  });
});

describe('the connection words', () => {
  it('says why sync is paused, leaving token_revoked to the banner', () => {
    expect(pausedLine('workspace_off')).toBe("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.");
    expect(pausedLine('suspended')).toBe('Sync is paused: your access to this workspace is suspended. Ask an admin.');
    expect(pausedLine('no_seat')).toBe('Sync is paused: you no longer hold a seat in this workspace. Ask an admin.');
    expect(pausedLine('token_revoked')).toBeNull();
    expect(pausedLine(null)).toBeNull();
    expect(pausedNotice('token_revoked')).toBe('Google access was revoked. Reconnect it in Settings › Connections.');
    expect(pausedNotice('no_seat')).toBe(pausedLine('no_seat'));
  });

  it('picks the reconnect banner from paused_reason (contract §2)', () => {
    expect(reconnectBanner({ needs_reconnect: false, paused_reason: null })).toBeNull();
    expect(reconnectBanner({ needs_reconnect: true, paused_reason: null })).toBe(RECONNECT_TWO_WAY);
    expect(reconnectBanner({ needs_reconnect: true, paused_reason: 'token_revoked' })).toBe(RECONNECT_REVOKED);
    expect(RECONNECT_TWO_WAY).toBe('Reconnect to turn on two-way');
    expect(RECONNECT_REVOKED).toBe('Google access was revoked: reconnect');
  });

  it('says the import with "about", and done is final (contract decision 16)', () => {
    expect(importLine({ state: 'importing', imported: 4210, total_estimate: 18000, done_at: null })).toBe('Importing mail: 4,210 of about 18,000');
    expect(importLine({ state: 'importing', imported: 4210, total_estimate: null, done_at: null })).toBe('Importing mail: 4,210 so far');
    expect(importLine({ state: 'importing', imported: 19000, total_estimate: 18000, done_at: null })).toBe('Importing mail: 19,000 so far');
    expect(importLine({ state: 'done', imported: 9800, total_estimate: 18000, done_at: '2026-10-10T11:00:00Z' })).toBe('Mail from the last 12 months is imported.');
    expect(importLine(null)).toBeNull();
  });

  it('says what a Google disconnect keeps, with both dates', () => {
    expect(disconnectedLine({ provider: 'google', address: 'dana@doughco.com', disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' })).toBe(
      'dana@doughco.com was disconnected on 10 Oct 2026. Your copies of its mail are kept until 9 Nov 2026: reconnect the same account before then to keep them.',
    );
  });
});

describe('pausedSendMessage (contract §3)', () => {
  const paused = (reason: string, detail = "Your Gmail connection is paused: your workspace isn't enabled for Gmail.") =>
    new ApiError(409, { code: 'MAILBOX_PAUSED', detail, paused_reason: reason }, detail);

  it('adds the next step to the server sentence', () => {
    expect(pausedSendMessage(paused('workspace_off'))).toBe("Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.");
    expect(pausedSendMessage(paused('token_revoked', 'Paused.'))).toBe('Paused. Reconnect Google in Settings › Connections.');
    expect(pausedSendMessage(paused('no_seat', 'Paused.'))).toBe('Paused. Ask an admin for a seat.');
    expect(pausedSendMessage(paused('suspended', 'Paused.'))).toBe('Paused. Ask an admin.');
  });

  it('is null for anything that is not MAILBOX_PAUSED', () => {
    expect(pausedSendMessage(new ApiError(409, { code: 'NO_MAILBOX', detail: 'Connect your mailbox to send this.' }, 'x'))).toBeNull();
    expect(pausedSendMessage(new Error('x'))).toBeNull();
    expect(pausedSendMessage(paused('constructor', 'Paused.'))).toBe('Paused.');
    expect(sendFailure(new ApiError(502, { detail: 'Gmail is down.' }, 'Gmail is down.'), 'fallback')).toBe('Gmail is down.');
    expect(sendFailure(new Error('x'), 'Could not send.')).toBe('Could not send.');
    expect(sendFailure(paused('workspace_off'), 'x')).toContain('Ask Revenact support');
  });
});
