// The Surveys contract (revenact-backend feat/surveys, docs/API_CONTRACTS.md
// `surveys`; backend plan 2026-10-03-surveys-backend.md), field for field.
// Every read is computed for the reader over what they may open.
import type { Contact } from '../customers/customersSlice';
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';

export type SurveyType = 'nps' | 'csat' | 'ces';
export type SendStatus = 'draft' | 'sending' | 'sent';
/** `Contact.Role` on the backend, value for value. */
export type ContactRole = Contact['role'];
export type BandName = 'detractors' | 'passives' | 'promoters' | 'low' | 'mid' | 'high';
export type AnswersFilter = 'all' | 'detractors' | 'comments';

/** A send's segment (backend Decision 18). `id` is null for a reader who may
 *  not read the segment, so it is linked only when it can be opened; the
 *  whole ref is null once the segment is deleted. */
export interface SegmentRef {
  id: number | null;
  name: string;
  kind: SegmentKind;
}

/** Frozen when the send finished. The owner's only: null for anyone else
 *  (backend Decision 19). */
export interface SendCounts {
  audience: number;
  sent: number;
  failed: number;
  skipped_recent: number;
  skipped_no_email: number;
  skipped_cap: number;
}

/** Every invite for the owner; only the people the reader may open for
 *  anyone else. A failed invite was never sent and is not counted. */
export interface SendSummary {
  sent: number;
  answered: number;
  rate: number | null;
  figure: number | null;
  bands: Partial<Record<BandName, number>>;
}

/** GET/PATCH /surveys/sends/<id>/, and POST's 201. */
export interface SurveySend {
  id: number;
  name: string;
  survey_type: SurveyType;
  subject: string;
  intro: string;
  segment: SegmentRef | null;
  roles: ContactRole[];
  status: SendStatus;
  sharing: Sharing;
  shared_with: PersonRef[];
  owner: PersonRef;
  is_owner: boolean;
  started_at: string | null;
  sent_at: string | null;
  counts: SendCounts | null;
  summary: SendSummary;
  created_at: string;
  updated_at: string;
}

/** GET /surveys/sends/: unpaginated, newest first. */
export interface SendListRow {
  id: number;
  name: string;
  survey_type: SurveyType;
  status: SendStatus;
  segment: SegmentRef | null;
  owner: PersonRef;
  is_owner: boolean;
  sharing: Sharing;
  sent_at: string | null;
  sent: number;
  answered: number;
  rate: number | null;
  updated_at: string;
}

/** POST /surveys/sends/ (and PATCH, partially). `shared_with` only with
 *  `sharing: "people"`. */
export interface SendWrite {
  name: string;
  survey_type: SurveyType;
  subject: string;
  intro: string;
  segment: number | null;
  roles: ContactRole[];
  sharing: Sharing;
  shared_with?: number[];
}

export interface AudienceRequest {
  segment: number;
  roles: ContactRole[];
}

/** POST /surveys/sends/audience/. `organisations` counts each organisation
 *  and each account reached once (backend Decision 6). */
export interface AudienceCounts {
  audience: number;
  organisations: number;
  skipped_recent: number;
  skipped_no_email: number;
  skipped_cap: number;
  hidden_count: number;
  limit: number;
}

/** The record an answer scores. `customer` is an organisation. */
export interface RecordRef {
  kind: 'customer' | 'account';
  id: number;
  name: string;
}

/** Null once the contact is deleted (the answer stays, unnamed). */
export interface ContactRef {
  id: number;
  name: string;
}

export interface AnswerRow {
  id: number;
  contact: ContactRef | null;
  record: RecordRef;
  score: number;
  band: BandName;
  comment: string;
  answered_at: string;
}

/** GET /surveys/sends/<id>/answers/?filter=&cursor=: 50 a page, newest
 *  first; `next_cursor` is opaque. `hidden_count` is one count of answered
 *  invites the reader cannot open, the same whichever `filter` was asked
 *  for (backend Decision 20) — never "N more detractors", always "N more
 *  answers from people you can't open". */
export interface AnswersPage {
  filter: AnswersFilter;
  results: AnswerRow[];
  next_cursor: string | null;
  hidden_count: number;
}

/** `queued`: claimed, not emailed yet (the minute runner has not reached
 *  it). Delivery normally finishes within about a minute. */
export type PendingStatus = 'queued' | 'pending' | 'expired' | 'failed';

export interface PendingRow {
  id: number;
  contact: ContactRef | null;
  record: RecordRef;
  status: PendingStatus;
  expires_at: string;
  failure: string | null;
}

/** GET /surveys/sends/<id>/pending/: unpaginated; never an email address. */
export interface PendingPage {
  results: PendingRow[];
  hidden_count: number;
}

/** GET /public/surveys/<token>/: the question and the workspace's name only. */
export interface PublicSurvey {
  survey_type: SurveyType;
  question: string;
  intro: string;
  organisation_name: string;
}

export interface PublicAnswer {
  score: number;
  comment?: string;
}
