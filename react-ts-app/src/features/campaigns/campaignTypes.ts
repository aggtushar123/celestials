// The Campaigns contract (spec 2026-10-04-campaigns-design.md §4), field for
// field. Every read is computed for the reader over what they may open.
import type { MadeBy } from '../agents/agentTypes';
import type { PersonRef, Sharing } from '../segments/segmentTypes';
import type { ContactRole } from '../surveys/surveyTypes';

export type { PersonRef, Sharing };
export type CampaignStatus = 'draft' | 'active' | 'archived';
export type SendStatus = 'sending' | 'sent';
export type SkipReason = 'unsubscribed' | 'no_email' | 'already_received' | 'recent_campaign' | 'over_limit' | 'failed';
export type Skipped = Record<SkipReason, number>;
/** §4 says `organization`; the segments contract stores `customer`. Both are
 *  read, and `segmentKindOf` maps them (Contract note 1). */
export type CampaignSegmentKind = 'organization' | 'customer' | 'account' | 'contact';
/** `id` is null for a reader who may not read the segment (Contract note 1). */
export type SegmentRef = { id: number | null; name: string; kind: CampaignSegmentKind } | null;

/** Frozen on a send. `reached` is everyone the segment reached, sent or skipped. */
export interface Counts {
  reached: number;
  sent: number;
  skipped: Skipped;
}

export interface LastSend {
  id: number;
  finished_at: string | null;
  status: SendStatus;
  counts: Counts;
}

/** GET /campaigns/: a row. `needs_segment` marks a migrated draft with no segment. */
export interface CampaignRow {
  id: number;
  name: string;
  status: CampaignStatus;
  segment: SegmentRef;
  roles: ContactRole[];
  owner: PersonRef;
  is_owner: boolean;
  sharing: Sharing;
  shared_with: PersonRef[];
  last_send: LastSend | null;
  needs_segment: boolean;
  updated_at: string;
  /** The agent action that made it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
}

/** GET/PATCH /campaigns/<id>/ and POST's 201. `legacy_recipients` are a
 *  migrated draft's hand-picked contacts the reader may open; the rest are
 *  `legacy_hidden`. `can_delete` is `is_owner` and no sends. */
export interface Campaign extends CampaignRow {
  subject: string;
  body: string;
  legacy_recipients: { id: number; name: string }[];
  legacy_hidden: number;
  can_delete: boolean;
}

/** A send's rule: `id` is null when the reader can't read it ("a rule"). */
export interface RuleRef {
  id: number | null;
  name: string;
}

/** One send, its subject and body frozen as they went out. */
export interface CampaignSend {
  id: number;
  kind: 'manual' | 'rule';
  status: SendStatus;
  migrated: boolean;
  sent_by: PersonRef | null;
  rule: RuleRef | null;
  started_at: string;
  finished_at: string | null;
  subject: string;
  body: string;
  counts: Counts;
}

export type DeliveryStatus = 'queued' | 'sent' | 'skipped';
export interface DeliveryRecord {
  kind: 'organization' | 'account';
  id: number;
  name: string;
}

/** Only for contacts the reader may open (spec §1.7). */
export interface Delivery {
  id: number;
  status: DeliveryStatus;
  reason: SkipReason | '';
  contact: { id: number; name: string };
  record: DeliveryRecord | null;
  sent_at: string | null;
}

/** GET /campaigns/<id>/audience/ (owner only): `sample` is the first 20 reachable. */
export interface Audience {
  reach: number;
  skipped: Skipped;
  sample: { id: number; name: string }[];
}

export interface Page<T> {
  results: T[];
  next: string | null;
}

export interface DeliveriesPage extends Page<Delivery> {
  hidden: number;
}

export type CampaignTab = 'mine' | 'shared';

/** POST /campaigns/ (and PATCH, partially). `shared_with` only with "people". */
export interface CampaignWrite {
  name: string;
  segment: number | null;
  roles: ContactRole[];
  subject: string;
  body: string;
  sharing: Sharing;
  shared_with?: number[];
}

/** PATCH: the write's fields, and archiving or unarchiving. */
export type CampaignPatch = Partial<CampaignWrite> & { status?: 'archived' | 'active' };

/** POST /campaigns/<id>/preview/: the draft's text travels too (Contract note 3). */
export interface PreviewRequest {
  contact?: number;
  subject?: string;
  body?: string;
}

export interface Preview {
  subject: string;
  body: string;
}

/** GET /campaigns/unsubscribe/<token>/. */
export interface PublicUnsubscribe {
  workspace: string;
}
