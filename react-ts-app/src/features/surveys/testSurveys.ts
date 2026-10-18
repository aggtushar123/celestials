// Test-only: survey sends in the backend's contract shapes (revenact-backend
// feat/surveys, docs/API_CONTRACTS.md `surveys`) and one fetch stub for every
// endpoint the Surveys pages and the hosted form read. It keeps state: a send
// makes links, an answer on a link moves the send's figures and upserts the
// send's logged score. Paths it does not own (segments, teammates,
// organisations, products) fall through to stubSegments. The viewer is ME
// (Alice, id 1) in the workspace "Acme Inc", as pages/segments/testPages.tsx.
import { vi } from 'vitest';
import type { Survey } from '../customers/customersSlice';
import type { PersonRef } from '../segments/segmentTypes';
import { CARL, DANA, ME, SEGMENTS, stubSegments, TEAM, type SegmentsStub } from '../segments/testSegments';
import { BANDS, questionFor, SCALES, TYPE_LABEL } from './questions';
import type {
  AudienceCounts,
  AudienceRequest,
  BandName,
  ContactRef,
  PendingStatus,
  RecordRef,
  SegmentRef,
  SendCounts,
  SendListRow,
  SurveySend,
  SurveyType,
} from './surveyTypes';

type Answer = { status: number; body: unknown };

/** A send as the stub keeps it; its summary is computed on every read. */
export type StoredSend = Omit<SurveySend, 'summary'>;

/** One invite. `state` is what the backend reports (expired is derived
 *  there, stored here); `visible` says whether ME may open its record. The
 *  real backend never stores `token`; the stub keeps it so a test can open
 *  the hosted form. */
export interface StubInvite {
  id: number;
  send: number;
  token: string;
  contact: ContactRef | null;
  record: RecordRef;
  state: 'pending' | 'expired' | 'failed' | 'answered';
  score: number | null;
  comment: string;
  answered_at: string | null;
  expires_at: string;
  failure: string | null;
  visible: boolean;
}

/** The time of every write the stub makes (sends and answers). */
export const NOW = '2026-10-04T14:00:00Z';
const WORKSPACE = 'Acme Inc';
export const EXPIRED = { detail: 'This link has expired.' };
/** POST send/ when the workspace has no email set up (backend, final review). */
export const NO_EMAIL = { detail: "Email isn't set up for this workspace yet, so surveys can't be sent." };

const PIZZA: RecordRef = { kind: 'customer', id: 7, name: 'Pizza Hut' };
const INITECH: RecordRef = { kind: 'customer', id: 2, name: 'Initech' };
const GLOBEX: RecordRef = { kind: 'customer', id: 1, name: 'Globex' };
const PIZZA_EMEA: RecordRef = { kind: 'account', id: 14, name: 'Pizza EMEA' };
const TACO_WEST: RecordRef = { kind: 'account', id: 21, name: 'Taco West' };

const BASE = {
  intro: '',
  shared_with: [] as PersonRef[],
  started_at: null as string | null,
  sent_at: null as string | null,
  counts: null as SendCounts | null,
  updated_at: '2026-10-03T12:00:00Z',
};

/** Mine, sent, shared with the workspace. Five invites went out and one
 *  failed; three answered, one of them on a record I can't open. */
export const Q3_NPS: StoredSend = {
  ...BASE,
  id: 3,
  name: 'Q3 NPS',
  survey_type: 'nps',
  subject: 'A quick question from Acme Inc',
  intro: 'Two minutes, promise.',
  segment: { id: 7, name: 'Renewal risk', kind: 'customer' },
  roles: ['champion', 'decision_maker'],
  status: 'sent',
  sharing: 'workspace',
  owner: ME,
  is_owner: true,
  started_at: '2026-10-03T11:55:00Z',
  sent_at: '2026-10-03T12:00:00Z',
  counts: { audience: 6, sent: 5, failed: 1, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0 },
  created_at: '2026-10-03T08:00:00Z',
};

/** Carl's, shared with me by name. Two answered; I can open one. */
export const CARL_CSAT: StoredSend = {
  ...BASE,
  id: 4,
  name: 'Support CSAT',
  survey_type: 'csat',
  subject: 'How did we do?',
  segment: { id: 8, name: 'EMEA accounts', kind: 'account' },
  roles: ['champion'],
  status: 'sent',
  sharing: 'people',
  shared_with: [ME],
  owner: CARL,
  is_owner: false,
  started_at: '2026-10-01T11:55:00Z',
  sent_at: '2026-10-01T12:00:00Z',
  counts: { audience: 2, sent: 2, failed: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0 },
  created_at: '2026-10-01T08:00:00Z',
};

