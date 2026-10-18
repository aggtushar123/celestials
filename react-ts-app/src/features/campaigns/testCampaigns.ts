// Test-only: one fetch stub for every endpoint the Campaigns pages, the
// unsubscribe page and a rule's campaign read (spec §4). It keeps state: a
// send resolves the segment, skips in §1.3's order and makes tokens; an
// unsubscribe marks the contact. Paths it does not own fall through to
// stubPlans (then stubRules, stubSurveys, stubSegments).
import { vi } from 'vitest';
import { stubPlans, type PlansStub } from '../plans/testPlans';
import type { RulesStub } from '../rules/testRules';
import type { CampaignReview } from '../rules/ruleTypes';
import type { PersonRef } from '../segments/segmentTypes';
import { ME, SEGMENTS, TEAM } from '../segments/testSegments';
import { GAP_DAYS, MERGE_FIELDS, NAME_MAX, PEOPLE_MAX, SAY } from './campaignOptions';
import { NO_SKIPS, skippedTotal } from './campaignText';
import type { Audience, Campaign, CampaignRow, CampaignSend, Delivery, SegmentRef, SkipReason } from './campaignTypes';
import {
  CAMPAIGNS,
  DELIVERIES,
  NOW,
  SEGMENT_PEOPLE,
  SENDS,
  UNSUBSCRIBED,
  WORKSPACE,
  type Person,
  type StoredCampaign,
  type StoredDelivery,
  type StoredSend,
} from './testCampaignFixtures';

type Answer = { status: number; body: unknown };

export interface CampaignsStub {
  campaigns?: StoredCampaign[];
  sends?: StoredSend[];
  deliveries?: StoredDelivery[];
  people?: Record<number, Person[]>;
  unsubscribed?: number[];
  /** Rows a page holds: campaigns and deliveries default to 50, sends to 20 (Contract note 5). */
  pageSize?: number;
  /** How many list reads fail (500) before they succeed. */
  failList?: number;
  /** POST sends/ refuses with EMAIL_NOT_SET_UP, as a workspace without SMTP does. */
  noEmail?: boolean;
  /** POST sends/ refuses with OWNER_INACTIVE, as for a deactivated owner.
   *  Like `noEmail`, read at each request, so a test may flip it. */
  ownerInactive?: boolean;
  /** GET reads of a `sending` send before it reads `sent`. */
  stillSending?: number;
  /** 400 once ME owns this many (default 50). */
  limit?: number;
  /** The public pair answers 429. */
  throttle?: boolean;
  /** POST preview/: an answer overrides the default; undefined falls through. */
  preview?: (id: number, body: Record<string, unknown>) => Answer | undefined;
  rules?: RulesStub;
  plans?: PlansStub;
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) });
const NOT_FOUND: Answer = { status: 404, body: { detail: 'Not found.' } };
/** Backend plan (controller ruling, pre-flight F2): a missing or unreadable
 *  segment id is the write serializer's own-segment check, a 400 field
 *  error - the same words for "not mine" and "doesn't exist" - never a 404. */
const OWN_SEGMENT = 'Choose one of your own segments.';
/** Backend plan contract note 3: `preview/`'s own-field refusal for a
 *  `contact` outside the campaign's current audience. */
const NOT_IN_AUDIENCE = 'Choose someone this campaign would email.';
/** Backend plan contract note 11: `PATCH {status}` accepts only these two. */
const CHOOSE_STATUS = 'Choose archived or active.';
/** Backend plan contract note 7: every bad unsubscribe link - unknown,
 *  malformed, or older than 365 days - reads the same, never the generic
 *  "Not found." the rest of the API uses. */
const EXPIRED: Answer = { status: 404, body: { detail: 'This link has expired.' } };
const TOKEN = /\{([^{}]*)\}/g;
const unknownField = (text: string) => [...text.matchAll(TOKEN)].some((match) => !(MERGE_FIELDS as readonly string[]).includes(match[1]));
const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((one) => one.id === id && one.is_active).map(({ id: pk, name }) => ({ id: pk, name })));
const daysBefore = (iso: string, days: number) => new Date(new Date(iso).getTime() - days * 86400000).toISOString();

