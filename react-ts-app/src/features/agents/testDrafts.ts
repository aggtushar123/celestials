// Test-only: one stateful fetch stub for /api/v1/communications/drafts/, in
// the Agents delivery 2 contract's shapes and refusal orders. The reader is
// Alice (id 1); Carl CSM (id 3) owns one draft she may read. Writes are
// kept; every answer is a copy; anything else goes to `passThrough`. No em dash.
import { vi } from 'vitest';
import { DRAFT_EMAIL_ID, DRAFT_TICKET_ID } from './testAgentsFixtures';
import type { ReplyDraft } from './draftTypes';

const ALICE = { id: 1, name: 'Alice' };
const CARL = { id: 3, name: 'Carl CSM' };
const SENT_AT = '2026-10-08T10:00:00Z';

export const DRAFT_EMAIL: ReplyDraft = {
  id: DRAFT_EMAIL_ID,
  channel: 'email',
  status: 'open',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  source: { kind: 'email', id: 812, subject: 'Renewal terms', from: { name: 'Ann Lee', address: 'ann@x.com' }, sent_at: '2026-10-06T09:00:00Z' },
  to: [['Ann Lee', 'ann@x.com']],
  subject: 'Re: Renewal terms',
  body: 'Hi Ann,\n\nThanks for the note on the renewal terms. I will send the revised order form by Friday.\n\nBest,\nAlice',
  agent: 'cs',
  agent_action_id: 90,
  owner: ALICE,
  edited: false,
  created_at: '2026-10-08T00:46:00Z',
  updated_at: '2026-10-08T00:46:00Z',
  sent_at: null,
  sent_by: null,
  can_edit: true,
  can_resolve: false,
};

export const DRAFT_TICKET: ReplyDraft = {
  ...DRAFT_EMAIL,
  id: DRAFT_TICKET_ID,
  channel: 'ticket',
  source: { kind: 'ticket', id: 55, number: 'TKT-1042', title: 'Export fails', external_url: 'https://acme.zendesk.com/agent/tickets/1042', source_name: 'Zendesk' },
  to: null,
  subject: null,
  body: 'Hi Ann, the export fix ships on Thursday. I will confirm here once it is live.',
  agent_action_id: 91,
};

/** Carl's: Alice may read it (she manages him) but not change it. */
export const DRAFT_CARLS: ReplyDraft = { ...DRAFT_EMAIL, id: 9, agent_action_id: 94, owner: CARL, can_edit: false };

export const DRAFTS: ReplyDraft[] = [DRAFT_EMAIL, DRAFT_TICKET, DRAFT_CARLS];

export interface DraftsStub {
  drafts?: ReplyDraft[];
  /** Whether Alice has a connected mailbox. Default true. */
  mailbox?: boolean;
  /** The next send answers 502 (the provider refused), once. */
  failNextSend?: boolean;
  /** The next send answers 504 SEND_UNCONFIRMED, once, and leaves the draft unconfirmed. */
  unconfirmNextSend?: boolean;
  /** The next confirm-sent or reopen answers 500, once. */
  failNextResolve?: boolean;
  /** How many reads of the list, and of one draft, fail (500) first. */
  failList?: number;
  failRead?: number;
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const DOWN = { detail: 'Down.' };

export function stubDrafts(stub: DraftsStub = {}) {
  const drafts = new Map<number, ReplyDraft>((stub.drafts ?? DRAFTS).map((d) => [d.id, JSON.parse(JSON.stringify(d)) as ReplyDraft]));
  // What the agent wrote, for `edited`.
  const written = new Map<number, { body: string; subject: string | null }>([...drafts.values()].map((d) => [d.id, { body: d.body, subject: d.subject }]));
  const mailbox = stub.mailbox ?? true;
  let failNextSend = stub.failNextSend ?? false;
  let unconfirmNextSend = stub.unconfirmNextSend ?? false;
  let failNextResolve = stub.failNextResolve ?? false;
  let failList = stub.failList ?? 0;
  let failRead = stub.failRead ?? 0;

  const own = (d: ReplyDraft) => d.owner.id === ALICE.id;
  const notYours = (d: ReplyDraft, verb: 'change' | 'send') => json(403, { code: 'NOT_YOURS', detail: `Only ${d.owner.name} can ${verb} this draft.` });
  const alreadySent = () => json(409, { code: 'ALREADY_SENT', detail: 'This draft has been sent.' });

  function fieldErrors(d: ReplyDraft, body: Record<string, unknown>): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    if ('body' in body) {
      const text = typeof body.body === 'string' ? body.body : '';
      if (!text.trim()) errors.body = ['Write the reply.'];
      else if (text.length > 20000) errors.body = ['Keep the reply under 20,000 characters.'];
    }
    if ('subject' in body) {
      if (d.channel === 'ticket') errors.subject = ['A ticket reply has no subject.'];
      else if (typeof body.subject === 'string' && body.subject.length > 255) errors.subject = ['Keep the subject under 255 characters.'];
    }
    return errors;
  }