/** Mine, a draft to the Champions contact segment. */
export const DRAFT_CES: StoredSend = {
  ...BASE,
  id: 5,
  name: 'Onboarding effort',
  survey_type: 'ces',
  subject: 'A quick question from Acme Inc',
  segment: { id: 9, name: 'Champions', kind: 'contact' },
  roles: [],
  status: 'draft',
  sharing: 'private',
  owner: ME,
  is_owner: true,
  created_at: '2026-10-04T08:00:00Z',
};

/** Dana's, private: unreadable to me, so a 404 like a missing id. */
export const DANA_SEND: StoredSend = {
  ...BASE,
  id: 6,
  name: "Dana's NPS",
  survey_type: 'nps',
  subject: 'Hi',
  segment: null,
  roles: [],
  status: 'sent',
  sharing: 'private',
  owner: DANA,
  is_owner: false,
  sent_at: '2026-10-02T12:00:00Z',
  created_at: '2026-10-02T08:00:00Z',
};

export const SENDS: StoredSend[] = [Q3_NPS, CARL_CSAT, DRAFT_CES, DANA_SEND];

export const LIVE_TOKEN = 'live-token-34';

const INVITE = { comment: '', score: null, answered_at: null, expires_at: '2026-10-17T12:00:00Z', failure: null, visible: true };

export const INVITES: StubInvite[] = [
  { ...INVITE, id: 31, send: 3, token: 'answered-31', contact: { id: 51, name: 'Sam Patel' }, record: PIZZA, state: 'answered', score: 10, comment: 'Great support', answered_at: '2026-10-03T12:00:00Z' },
  { ...INVITE, id: 32, send: 3, token: 'answered-32', contact: { id: 52, name: 'Lee Wong' }, record: INITECH, state: 'answered', score: 4, answered_at: '2026-10-03T13:00:00Z' },
  { ...INVITE, id: 33, send: 3, token: 'answered-33', contact: { id: 53, name: 'Kim Ross' }, record: GLOBEX, state: 'answered', score: 9, comment: 'Quick answers', answered_at: '2026-10-04T12:00:00Z', visible: false },
  { ...INVITE, id: 34, send: 3, token: LIVE_TOKEN, contact: { id: 54, name: 'Tom Reyes' }, record: TACO_WEST, state: 'pending' },
  { ...INVITE, id: 35, send: 3, token: 'failed-35', contact: { id: 55, name: 'Ann Lee' }, record: PIZZA_EMEA, state: 'failed', failure: 'Mailbox unavailable' },
  { ...INVITE, id: 36, send: 3, token: 'expired-36', contact: null, record: PIZZA, state: 'expired', expires_at: '2026-10-03T12:00:00Z' },
  { ...INVITE, id: 41, send: 4, token: 'csat-41', contact: { id: 56, name: 'Raj Iyer' }, record: PIZZA_EMEA, state: 'answered', score: 5, answered_at: '2026-10-02T12:00:00Z' },
  { ...INVITE, id: 42, send: 4, token: 'csat-42', contact: { id: 57, name: 'Uma Shah' }, record: TACO_WEST, state: 'answered', score: 2, comment: 'Slow', answered_at: '2026-10-02T13:00:00Z', visible: false },
];

/** What POST /sends/audience/ answers for each of my segments (7 Renewal
 *  risk, organisations; 9 Champions, contacts). */
export const AUDIENCES: Record<number, AudienceCounts> = {
  7: { audience: 3, organisations: 3, skipped_recent: 1, skipped_no_email: 1, skipped_cap: 0, hidden_count: 2, limit: 500 },
  9: { audience: 2, organisations: 2, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 },
};

/** The people a send to each segment asks (as many as AUDIENCES counts). */
const PEOPLE: Record<number, { contact: ContactRef; record: RecordRef }[]> = {
  7: [
    { contact: { id: 61, name: 'Ada Byrne' }, record: PIZZA },
    { contact: { id: 62, name: 'Bo Chen' }, record: INITECH },
    { contact: { id: 63, name: 'Cy Diaz' }, record: GLOBEX },
  ],
  9: [
    { contact: { id: 64, name: 'Dee Evans' }, record: PIZZA },
    { contact: { id: 65, name: 'Eli Fox' }, record: TACO_WEST },
  ],
};

