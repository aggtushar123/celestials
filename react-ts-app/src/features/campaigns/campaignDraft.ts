// The campaign editor's state, as plain data: made new or from a saved
// campaign, checked in the backend's own sentences, and turned into the
// POST and PATCH bodies (spec §2.2, §4).
import type { PersonRef, SegmentKind, Sharing } from '../segments/segmentTypes';
import { DEFAULT_ROLES } from '../surveys/questions';
import type { ContactRole } from '../surveys/surveyTypes';
import type { CampaignErrors } from './campaignErrors';
import { BODY_MAX, CHECK, MERGE_FIELDS, SAY, SUBJECT_MAX, type MergeField } from './campaignOptions';
import type { Campaign, CampaignPatch, CampaignWrite } from './campaignTypes';

export interface CampaignDraft {
  name: string;
  segment: number | null;
  roles: ContactRole[];
  subject: string;
  body: string;
  sharing: Sharing;
  sharedWith: PersonRef[];
}

export function emptyDraft(segment: number | null = null): CampaignDraft {
  return { name: '', segment, roles: [...DEFAULT_ROLES], subject: '', body: '', sharing: 'private', sharedWith: [] };
}

/** A contact segment saves no roles; coming back to one starts from Surveys' defaults. */
export function fromCampaign(campaign: Campaign): CampaignDraft {
  return {
    name: campaign.name,
    segment: campaign.segment?.id ?? null,
    roles: campaign.roles.length > 0 ? [...campaign.roles] : [...DEFAULT_ROLES],
    subject: campaign.subject,
    body: campaign.body,
    sharing: campaign.sharing,
    sharedWith: campaign.sharing === 'people' ? campaign.shared_with : [],
  };
}

export function needsRoles(kind: SegmentKind | null): boolean {
  return kind === 'customer' || kind === 'account';
}

const TOKEN = /\{([^{}]*)\}/g;

/** Every `{…}` that is not one of the three (Contract note 16). */
export function unknownFields(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[1]).filter((name) => !(MERGE_FIELDS as readonly string[]).includes(name));
}

/** What the server would refuse, said first. Save needs a name; Send needs the rest. */
export function checkDraft(draft: CampaignDraft, kind: SegmentKind | null, { forSend = false }: { forSend?: boolean } = {}): CampaignErrors {
  const out: CampaignErrors = {};
  if (!draft.name.trim()) out.name = CHECK.NAME;
  if (forSend && draft.segment === null) out.segment = SAY.CHOOSE_SEGMENT;
  if (draft.segment !== null && needsRoles(kind) && draft.roles.length === 0) out.roles = CHECK.ROLES;
  const subject = draft.subject.trim();
  if (forSend && !subject) out.subject = CHECK.SUBJECT;
  else if (subject.length > SUBJECT_MAX) out.subject = CHECK.SUBJECT_LONG;
  else if (unknownFields(subject).length > 0) out.subject = SAY.MERGE;
  const body = draft.body.trim();
  if (forSend && !body) out.body = CHECK.BODY;
  else if (draft.body.length > BODY_MAX) out.body = CHECK.BODY_LONG;
  else if (unknownFields(body).length > 0) out.body = SAY.MERGE;
  if (draft.sharing === 'people' && draft.sharedWith.length === 0) out.shared_with = CHECK.PEOPLE;
  return out;
}

export function toWrite(draft: CampaignDraft, kind: SegmentKind | null): CampaignWrite {
  return {
    name: draft.name.trim(),
    segment: draft.segment,
    roles: needsRoles(kind) ? draft.roles : [],
    subject: draft.subject.trim(),
    body: draft.body,
    sharing: draft.sharing,
    ...(draft.sharing === 'people' ? { shared_with: draft.sharedWith.map((person) => person.id) } : {}),
  };
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** An edit's PATCH: only what differs from the copy the server last returned. */
export function changedFields(next: CampaignWrite, saved: Campaign): CampaignPatch {
  const patch: CampaignPatch = {};
  if (next.name !== saved.name) patch.name = next.name;
  if (next.subject !== saved.subject) patch.subject = next.subject;
  if (next.body !== saved.body) patch.body = next.body;
  if (next.segment !== (saved.segment?.id ?? null) || next.roles.join() !== saved.roles.join()) {
    patch.segment = next.segment;
    patch.roles = next.roles;
  }
  const before = saved.sharing === 'people' ? saved.shared_with.map((person) => person.id) : [];
  if (next.sharing !== saved.sharing || !sameIds(next.shared_with ?? [], before)) {
    patch.sharing = next.sharing;
    if (next.shared_with) patch.shared_with = next.shared_with;
  }
  return patch;
}

/** Decision 10: the token replaces the selection; the caret lands after it. */
export function insertMergeField(text: string, start: number, end: number, field: MergeField): { text: string; caret: number } {
  const token = `{${field}}`;
  return { text: `${text.slice(0, start)}${token}${text.slice(end)}`, caret: start + token.length };
}
