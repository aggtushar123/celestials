import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { addRecipients, draftFailure, joinQuote, mailDraftParam, parseRecipients, recipientText, splitQuote, uploadRefusal, MAIL_SEND_MAX_BYTES } from './mailDrafts';
import { composeTitle, DRAFT_TOO_LARGE_TEXT, FILE_EMPTY, FILE_TOO_LARGE, gmailEstimate, NOT_IN_GMAIL_YET, SAVED_GMAIL, SAVED_HERE, SAVING, saveLine, sizeUsed } from './mailText';
import { MAIL_DRAFT, QUOTE_ANN, SIGNATURE } from './testMail';

// Unit tier: the D3 wire helpers and words (contract
// revenact-backend docs/superpowers/plans/2026-10-11-gmail-writing-api.md).

describe('draftFailure', () => {
  it('keeps the newest draft from a 409 DRAFT_CHANGED', () => {
    const newer = { ...MAIL_DRAFT, revision: 5 };
    const failure = draftFailure(new ApiError(409, { code: 'DRAFT_CHANGED', detail: 'This draft changed in Gmail. Here is the newest version.', draft: newer }, 'This draft changed in Gmail. Here is the newest version.'), 'x');
    expect(failure.code).toBe('DRAFT_CHANGED');
    expect(failure.draft?.revision).toBe(5);
    expect(failure.fields).toEqual({});
  });

  it('reads 400 field errors in the server words', () => {
    const failure = draftFailure(new ApiError(400, { to: ['Add someone to send it to.'], record: ['Choose a record you can open.'] }, 'Add someone to send it to.'), 'x');
    expect(failure.fields).toEqual({ to: 'Add someone to send it to.', record: 'Choose a record you can open.' });
    expect(failure.status).toBe(400);
  });

  it('names the attachment Gmail could not give, and says how to reconnect', () => {
    const missing = draftFailure(new ApiError(409, { code: 'ATTACHMENT_UNAVAILABLE', detail: "Couldn't get Renewal quote.pdf from Gmail. Remove it or try again.", attachment_id: 31 }, "Couldn't get Renewal quote.pdf from Gmail. Remove it or try again."), 'x');
    expect(missing.attachmentId).toBe(31);
    const off = draftFailure(new ApiError(409, { code: 'TWO_WAY_OFF', detail: 'Reconnect.', needs_reconnect: true }, 'Reconnect.'), 'x');
    expect(off.reconnect).toBe(true);
  });

  it('falls back when the network failed', () => {
    expect(draftFailure(new TypeError('Failed to fetch'), 'Could not save the draft.').text).toBe('Could not save the draft.');
  });
});

describe('splitQuote and joinQuote', () => {
  it('folds everything from the first gmail_quote block, and joins it back unchanged', () => {
    const html = `<p>Works for us.</p>${SIGNATURE}${QUOTE_ANN}`;
    const { body, quote } = splitQuote(html);
    expect(body).toBe(`<p>Works for us.</p>${SIGNATURE}`);
    expect(quote).toBe(QUOTE_ANN);
    expect(joinQuote(body, quote)).toBe(html);
  });

  it('leaves a body without a quote all editable', () => {
    expect(splitQuote('<p>Hi</p>')).toEqual({ body: '<p>Hi</p>', quote: '' });
  });
});

describe('recipients', () => {
  it('reads names, bare addresses and separators, and keeps what is not an address', () => {
    expect(parseRecipients('Ann Lee <Ann@PizzaHut.com>; sam@pizzahut.com,\nnot-an-address')).toEqual({
      valid: [
        ['Ann Lee', 'ann@pizzahut.com'],
        ['', 'sam@pizzahut.com'],
      ],
      invalid: ['not-an-address'],
    });
  });

  it('never adds an address twice', () => {
    expect(addRecipients([['Ann Lee', 'ann@pizzahut.com']], [['', 'ANN@pizzahut.com'], ['', 'ops@pizzahut.com']])).toEqual([
      ['Ann Lee', 'ann@pizzahut.com'],
      ['', 'ops@pizzahut.com'],
    ]);
    expect(recipientText(['Ann Lee', 'ann@pizzahut.com'])).toBe('Ann Lee <ann@pizzahut.com>');
    expect(recipientText(['', 'ann@pizzahut.com'])).toBe('ann@pizzahut.com');
  });
});

describe('uploadRefusal (contract decisions 20 and 21)', () => {
  it('refuses a type the allow-list does not hold, an empty file, a file over 25 MB, and a total over the limit', () => {
    expect(uploadRefusal({ name: 'pricing.zip', size: 10 }, 0, MAIL_SEND_MAX_BYTES)).toBe('.zip is not an accepted file type.');
    expect(uploadRefusal({ name: 'README', size: 10 }, 0, MAIL_SEND_MAX_BYTES)).toBe('that type is not an accepted file type.');
    expect(uploadRefusal({ name: 'quote.pdf', size: 0 }, 0, MAIL_SEND_MAX_BYTES)).toBe(FILE_EMPTY);
    expect(uploadRefusal({ name: 'quote.pdf', size: MAIL_SEND_MAX_BYTES + 1 }, 0, MAIL_SEND_MAX_BYTES)).toBe(FILE_TOO_LARGE);
    expect(uploadRefusal({ name: 'quote.pdf', size: 2_000_000 }, 25_000_000, MAIL_SEND_MAX_BYTES)).toBe(DRAFT_TOO_LARGE_TEXT);
    expect(uploadRefusal({ name: 'Quote.PDF', size: 2_000_000 }, 0, MAIL_SEND_MAX_BYTES)).toBeNull();
  });
});

describe('mailDraftParam (Decision 14)', () => {
  it('reads a mailbox draft only on a mailbox source in Drafts', () => {
    expect(mailDraftParam(new URLSearchParams('source=mailbox:google&folder=drafts&draft=55'))).toBe(55);
    expect(mailDraftParam(new URLSearchParams('draft=7'))).toBeNull();
    expect(mailDraftParam(new URLSearchParams('source=mailbox:google&draft=7'))).toBeNull();
    expect(mailDraftParam(new URLSearchParams('source=mailbox:google&folder=drafts&draft=x'))).toBeNull();
  });
});

describe('the D3 words', () => {
  it('titles the composer by kind', () => {
    expect(composeTitle('new')).toBe('New message');
    expect(composeTitle('reply_all')).toBe('Reply all');
  });

  it('says where the draft is saved', () => {
    expect(saveLine(null)).toBe('');
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'saving' } })).toBe(SAVING);
    expect(saveLine(MAIL_DRAFT)).toBe(SAVED_GMAIL);
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'local' } })).toBe(SAVED_HERE);
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'failed' } })).toBe(NOT_IN_GMAIL_YET);
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'failed' }, sync_issue: { text: "Couldn't save this draft to Gmail: an attachment is no longer in Gmail.", at: '2026-10-11T09:04:00Z' } })).toBe(
      "Couldn't save this draft to Gmail: an attachment is no longer in Gmail.",
    );
  });

  it('counts the message size against its limit, and the Gmail estimate', () => {
    expect(sizeUsed(274630, 26214400)).toBe('268 KB of 25 MB used');
    expect(sizeUsed(3 * 1024 * 1024, 10 * 1024 * 1024)).toBe('3.0 MB of 10 MB used');
    expect(sizeUsed(1000, 1536 * 1024)).toBe('1000 B of 1.5 MB used');
    expect(gmailEstimate(41)).toBe('About 41 in Gmail');
    expect(gmailEstimate(1200)).toBe('About 1,200 in Gmail');
  });
});