/** GET /surveys/ (Logged scores): one logged by hand, one a send wrote. */
export const LOGGED: Survey[] = [
  { id: 1, survey_type: 'nps', survey_type_display: 'NPS', status: 'responded', status_display: 'Responded', score: 40, sent_at: '2026-09-20', responded_at: '2026-09-22', companies: [{ id: 6, name: 'Shopify' }], account_id: null, account_name: null, created_at: '2026-09-20T12:00:00Z', send_id: null },
  { id: 2, survey_type: 'nps', survey_type_display: 'NPS', status: 'responded', status_display: 'Responded', score: 33, sent_at: '2026-10-03', responded_at: '2026-10-04', companies: [{ id: 7, name: 'Pizza Hut' }], account_id: null, account_name: null, created_at: '2026-10-03T12:00:00Z', send_id: 3 },
];

const LOW: Record<SurveyType, number> = { nps: 6, csat: 2, ces: 3 };
const HIGH: Record<SurveyType, number> = { nps: 9, csat: 4, ces: 5 };
const NOT_OWNER = { detail: "Only the survey's owner can change it." };
const NOT_SEGMENT_OWNER = { detail: 'You can only survey your own segments.' };
const LOCKED = 'A sent survey can only be renamed or re-shared.';
const AFTER_SEND = ['name', 'sharing', 'shared_with'];
const WRITABLE = ['name', 'survey_type', 'subject', 'intro', 'roles', 'sharing'] as const;

/** Half away from zero, as the backend's ROUND_HALF_UP. */
const whole = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

export function bandOf(type: SurveyType, score: number): BandName {
  const [low, mid, high] = BANDS[type];
  if (score <= LOW[type]) return low;
  if (score >= HIGH[type]) return high;
  return mid;
}

/** The type's figure over `scores` (spec Decisions, "Scores"), or null. */
export function figureOf(type: SurveyType, scores: number[]): number | null {
  if (scores.length === 0) return null;
  const high = scores.filter((score) => score >= HIGH[type]).length;
  const low = type === 'nps' ? scores.filter((score) => score <= LOW[type]).length : 0;
  return whole(((high - low) * 100) / scores.length);
}

/** The summary as the backend's `send_summary`: every non-failed invite for
 *  the owner, only visible ones for anyone else. */
function summaryOf(send: StoredSend, invites: StubInvite[]) {
  const pool = invites.filter((invite) => invite.send === send.id && invite.state !== 'failed' && (send.is_owner || invite.visible));
  const scores = pool.filter((invite) => invite.state === 'answered').map((invite) => invite.score as number);
  const bands: Partial<Record<BandName, number>> = Object.fromEntries(BANDS[send.survey_type].map((band) => [band, 0]));
  for (const score of scores) {
    const band = bandOf(send.survey_type, score);
    bands[band] = (bands[band] ?? 0) + 1;
  }
  return {
    sent: pool.length,
    answered: scores.length,
    rate: pool.length > 0 ? whole((scores.length * 100) / pool.length) : null,
    figure: figureOf(send.survey_type, scores),
    bands,
  };
}

/** A send as GET /surveys/sends/<id>/ returns it to ME. */
export function sendPayload(send: StoredSend, invites: StubInvite[] = INVITES): SurveySend {
  return { ...send, counts: send.is_owner ? send.counts : null, summary: summaryOf(send, invites) };
}

/** Readable to ME, as the backend's `readable_sends`. */
const readable = (send: StoredSend) => send.is_owner || send.sharing === 'workspace' || (send.sharing === 'people' && send.shared_with.some((person) => person.id === ME.id));

const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((person) => person.id === id).map(({ id: pk, name }) => ({ id: pk, name })));

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

export interface SurveysStub {
  sends?: StoredSend[];
  invites?: StubInvite[];
  logged?: Survey[];
  /** Answers a page holds (default 50, the backend's PAGE_SIZE). */
  pageSize?: number;
  list?: () => Answer;
  /** GET /surveys/sends/<id>/: an answer overrides the default; undefined falls through. */
  read?: (id: number) => Answer | undefined;
  /** DELETE /surveys/sends/<id>/ (default: the owner's delete of a draft). */
  remove?: (id: number) => Answer;
  create?: (body: Record<string, unknown>) => Answer;
  patch?: (id: number, body: Record<string, unknown>) => Answer;
  audience?: (body: AudienceRequest) => Answer;
  sendNow?: (id: number) => Answer;
  /** POST send/ refuses with NO_EMAIL (400), as a workspace without email does. */
  noEmail?: boolean;
  /** GET answers/: an answer overrides the default; undefined falls through. */
  answers?: (id: number, query: URLSearchParams) => Answer | undefined;
  pending?: (id: number) => Answer;
  /** GET/POST /public/surveys/<token>/: undefined falls through. */
  publicLink?: (token: string, method: string, body: Record<string, unknown>) => Answer | undefined;
  /** Passed to stubSegments for everything this stub does not own. */
  segments?: SegmentsStub;
}

