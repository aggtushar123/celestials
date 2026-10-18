import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { actionFailure, ATTACHMENT_UNAVAILABLE, attachmentFailure, deletedMessages, mailActionGate, NO_MAILBOX_TEXT, TWO_WAY_OFF_TEXT } from './mailText';
import { GOOGLE, OUTLOOK } from './testMail';

// Unit tier: two-way Gmail D2's words and the action gate (contract §3, §10).

describe('mailActionGate (contract §10)', () => {
  it('lets a live two-way Gmail do everything', () => {
    expect(mailActionGate(GOOGLE, null)).toEqual({ gmail: true, blocked: null, reconnect: false });
  });

  it('turns actions off on a read-only Gmail, with the reconnect sentence', () => {
    expect(mailActionGate({ ...GOOGLE, two_way: false }, null)).toEqual({ gmail: true, blocked: TWO_WAY_OFF_TEXT, reconnect: true });
  });

  it('turns actions off on a paused Gmail, with the paused sentence; a revoked one reconnects', () => {
    expect(mailActionGate({ ...GOOGLE, paused_reason: 'no_seat' }, null)).toMatchObject({ gmail: true, reconnect: false, blocked: expect.stringContaining('seat') });
    expect(mailActionGate({ ...GOOGLE, paused_reason: 'token_revoked' }, null)).toMatchObject({ reconnect: true });
  });

  it('keeps a disconnected Gmail read-only, and hides Gmail actions for Outlook', () => {
    const gone = { provider: 'google' as const, address: 'dana@doughco.com', disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' };
    expect(mailActionGate(null, gone)).toEqual({ gmail: true, blocked: NO_MAILBOX_TEXT, reconnect: true });
    expect(mailActionGate(OUTLOOK, null)).toEqual({ gmail: false, blocked: null, reconnect: false });
    expect(mailActionGate(null, null)).toEqual({ gmail: false, blocked: null, reconnect: false });
  });
});

describe('actionFailure', () => {
  it('gives a paused refusal its next step, and a revoked one the reconnect link', () => {
    const paused = new ApiError(409, { code: 'MAILBOX_PAUSED', detail: 'Your Gmail connection is paused: you no longer hold a seat.', paused_reason: 'no_seat' }, 'x');
    expect(actionFailure(paused, 'fallback')).toEqual({ text: 'Your Gmail connection is paused: you no longer hold a seat. Ask an admin for a seat.', reconnect: false, code: 'MAILBOX_PAUSED' });
    const revoked = new ApiError(409, { code: 'MAILBOX_PAUSED', detail: 'Paused.', paused_reason: 'token_revoked' }, 'x');
    expect(actionFailure(revoked, 'fallback').reconnect).toBe(true);
  });

  it('keeps the server words for TWO_WAY_OFF, NO_MAILBOX, GMAIL_ONLY and TOO_MANY', () => {
    expect(actionFailure(new ApiError(409, { code: 'TWO_WAY_OFF' }, TWO_WAY_OFF_TEXT), 'f')).toEqual({ text: TWO_WAY_OFF_TEXT, reconnect: true, code: 'TWO_WAY_OFF' });
    expect(actionFailure(new ApiError(409, { code: 'NO_MAILBOX' }, NO_MAILBOX_TEXT), 'f')).toEqual({ text: NO_MAILBOX_TEXT, reconnect: true, code: 'NO_MAILBOX' });
    expect(actionFailure(new ApiError(400, { code: 'GMAIL_ONLY' }, 'Only Gmail mailboxes have this.'), 'f')).toEqual({ text: 'Only Gmail mailboxes have this.', reconnect: false, code: 'GMAIL_ONLY' });
    expect(actionFailure(new ApiError(400, { code: 'TOO_MANY' }, 'Select fewer conversations: at most 1,000 messages at a time.'), 'f').text).toBe('Select fewer conversations: at most 1,000 messages at a time.');
  });

  it('falls back when nothing came from the server', () => {
    expect(actionFailure(new TypeError('offline'), 'Could not update the conversation.')).toEqual({ text: 'Could not update the conversation.', reconnect: false, code: null });
  });
});

describe('the other D2 sentences', () => {
  it('counts deleted messages', () => {
    expect(deletedMessages(1)).toBe('1 deleted message');
    expect(deletedMessages(3)).toBe('3 deleted messages');
  });

  it('words an unavailable attachment as the contract does', () => {
    expect(ATTACHMENT_UNAVAILABLE).toBe("This file hasn't been fetched from Gmail yet, and its mailbox isn't connected.");
  });

  it("shows an attachment refusal in the server's words, else names the file", () => {
    expect(attachmentFailure(new ApiError(413, { code: 'ATTACHMENT_TOO_LARGE' }, 'This file is too large to open here. Open it in Gmail.'), 'Pricing.zip')).toBe('This file is too large to open here. Open it in Gmail.');
    expect(attachmentFailure(new TypeError('offline'), 'Pricing.zip')).toBe("Couldn't open Pricing.zip.");
  });
});
