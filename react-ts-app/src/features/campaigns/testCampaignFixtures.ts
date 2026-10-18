// Test-only: campaigns, sends, deliveries and the people each segment
// reaches, in the contract's shapes (spec §4). Kept apart from the stub so
// the Rules stub can read campaign refs without importing stubCampaigns
// (which wraps it). The viewer is ME (Alice, id 1) of "Acme Inc".
import type { SegmentKind } from '../segments/segmentTypes';
import { CARL, DANA, ME } from '../segments/testSegments';
import { NO_SKIPS, segmentKindOf, skippedTotal } from './campaignText';
import type { Campaign, CampaignSend, Counts, Delivery, Skipped } from './campaignTypes';

export const NOW = '2026-10-04T12:00:00Z';
export const WORKSPACE = 'Acme Inc';
export const RENEWAL_REF = { id: 7, name: 'Renewal risk', kind: 'organization' as const };
export const EMEA_REF = { id: 8, name: 'EMEA accounts', kind: 'account' as const };
export const CHAMPIONS_REF = { id: 9, name: 'Champions', kind: 'contact' as const };

/** A campaign as the stub keeps it; the row fields are computed per read. */
export interface StoredCampaign extends Omit<Campaign, 'last_send' | 'needs_segment' | 'legacy_recipients' | 'legacy_hidden' | 'can_delete'> {
  legacy: { id: number; name: string; visible: boolean }[];
}
export interface StoredSend extends CampaignSend {
  campaign: number;
}
/** `visible`: ME may open the contact. The backend stores only a token's
 *  hash; the stub keeps the token so a test can open /u/:token. */
export interface StoredDelivery extends Delivery {
  send: number;
  visible: boolean;
  token: string | null;
}
export interface Person {
  contact: { id: number; name: string };
  record: Delivery['record'];
  email: boolean;
  visible: boolean;
}

export function counts(sent: number, skipped: Partial<Skipped>): Counts {
  const all = { ...NO_SKIPS, ...skipped };
  return { reached: sent + skippedTotal(all), sent, skipped: all };
}

const BASE: Pick<StoredCampaign, 'roles' | 'shared_with' | 'legacy' | 'subject' | 'body' | 'updated_at'> = {
  roles: [],
  shared_with: [],
  legacy: [],
  subject: '',
  body: '',
  updated_at: '2026-10-03T12:00:00Z',
};

/** Mine, active, shared with the workspace; sent once on 2 Oct. */
export const WIN_BACK: StoredCampaign = {
  ...BASE,
  id: 11,
  name: 'Win-back',
  status: 'active',
  segment: RENEWAL_REF,
  roles: ['champion', 'decision_maker'],
  owner: ME,
  is_owner: true,
  sharing: 'workspace',
  shared_with: [],
  legacy: [],
  subject: 'Checking in, {first_name}',
  body: 'Hi {first_name},\n\nCould we find 20 minutes with {organisation} next week?\n\n{sender_name}',
  updated_at: '2026-10-02T12:05:00Z',
};
/** Mine, a draft to the Champions contact segment. */
export const CHAMPION_NEWS: StoredCampaign = {
  ...BASE,
  id: 12,
  name: 'Champion news',
  status: 'draft',
  segment: CHAMPIONS_REF,
  owner: ME,
  is_owner: true,
  sharing: 'private',
  shared_with: [],
  roles: [],
  legacy: [],
  subject: 'News for {first_name}',
  body: 'Hello {first_name}, we have news.',
};
/** Mine, migrated: hand-picked recipients, no segment yet (spec §2.3). */
export const OLD_DRAFT: StoredCampaign = {
  ...BASE,
  id: 13,
  name: 'Spring offer',
  status: 'draft',
  segment: null,
  owner: ME,
  is_owner: true,
  sharing: 'private',
  shared_with: [],
  roles: [],
  legacy: [
    { id: 41, name: 'Lukas Vermeer', visible: true },
    { id: 99, name: 'Hidden Person', visible: false },
  ],
  subject: 'Spring offer',
  body: 'Hello',
  updated_at: '2026-09-20T12:00:00Z',
};
/** Carl's, shared with me by name: a rule send and a migrated one. */
export const CARL_NEWS: StoredCampaign = {
  ...BASE,
  id: 14,
  name: 'EMEA newsletter',
  status: 'active',
  segment: EMEA_REF,
  roles: ['champion'],
  owner: CARL,
  is_owner: false,
  sharing: 'people',
  shared_with: [ME],
  legacy: [],
  subject: 'EMEA news',
  body: 'Hello {first_name}',
};
/** Dana's, private: unreadable, so a 404 like a missing id. */
export const DANA_CAMPAIGN: StoredCampaign = { ...BASE, id: 15, name: "Dana's campaign", status: 'draft', segment: null, owner: DANA, is_owner: false, sharing: 'private', shared_with: [], roles: [], legacy: [] };
/** Mine, archived, sent once. */
export const OLD_PROMO: StoredCampaign = {
  ...BASE,
  id: 16,
  name: 'Old promo',
  status: 'archived',
  segment: RENEWAL_REF,
  roles: ['champion'],
  owner: ME,
  is_owner: true,
  sharing: 'private',
  shared_with: [],
  legacy: [],
  subject: 'Promo',
  body: 'Hello',
  updated_at: '2026-09-16T12:00:00Z',
};
export const CAMPAIGNS: StoredCampaign[] = [WIN_BACK, CHAMPION_NEWS, OLD_DRAFT, CARL_NEWS, DANA_CAMPAIGN, OLD_PROMO];