export function stubSurveys(stub: SurveysStub = {}) {
  const sends: StoredSend[] = (stub.sends ?? SENDS).map((send) => ({ ...send }));
  const invites: StubInvite[] = (stub.invites ?? INVITES).map((invite) => ({ ...invite }));
  const logged: Survey[] = (stub.logged ?? LOGGED).map((row) => ({ ...row }));
  const pageSize = stub.pageSize ?? 50;
  const segmentsFetch = stubSegments(stub.segments);
  let nextId = 100;
  let nextInvite = 500;

  const payload = (send: StoredSend) => sendPayload(send, invites);
  const row = (send: StoredSend): SendListRow => {
    const summary = summaryOf(send, invites);
    return {
      id: send.id,
      name: send.name,
      survey_type: send.survey_type,
      status: send.status,
      segment: send.segment,
      owner: send.owner,
      is_owner: send.is_owner,
      sharing: send.sharing,
      sent_at: send.sent_at,
      sent: summary.sent,
      answered: summary.answered,
      rate: summary.rate,
      updated_at: send.updated_at,
    };
  };

  /** `owned_segment` and `clean_roles`: 404 for a segment ME can't read,
   *  403 for one ME doesn't own, roles for an organisation or account one. */
  const checkSegment = (segmentId: unknown, roles: unknown): Answer | SegmentRef => {
    const segment = SEGMENTS.find((candidate) => candidate.id === segmentId);
    if (!segment) return { status: 404, body: { detail: 'Not found.' } };
    if (!segment.is_owner) return { status: 403, body: NOT_SEGMENT_OWNER };
    if (segment.kind !== 'contact' && (!Array.isArray(roles) || roles.length === 0)) return { status: 400, body: { roles: ['Choose at least one role.'] } };
    return { id: segment.id, name: segment.name, kind: segment.kind };
  };
  const refused = (value: Answer | SegmentRef): value is Answer => 'status' in value;

  /** A create or PATCH body, as the backend's SendWriteSerializer: segment
   *  and roles checked together; people only with "people". */
  const write = (send: StoredSend, data: Record<string, unknown>): Answer | null => {
    for (const key of ['name', 'subject']) {
      if (key in data && !String(data[key] ?? '').trim()) return { status: 400, body: { [key]: ['This field may not be blank.'] } };
    }
    let segment = send.segment;
    let roles = 'roles' in data ? data.roles : send.roles;
    if ('segment' in data || 'roles' in data) {
      const segmentId = 'segment' in data ? data.segment : (send.segment?.id ?? null);
      if (segmentId === null || segmentId === undefined) {
        segment = null;
      } else {
        const checked = checkSegment(segmentId, roles);
        if (refused(checked)) return checked;
        segment = checked;
        if (checked.kind === 'contact') roles = [];
      }
    }
    const sharing = (data.sharing ?? send.sharing) as StoredSend['sharing'];
    const people = 'shared_with' in data ? teammates(data.shared_with) : send.shared_with;
    if (sharing === 'people' && people.length === 0) return { status: 400, body: { shared_with: ['Choose at least one teammate.'] } };
    const target = send as unknown as Record<string, unknown>;
    for (const key of WRITABLE) if (key in data) target[key] = data[key];
    send.roles = roles as StoredSend['roles'];
    send.segment = segment;
    send.shared_with = sharing === 'people' ? people : [];
    send.updated_at = NOW;
    return null;
  };

  /** One log row per (send, record), its score the send's figure there. */
  const upsertLog = (send: StoredSend, record: RecordRef) => {
    const scores = invites
      .filter((i) => i.send === send.id && i.state === 'answered' && i.record.kind === record.kind && i.record.id === record.id)
      .map((i) => i.score as number);
    const account = record.kind === 'account';
    const fields = { score: figureOf(send.survey_type, scores), responded_at: NOW.slice(0, 10) };
    const existing = logged.find(
      (r) => r.send_id === send.id && (account ? r.account_id === record.id : r.account_id === null && r.companies.some((c) => c.id === record.id)),
    );
    if (existing) {
      Object.assign(existing, fields);
      return;
    }
    logged.push({
      id: 900 + logged.length,
      survey_type: send.survey_type,
      survey_type_display: TYPE_LABEL[send.survey_type],
      status: 'responded',
      status_display: 'Responded',
      sent_at: (send.sent_at ?? NOW).slice(0, 10),
      companies: account ? [] : [{ id: record.id, name: record.name }],
      account_id: account ? record.id : null,
      account_name: account ? record.name : null,
      created_at: NOW,
      send_id: send.id,
      ...fields,
    });
  };

  const byName = (a: StubInvite, b: StubInvite) => {
    if (a.contact && b.contact) return a.contact.name.localeCompare(b.contact.name) || a.id - b.id;
    if (a.contact) return -1;
    if (b.contact) return 1;
    return a.id - b.id;
  };

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    const link = /^\/public\/surveys\/([^/]+)\/$/.exec(path);
    if (link) {
      const token = decodeURIComponent(link[1]);
      const override = stub.publicLink?.(token, method, body);
      if (override) return reply(override);
      const invite = invites.find((candidate) => candidate.token === token && candidate.state === 'pending');
      if (!invite) return json(404, EXPIRED);
      const send = sends.find((candidate) => candidate.id === invite.send) as StoredSend;
      if (method === 'GET') {
        return json(200, { survey_type: send.survey_type, question: questionFor(send.survey_type, WORKSPACE), intro: send.intro, organisation_name: WORKSPACE });
      }
      const [low, high] = SCALES[send.survey_type];
      const score = body.score;
      if (typeof score !== 'number' || !Number.isInteger(score) || score < low || score > high) {
        return json(400, { score: [`Choose a score from ${low} to ${high}.`] });
      }
      const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
      if (comment.length > 2000) return json(400, { comment: ['Ensure this field has no more than 2000 characters.'] });
      Object.assign(invite, { state: 'answered', score, comment, answered_at: NOW });
      upsertLog(send, invite.record);
      return json(204, null);
    }

    if (path === '/surveys/sends/' && method === 'GET') {
      if (stub.list) return reply(stub.list());
      const rows = sends
        .filter(readable)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .map(row);
      return json(200, rows);
    }
    if (path === '/surveys/sends/' && method === 'POST') {
      if (stub.create) return reply(stub.create(body));
      const draft: StoredSend = { ...BASE, id: 0, name: '', survey_type: 'nps', subject: '', segment: null, roles: [], status: 'draft', sharing: 'private', owner: ME, is_owner: true, created_at: NOW, updated_at: NOW };
      const refusal = write(draft, { name: '', subject: '', ...body });
      if (refusal) return reply(refusal);
      draft.id = nextId++;
      sends.push(draft);
      return json(201, payload(draft));
    }
    if (path === '/surveys/sends/audience/' && method === 'POST') {
      if (stub.audience) return reply(stub.audience(body as unknown as AudienceRequest));
      const checked = checkSegment(body.segment, body.roles);
      if (refused(checked)) return reply(checked);
      const empty: AudienceCounts = { audience: 0, organisations: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 };
      return json(200, AUDIENCES[checked.id as number] ?? empty);
    }

    const found = /^\/surveys\/sends\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const send = sends.find((candidate) => candidate.id === id);
      // Unreadable reads the same as missing, on every sub-path.
      if (!send || !readable(send)) return json(404, { detail: 'Not found.' });
      if (rest === '' && method === 'GET') {
        const override = stub.read?.(id);
        return override ? reply(override) : json(200, payload(send));
      }
      if (rest === '' && method === 'PATCH') {
        if (stub.patch) return reply(stub.patch(id, body));
        if (!send.is_owner) return json(403, NOT_OWNER);
        if (send.status !== 'draft') {
          const locked = Object.keys(body).filter((key) => !AFTER_SEND.includes(key)).sort();
          if (locked.length > 0) return json(400, Object.fromEntries(locked.map((key) => [key, [LOCKED]])));
        }
        const refusal = write(send, body);
        return refusal ? reply(refusal) : json(200, payload(send));
      }
      if (rest === '' && method === 'DELETE') {
        if (stub.remove) return reply(stub.remove(id));
        if (!send.is_owner) return json(403, NOT_OWNER);
        if (send.status !== 'draft') return json(409, { detail: "Only a draft can be deleted; a sent survey's answers feed the scores." });
        sends.splice(sends.indexOf(send), 1);
        return json(204, null);
      }
      if (rest === 'send/' && method === 'POST') {
        if (stub.sendNow) return reply(stub.sendNow(id));
        if (!send.is_owner) return json(403, NOT_OWNER);
        // SendNowView: get_owned, then email_is_set_up, then the claim's 409s.
        if (stub.noEmail) return json(400, NO_EMAIL);
        if (send.status === 'sent') return json(409, { detail: 'This survey has already been sent.' });
        if (send.status === 'sending') return json(409, { detail: 'This survey is being sent.' });
        if (send.segment === null) return json(400, { segment: ['Choose a segment.'] });
        const checked = checkSegment(send.segment.id, send.roles);
        if (refused(checked)) return reply(checked);
        const people = PEOPLE[checked.id as number] ?? [];
        if (people.length === 0) return json(400, { segment: ['Nobody to send to.'] });
        people.forEach((person, n) => {
          invites.push({ ...INVITE, id: nextInvite++, send: id, token: `tok-${id}-${n}`, contact: person.contact, record: person.record, state: 'pending', expires_at: '2026-10-18T14:00:00Z' });
        });
        const counted = AUDIENCES[checked.id as number];
        Object.assign(send, {
          status: 'sent',
          started_at: NOW,
          sent_at: NOW,
          updated_at: NOW,
          counts: { audience: people.length, sent: people.length, failed: 0, skipped_recent: counted?.skipped_recent ?? 0, skipped_no_email: counted?.skipped_no_email ?? 0, skipped_cap: counted?.skipped_cap ?? 0 },
        });
        return json(200, payload(send));
      }
      if (rest === 'answers/' && method === 'GET') {
        const override = stub.answers?.(id, url.searchParams);
        if (override) return reply(override);
        const asked = url.searchParams.get('filter') ?? '';
        const filter = ['all', 'detractors', 'comments'].includes(asked) ? asked : 'all';
        const answered = invites.filter((i) => i.send === id && i.state === 'answered');
        const matching = answered
          .filter((i) => filter !== 'detractors' || (i.score as number) <= LOW[send.survey_type])
          .filter((i) => filter !== 'comments' || i.comment !== '')
          .sort((a, b) => (b.answered_at as string).localeCompare(a.answered_at as string) || b.id - a.id);
        const seen = matching.filter((i) => i.visible);
        const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
        const page = seen.slice(start, start + pageSize);
        return json(200, {
          filter,
          results: page.map((i) => ({ id: i.id, contact: i.contact, record: i.record, score: i.score, band: bandOf(send.survey_type, i.score as number), comment: i.comment, answered_at: i.answered_at })),
          next_cursor: start + pageSize < seen.length ? String(start + pageSize) : null,
          // One count of answered invites ME can't open, the same whichever
          // filter is asked for (backend Decision 20): never scoped to the
          // filter's own criteria, only to visibility.
          hidden_count: answered.filter((i) => !i.visible).length,
        });
      }
      if (rest === 'pending/' && method === 'GET') {
        if (stub.pending) return reply(stub.pending(id));
        const waiting = invites.filter((i) => i.send === id && i.state !== 'answered');
        const seen = waiting.filter((i) => i.visible).sort(byName);
        return json(200, {
          results: seen.map((i) => ({ id: i.id, contact: i.contact, record: i.record, status: i.state as PendingStatus, expires_at: i.expires_at, failure: i.failure })),
          hidden_count: waiting.length - seen.length,
        });
      }
    }

    if (path === '/surveys/' && method === 'GET') {
      const customer = Number(url.searchParams.get('customer'));
      return json(200, customer ? logged.filter((r) => r.companies.some((c) => c.id === customer)) : logged);
    }
    return segmentsFetch(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return {
    spy,
    tokensOf: (sendId: number) => invites.filter((invite) => invite.send === sendId).map((invite) => invite.token),
    /** A send made elsewhere (a rule's approved survey, testRules.ts). */
    addSend: (send: StoredSend) => {
      sends.push({ ...send });
    },
  };
}

export type SurveysSpy = ReturnType<typeof stubSurveys>['spy'];

/** Every `method` request whose path (without /api/v1) matches `pattern`,
 *  oldest first, with its query and JSON body. */
export function requestsOf(spy: { mock: { calls: [RequestInfo | URL, RequestInit?][] } }, method: string, pattern: RegExp) {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), init }))
    .filter(({ url, init }) => (init?.method ?? 'GET') === method && pattern.test(url.pathname.replace(/^\/api\/v1/, '')))
    .map(({ url, init }) => ({
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
}