export function stubCampaigns(stub: CampaignsStub = {}) {
  const campaigns = (stub.campaigns ?? CAMPAIGNS).map((one) => ({ ...one, legacy: [...one.legacy], shared_with: [...one.shared_with] }));
  const sends = (stub.sends ?? SENDS).map((one) => ({ ...one }));
  const deliveries = (stub.deliveries ?? DELIVERIES).map((one) => ({ ...one }));
  const people: Record<number, Person[]> = Object.fromEntries(Object.entries(stub.people ?? SEGMENT_PEOPLE).map(([id, list]) => [id, [...list]]));
  const unsubscribed = new Set(stub.unsubscribed ?? UNSUBSCRIBED);
  const pageSize = stub.pageSize ?? 50;
  const sendsPageSize = stub.pageSize ?? 20;
  const limit = stub.limit ?? 50;
  let listFailures = stub.failList ?? 0;
  const stillSending = new Map<number, number>();
  let nextCampaign = 100;
  let nextSend = 500;
  let nextDelivery = 5000;

  const readable = (one: StoredCampaign) => one.is_owner || one.sharing === 'workspace' || (one.sharing === 'people' && one.shared_with.some((p) => p.id === ME.id));
  const sendsOf = (id: number) => sends.filter((one) => one.campaign === id).sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id - a.id);
  const row = (one: StoredCampaign): CampaignRow => {
    const last = sendsOf(one.id)[0];
    return {
      id: one.id,
      name: one.name,
      status: one.status,
      segment: one.segment,
      roles: one.roles,
      owner: one.owner,
      is_owner: one.is_owner,
      sharing: one.sharing,
      shared_with: one.sharing === 'people' ? one.shared_with : [],
      last_send: last ? { id: last.id, finished_at: last.finished_at, status: last.status, counts: last.counts } : null,
      needs_segment: one.status === 'draft' && one.segment === null && one.legacy.length > 0,
      updated_at: one.updated_at,
      made_by: one.made_by ?? null,
    };
  };
  const payload = (one: StoredCampaign): Campaign => ({
    ...row(one),
    subject: one.subject,
    body: one.body,
    legacy_recipients: one.legacy.filter((p) => p.visible).map(({ id, name }) => ({ id, name })),
    legacy_hidden: one.legacy.filter((p) => !p.visible).length,
    can_delete: one.is_owner && sendsOf(one.id).length === 0,
  });
  const sendOut = ({ campaign: campaignId, ...rest }: StoredSend): CampaignSend => {
    void campaignId;
    return rest;
  };
  /** A cursor is base64 of the start index. */
  const paged = <T,>(items: T[], cursor: string | null, size = pageSize) => {
    const start = cursor ? Number(atob(cursor)) || 0 : 0;
    const next = start + size < items.length ? btoa(String(start + size)) : null;
    return { results: items.slice(start, start + size), next };
  };

  /** The segment as §4's ref: only ME's own (the backend's owned_segment).
   *  A missing id and someone else's segment answer the same (controller
   *  ruling, pre-flight F2): a 400 field error, not a 404. */
  const segmentRef = (id: unknown): SegmentRef | Answer => {
    const found = SEGMENTS.find((segment) => segment.id === id && segment.is_owner);
    if (!found) return { status: 400, body: { segment: [OWN_SEGMENT] } };
    return { id: found.id, name: found.name, kind: found.kind === 'customer' ? 'organization' : found.kind };
  };
  const isAnswer = (value: unknown): value is Answer => typeof value === 'object' && value !== null && 'status' in value && 'body' in value;

  /** The write serializer, in brief: checks, then stores what was sent. */
  const write = (one: StoredCampaign, data: Record<string, unknown>): Answer | null => {
    if ('name' in data) {
      const name = String(data.name ?? '').trim();
      if (!name) return { status: 400, body: { name: [SAY.NO_NAME] } };
      if (name.length > NAME_MAX) return { status: 400, body: { name: [SAY.LONG_NAME] } };
    }
    for (const key of ['subject', 'body'] as const) {
      if (key in data && unknownField(String(data[key] ?? ''))) return { status: 400, body: { [key]: [SAY.MERGE] } };
    }
    let segment = one.segment;
    if ('segment' in data) {
      if (data.segment === null) segment = null;
      else {
        const ref = segmentRef(data.segment);
        if (isAnswer(ref)) return ref;
        segment = ref;
      }
    }
    const roles = ('roles' in data ? data.roles : one.roles) as StoredCampaign['roles'];
    if (segment && segment.kind !== 'contact' && roles.length === 0) return { status: 400, body: { roles: ['Choose at least one role.'] } };
    const sharing = (data.sharing ?? one.sharing) as StoredCampaign['sharing'];
    const shared = 'shared_with' in data ? teammates(data.shared_with) : one.shared_with;
    if (sharing === 'people' && shared.length === 0) return { status: 400, body: { shared_with: ['Choose at least one teammate.'] } };
    if ('name' in data) one.name = String(data.name).trim();
    // DRF trims the subject; the body keeps its whitespace (trim_whitespace=False).
    if ('subject' in data) one.subject = String(data.subject).trim();
    if ('body' in data) one.body = String(data.body);
    one.segment = segment;
    one.roles = segment && segment.kind !== 'contact' ? roles : [];
    one.sharing = sharing;
    one.shared_with = sharing === 'people' ? shared : [];
    one.updated_at = NOW;
    return null;
  };

  /** §1.3: everyone the segment reaches, each skipped by the first rule that matches. */
  const resolve = (one: StoredCampaign) => {
    const queued: Person[] = [];
    const skipped: { who: Person; reason: SkipReason }[] = [];
    const since = daysBefore(NOW, GAP_DAYS);
    for (const who of one.segment && one.segment.id !== null ? (people[one.segment.id] ?? []) : []) {
      const sentTo = deliveries.filter((d) => d.contact.id === who.contact.id && d.status === 'sent');
      let reason: SkipReason | null = null;
      if (unsubscribed.has(who.contact.id)) reason = 'unsubscribed';
      else if (!who.email) reason = 'no_email';
      else if (sentTo.some((d) => sends.find((s) => s.id === d.send)?.campaign === one.id)) reason = 'already_received';
      else if (sentTo.some((d) => (d.sent_at ?? '') >= since)) reason = 'recent_campaign';
      else if (queued.length >= PEOPLE_MAX) reason = 'over_limit';
      if (reason) skipped.push({ who, reason });
      else queued.push(who);
    }
    return { queued, skipped };
  };
  const audienceOf = (one: StoredCampaign): Audience => {
    const { queued, skipped } = resolve(one);
    const tally = { ...NO_SKIPS };
    for (const { reason } of skipped) tally[reason] += 1;
    return { reach: queued.length, skipped: tally, sample: queued.filter((who) => who.visible).slice(0, 20).map((who) => who.contact) };
  };
  const render = (text: string, who: Person, owner: PersonRef) =>
    text
      .replace(/\{first_name\}/g, who.contact.name.split(' ')[0] || 'there')
      .replace(/\{organisation\}/g, who.record?.name ?? '')
      .replace(/\{sender_name\}/g, owner.name);

  /** §1.4: claim and deliver in one go; `stillSending` keeps it at sending for a few reads. */
  const claim = (one: StoredCampaign, extra: Pick<CampaignSend, 'kind' | 'sent_by' | 'rule'>): StoredSend => {
    const { queued, skipped } = resolve(one);
    const id = nextSend++;
    for (const who of queued) {
      deliveries.push({ id: nextDelivery++, send: id, status: 'sent', reason: '', contact: who.contact, record: who.record, sent_at: NOW, visible: who.visible, token: `tok-${id}-${who.contact.id}` });
    }
    for (const { who, reason } of skipped) {
      deliveries.push({ id: nextDelivery++, send: id, status: 'skipped', reason, contact: who.contact, record: who.record, sent_at: null, visible: who.visible, token: null });
    }
    const tally = { ...NO_SKIPS };
    for (const { reason } of skipped) tally[reason] += 1;
    const sending = (stub.stillSending ?? 0) > 0;
    if (sending) stillSending.set(id, stub.stillSending ?? 0);
    const made: StoredSend = {
      id,
      campaign: one.id,
      migrated: false,
      status: sending ? 'sending' : 'sent',
      started_at: NOW,
      finished_at: sending ? null : NOW,
      subject: one.subject,
      body: one.body,
      counts: { reached: queued.length + skippedTotal(tally), sent: queued.length, skipped: tally },
      ...extra,
    };
    sends.push(made);
    one.status = 'active';
    one.updated_at = NOW;
    return made;
  };

  /** The Rules stub's approval (with or without review) lands here. */
  const onCampaignApproved = (review: CampaignReview, by: PersonRef | null): number => {
    const one = campaigns.find((candidate) => candidate.id === review.campaign?.id);
    if (!one) return nextSend++;
    return claim(one, { kind: 'rule', sent_by: by, rule: { id: review.rule.id, name: review.rule.name } }).id;
  };
  const plans = stubPlans({ ...stub.plans, rules: { ...stub.rules, onCampaignApproved } });

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    const link = /^\/campaigns\/unsubscribe\/([^/]+)\/$/.exec(path);
    if (link) {
      if (stub.throttle) return json(429, { detail: 'Request was throttled.' });
      const token = decodeURIComponent(link[1]);
      const found = deliveries.find((d) => d.token === token);
      if (!found) return reply(EXPIRED);
      if (method === 'GET') return json(200, { workspace: WORKSPACE });
      unsubscribed.add(found.contact.id);
      return json(204, null);
    }

    if (path === '/campaigns/' && method === 'GET') {
      if (listFailures > 0) {
        listFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      const tab = url.searchParams.get('tab') === 'shared' ? 'shared' : 'mine';
      const archived = url.searchParams.get('archived') === '1';
      const rows = campaigns
        .filter(readable)
        .filter((one) => (tab === 'mine' ? one.is_owner : !one.is_owner))
        .filter((one) => archived || one.status !== 'archived')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        .map(row);
      return json(200, paged(rows, url.searchParams.get('cursor')));
    }
    if (path === '/campaigns/' && method === 'POST') {
      if (campaigns.filter((one) => one.is_owner).length >= limit) return json(400, { non_field_errors: [SAY.LIMIT] });
      const made: StoredCampaign = {
        id: 0, name: '', status: 'draft', segment: null, roles: [], owner: ME, is_owner: true, sharing: 'private', shared_with: [], legacy: [], subject: '', body: '', updated_at: NOW,
      };
      const refusal = write(made, { name: '', ...body });
      if (refusal) return reply(refusal);
      made.id = nextCampaign++;
      campaigns.push(made);
      return json(201, payload(made));
    }

    const found = /^\/campaigns\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const one = campaigns.find((candidate) => candidate.id === id);
      // Unreadable reads the same as missing, on every sub-path.
      if (!one || !readable(one)) return reply(NOT_FOUND);
      const ownerOnly = !one.is_owner ? json(403, { detail: SAY.NOT_OWNER }) : null;
      if (rest === '' && method === 'GET') return json(200, payload(one));
      if (rest === '' && method === 'PATCH') {
        if (ownerOnly) return ownerOnly;
        const { status, ...fields } = body;
        if (status !== undefined && status !== 'archived' && status !== 'active') return json(400, { status: [CHOOSE_STATUS] });
        const refusal = write(one, fields);
        if (refusal) return reply(refusal);
        if (status === 'archived') one.status = 'archived';
        if (status === 'active') one.status = sendsOf(one.id).length > 0 ? 'active' : 'draft';
        return json(200, payload(one));
      }
      if (rest === '' && method === 'DELETE') {
        if (ownerOnly) return ownerOnly;
        if (sendsOf(one.id).length > 0) return json(409, { code: 'CAMPAIGN_SENT', detail: SAY.CAMPAIGN_SENT });
        campaigns.splice(campaigns.indexOf(one), 1);
        return json(204, null);
      }
      if (rest === 'audience/' && method === 'GET') {
        if (ownerOnly) return ownerOnly;
        if (!one.segment) return json(400, { detail: SAY.CHOOSE_SEGMENT });
        return json(200, audienceOf(one));
      }
      if (rest === 'preview/' && method === 'POST') {
        if (ownerOnly) return ownerOnly;
        const override = stub.preview?.(id, body);
        if (override) return reply(override);
        const subject = typeof body.subject === 'string' ? body.subject : one.subject;
        const text = typeof body.body === 'string' ? body.body : one.body;
        if (unknownField(subject)) return json(400, { subject: [SAY.MERGE] });
        if (unknownField(text)) return json(400, { body: [SAY.MERGE] });
        if (!one.segment) return json(400, { detail: SAY.CHOOSE_SEGMENT });
        // The backend's order: someone asked for is checked first, so one
        // outside an empty audience is NOT_IN_AUDIENCE, not NOBODY.
        const { queued } = resolve(one);
        let who: Person | undefined;
        if (typeof body.contact === 'number') {
          who = queued.find((p) => p.contact.id === body.contact);
          if (!who) return json(400, { contact: [NOT_IN_AUDIENCE] });
        } else if (queued.length > 0) who = queued[0];
        else return json(400, { detail: SAY.NOBODY });
        const footer = `\n\n—\n${one.owner.name}, ${WORKSPACE}\nUnsubscribe from these emails: https://app.revenact.example/u/preview`;
        // rendering.render: the subject kept to one line, whitespace collapsed.
        const line = render(subject, who, one.owner).split(/\s+/).filter(Boolean).join(' ');
        return json(200, { subject: line, body: `${render(text, who, one.owner)}${footer}` });
      }
      if (rest === 'sends/' && method === 'GET') return json(200, paged(sendsOf(id).map(sendOut), url.searchParams.get('cursor'), sendsPageSize));
      if (rest === 'sends/' && method === 'POST') {
        if (ownerOnly) return ownerOnly;
        if (stub.noEmail) return json(400, { detail: SAY.EMAIL_NOT_SET_UP });
        if (one.status === 'archived') return json(400, { detail: SAY.ARCHIVED });
        if (stub.ownerInactive) return json(400, { detail: SAY.OWNER_INACTIVE });
        if (!one.segment) return json(400, { detail: SAY.CHOOSE_SEGMENT });
        if (!one.subject.trim() || !one.body.trim()) return json(400, { detail: SAY.NO_CONTENT });
        if (resolve(one).queued.length === 0) return json(400, { detail: SAY.NOBODY });
        return json(201, sendOut(claim(one, { kind: 'manual', sent_by: ME, rule: null })));
      }
      const oneSend = /^sends\/(\d+)\/(deliveries\/)?$/.exec(rest);
      if (oneSend && method === 'GET') {
        const send = sends.find((candidate) => candidate.id === Number(oneSend[1]) && candidate.campaign === id);
        if (!send) return reply(NOT_FOUND);
        if (!oneSend[2]) {
          // A fixture already at `sending` (SENDING_SEND) counts down from `stillSending` too.
          const left = stillSending.get(send.id) ?? (send.status === 'sending' ? (stub.stillSending ?? 0) : undefined);
          if (left !== undefined) {
            if (left <= 0) {
              stillSending.delete(send.id);
              Object.assign(send, { status: 'sent', finished_at: NOW });
              // Same moment the real minute runner would finish them.
              deliveries.filter((d) => d.send === send.id && d.status === 'queued').forEach((d) => Object.assign(d, { status: 'sent', sent_at: NOW }));
            } else stillSending.set(send.id, left - 1);
          }
          return json(200, sendOut(send));
        }
        const status = url.searchParams.get('status');
        const reason = url.searchParams.get('reason');
        const matching = deliveries
          .filter((d) => d.send === send.id)
          .filter((d) => !status || d.status === status)
          .filter((d) => !reason || d.reason === reason)
          .sort((a, b) => a.id - b.id);
        const seen = matching.filter((d) => d.visible).map(({ send: owner, visible, token, ...rest2 }): Delivery => {
          void owner;
          void visible;
          void token;
          return rest2;
        });
        return json(200, { ...paged(seen, url.searchParams.get('cursor')), hidden: matching.length - seen.length });
      }
    }
    return plans.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return {
    spy,
    /** The tokens a send's emails carried, by contact. */
    tokensOf: (sendId: number) => deliveries.filter((d) => d.send === sendId && d.token).map((d) => ({ contact: d.contact.id, token: d.token as string })),
    /** Someone joins a segment between two sends. */
    addPerson: (segmentId: number, who: Person) => {
      (people[segmentId] ??= []).push(who);
    },
    runNight: plans.runNight,
  };
}