  function write(d: ReplyDraft, body: Record<string, unknown>) {
    if (typeof body.body === 'string') d.body = body.body;
    if (typeof body.subject === 'string' && d.channel === 'email') d.subject = body.subject;
    const first = written.get(d.id);
    d.edited = first ? d.body !== first.body || d.subject !== first.subject : true;
    d.updated_at = '2026-10-08T09:50:00Z';
  }

  function settle(d: ReplyDraft) {
    d.status = 'sent';
    d.sent_at = SENT_AT;
    d.sent_by = ALICE;
    d.can_edit = false;
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (path === '/communications/drafts/' && method === 'GET') {
      if (failList > 0) {
        failList -= 1;
        return json(500, DOWN);
      }
      const channel = url.searchParams.get('channel');
      const status = url.searchParams.get('status') ?? 'open';
      if (channel !== null && channel !== 'email' && channel !== 'ticket') return json(400, { channel: ['Choose email or ticket.'] });
      if (status !== 'open' && status !== 'sent') return json(400, { status: ['Choose open or sent.'] });
      const results = [...drafts.values()].filter((d) => own(d) && d.status === status && (!channel || d.channel === channel)).sort((a, b) => b.id - a.id);
      return json(200, { results });
    }
    const match = /^\/communications\/drafts\/(\d+)\/(send\/|mark-sent\/|confirm-sent\/|reopen\/)?$/.exec(path);
    if (match) {
      const d = drafts.get(Number(match[1]));
      const verb = match[2] ?? '';
      if (!d) return json(404, { detail: 'Not found.' });
      if (verb === '' && method === 'GET') {
        if (failRead > 0) {
          failRead -= 1;
          return json(500, DOWN);
        }
        return json(200, d);
      }
      if (verb === '' && method === 'PATCH') {
        if (!own(d)) return notYours(d, 'change');
        if (d.status === 'sent') return alreadySent();
        const errors = fieldErrors(d, body);
        if (Object.keys(errors).length > 0) return json(400, errors);
        write(d, body);
        return json(200, d);
      }
      if (verb === '' && method === 'DELETE') {
        if (!own(d)) return notYours(d, 'change');
        if (d.status === 'sent') return alreadySent();
        drafts.delete(d.id);
        return json(204, undefined);
      }
      if (verb === 'send/' && method === 'POST') {
        if (!own(d)) return notYours(d, 'send');
        if (d.channel === 'ticket') return json(400, { code: 'WRONG_CHANNEL', detail: 'Copy a ticket reply into its source and mark it sent.' });
        if (d.status === 'sent') return (d as ReplyDraft & { supersede?: boolean }).supersede ? json(409, { code: 'SEND_SUPERSEDED', detail: 'This reply already went out.' }) : alreadySent();
        const errors = fieldErrors(d, body);
        if (Object.keys(errors).length > 0) return json(400, errors);
        write(d, body);
        if (!mailbox) return json(409, { code: 'NO_MAILBOX', detail: 'Connect your mailbox to send this.' });
        if (failNextSend) {
          failNextSend = false;
          return json(502, { detail: "Your mailbox didn't accept the message. Try again." });
        }
        if (unconfirmNextSend) {
          unconfirmNextSend = false;
          d.status = 'sent';
          d.sent_at = null;
          d.sending = 'unconfirmed';
          d.can_edit = false;
          d.can_resolve = true;
          return json(504, { code: 'SEND_UNCONFIRMED', detail: "We couldn't confirm this was sent. Check your Sent folder." });
        }
        settle(d);
        return json(200, { draft: d, email: { id: 900, subject: d.subject, sent_at: SENT_AT, thread_id: 't-812' } });
      }
      if (verb === 'mark-sent/' && method === 'POST') {
        if (!own(d)) return notYours(d, 'change');
        if (d.channel === 'email') return json(400, { code: 'WRONG_CHANNEL', detail: 'Send an email draft instead.' });
        if (d.status === 'sent') return alreadySent();
        settle(d);
        return json(200, d);
      }
      if ((verb === 'confirm-sent/' || verb === 'reopen/') && method === 'POST') {
        if (!own(d)) return notYours(d, 'send');
        if (d.sending !== 'unconfirmed' || !d.can_resolve) return json(409, { code: 'NOT_UNCONFIRMED', detail: "This draft isn't waiting for confirmation." });
        if (failNextResolve) {
          failNextResolve = false;
          return json(500, DOWN);
        }
        if (verb === 'confirm-sent/') {
          settle(d);
        } else {
          d.status = 'open';
          d.can_edit = true;
        }
        d.sending = null;
        d.can_resolve = false;
        return json(200, d);
      }
    }
    if (stub.passThrough) return stub.passThrough(input, init);
    return json(404, { detail: 'Not found.' });
  });
  vi.stubGlobal('fetch', spy);
  return { spy, drafts, isSent: (id: number) => drafts.get(id)?.status === 'sent' };
}