const sendBase = { kind: 'manual' as const, status: 'sent' as const, migrated: false, rule: null, subject: 'Hi', body: 'Hello' };
export const WIN_BACK_SEND: StoredSend = {
  ...sendBase,
  id: 41,
  campaign: 11,
  sent_by: ME,
  started_at: '2026-10-02T12:00:00Z',
  finished_at: '2026-10-02T12:01:00Z',
  subject: WIN_BACK.subject,
  body: WIN_BACK.body,
  counts: counts(2, { unsubscribed: 1, failed: 1 }),
};
export const CARL_RULE_SEND: StoredSend = {
  ...sendBase,
  id: 42,
  campaign: 14,
  kind: 'rule',
  sent_by: null,
  rule: { id: 8, name: 'EMEA renewals' },
  started_at: '2026-09-28T12:00:00Z',
  finished_at: '2026-09-28T12:01:00Z',
  counts: counts(2, { recent_campaign: 1 }),
};
export const CARL_MIGRATED_SEND: StoredSend = {
  ...sendBase,
  id: 43,
  campaign: 14,
  migrated: true,
  sent_by: null,
  started_at: '2026-09-01T12:00:00Z',
  finished_at: '2026-09-01T12:00:00Z',
  counts: counts(5, { failed: 1 }),
};
export const OLD_PROMO_SEND: StoredSend = { ...sendBase, id: 44, campaign: 16, sent_by: ME, started_at: '2026-09-15T12:00:00Z', finished_at: '2026-09-15T12:01:00Z', counts: counts(4, {}) };
export const SENDS: StoredSend[] = [WIN_BACK_SEND, CARL_RULE_SEND, CARL_MIGRATED_SEND, OLD_PROMO_SEND];
/** Win-back, still going out (not in SENDS; pass it in to test polling). */
export const SENDING_SEND: StoredSend = { ...sendBase, id: 45, campaign: 11, status: 'sending', sent_by: ME, started_at: NOW, finished_at: null, counts: counts(1, {}) };

const GLOBEX = { kind: 'organization' as const, id: 1, name: 'Globex' };
const INITECH = { kind: 'organization' as const, id: 2, name: 'Initech' };
const PIZZA = { kind: 'organization' as const, id: 7, name: 'Pizza Hut' };
const PIZZA_EMEA = { kind: 'account' as const, id: 14, name: 'Pizza EMEA' };
const person = (id: number, name: string, record: Person['record'], extra: Partial<Person> = {}): Person => ({ contact: { id, name }, record, email: true, visible: true, ...extra });

/** Whom each segment reaches, before the skips (spec §1.3). */
export const SEGMENT_PEOPLE: Record<number, Person[]> = {
  7: [person(51, 'Sam Patel', GLOBEX), person(52, 'Lee Wong', INITECH), person(53, 'Kim Lee', PIZZA), person(54, 'Ana Ruiz', GLOBEX)],
  8: [person(71, 'Pia Holm', PIZZA_EMEA), person(72, 'Ola Berg', PIZZA_EMEA, { visible: false })],
  9: [person(61, 'Rosa Diaz', PIZZA), person(62, 'Tom Hale', INITECH), person(63, 'Ivy Chen', GLOBEX, { email: false }), person(64, 'Ben Ode', INITECH, { visible: false })],
};
/** Contacts already unsubscribed from campaigns. */
export const UNSUBSCRIBED: number[] = [54];

const delivery = (id: number, send: number, who: Person, status: Delivery['status'], reason: Delivery['reason'], sentAt: string | null, token: string | null = null): StoredDelivery => ({
  id,
  send,
  status,
  reason,
  contact: who.contact,
  record: who.record,
  sent_at: sentAt,
  visible: who.visible,
  token,
});
const [SAM, LEE, KIM, ANA] = SEGMENT_PEOPLE[7];
const [PIA, OLA] = SEGMENT_PEOPLE[8];
export const DELIVERIES: StoredDelivery[] = [
  delivery(401, 41, SAM, 'sent', '', '2026-10-02T12:00:30Z', 'tok-41-51'),
  delivery(402, 41, LEE, 'sent', '', '2026-10-02T12:00:40Z', 'tok-41-52'),
  delivery(403, 41, KIM, 'skipped', 'failed', null),
  delivery(404, 41, ANA, 'skipped', 'unsubscribed', null),
  delivery(405, 42, PIA, 'sent', '', '2026-09-28T12:00:30Z', 'tok-42-71'),
  delivery(406, 42, OLA, 'sent', '', '2026-09-28T12:00:40Z', 'tok-42-72'),
  delivery(407, 42, person(73, 'Eva Lind', PIZZA_EMEA), 'skipped', 'recent_campaign', null),
];
/** Claimed for `SENDING_SEND`, not emailed yet: shows "Waiting" under
 *  Deliveries while it is `sending` (not in DELIVERIES; pass it in with
 *  SENDING_SEND). The stub flips it to `sent` the moment the send itself
 *  finishes (the `stillSending` countdown), same as the real minute runner. */
export const SENDING_DELIVERY: StoredDelivery = delivery(450, 45, SAM, 'queued', '', null);

/** For the Rules stub: a campaign ref, or null. */
export function campaignRef(id: number): { id: number; name: string } | null {
  const found = CAMPAIGNS.find((campaign) => campaign.id === id);
  return found ? { id: found.id, name: found.name } : null;
}

/** §1.8's validation: mine, not archived, a segment of the rule's kind. */
export function campaignUsable(id: number, kind: SegmentKind | null): boolean {
  const found = CAMPAIGNS.find((campaign) => campaign.id === id);
  return Boolean(found && found.is_owner && found.status !== 'archived' && found.segment && segmentKindOf(found.segment.kind) === kind);
}
