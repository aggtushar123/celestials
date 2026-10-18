// Campaigns' limits, labels and the backend's own sentences (spec §1), so a
// client check and a server refusal read the same.
import type { CampaignStatus, SkipReason } from './campaignTypes';

export const NAME_MAX = 120;
export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const OWNED_MAX = 50;
export const PEOPLE_MAX = 500;
export const GAP_DAYS = 3;
export const LINK_DAYS = 365;
export const PREVIEW_DEBOUNCE_MS = 400;
export const SAMPLE_MAX = 20;

export const MERGE_FIELDS = ['first_name', 'organisation', 'sender_name'] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export const STATUS_LABEL: Record<CampaignStatus, string> = { draft: 'Draft', active: 'Active', archived: 'Archived' };

/** The order a count of skips is read in (spec §2.2's example: unsubscribed,
 *  the 3-day gap, already received); `failed` happens later, at delivery. */
export const SKIP_ORDER: readonly SkipReason[] = ['unsubscribed', 'recent_campaign', 'already_received', 'no_email', 'over_limit', 'failed'];
/** After a figure: "14 unsubscribed". */
export const SKIP_WORDS: Record<SkipReason, string> = {
  unsubscribed: 'unsubscribed',
  recent_campaign: `emailed in the last ${GAP_DAYS} days`,
  already_received: 'already received it',
  no_email: 'without an email',
  over_limit: `over the limit of ${PEOPLE_MAX}`,
  failed: "couldn't be delivered",
};
/** On a delivery row, and the Reason select. */
export const REASON_LABEL: Record<SkipReason, string> = {
  unsubscribed: 'Unsubscribed',
  recent_campaign: `Emailed in the last ${GAP_DAYS} days`,
  already_received: 'Already received it',
  no_email: 'No email address',
  over_limit: `Over the limit of ${PEOPLE_MAX}`,
  failed: "Couldn't be delivered",
};

/** The backend's sentences (spec §1.4, §1.5, §1.7, §4). */
export const SAY = {
  MERGE: 'Use {first_name}, {organisation} or {sender_name}.',
  NOT_OWNER: "Only the campaign's owner can change it.",
  CAMPAIGN_SENT: 'Archive it instead: it has been sent.',
  EMAIL_NOT_SET_UP: "Email isn't set up for this workspace yet, so campaigns can't be sent.",
  ARCHIVED: 'This campaign is archived.',
  OWNER_INACTIVE: 'Its owner is no longer active.',
  CHOOSE_SEGMENT: 'Choose a segment first.',
  NOBODY: 'Nobody in this segment can be emailed right now.',
  NO_CONTENT: 'Write a subject and a body first.',
  LIMIT: 'You can own at most 50 campaigns.',
  NO_NAME: 'Give it a name.',
  LONG_NAME: `Keep the name to ${NAME_MAX} characters.`,
} as const;

/** The client's own words where DRF would word it. */
export const CHECK = {
  NAME: 'Give it a name.',
  SUBJECT: 'Write a subject line.',
  SUBJECT_LONG: `Keep the subject to ${SUBJECT_MAX} characters.`,
  BODY: 'Write the email.',
  BODY_LONG: `Keep the body to ${BODY_MAX} characters.`,
  ROLES: 'Choose at least one role.',
  PEOPLE: 'Choose at least one teammate.',
} as const;

export const SHARING_NOTE = 'Teammates see its sends, the people in them they may open, and a count of the rest. Only you can change it or send it.';
export const EXPLAINER =
  'A campaign emails your own words to the people in one of your segments. Every email carries an unsubscribe link, and nobody gets more than one campaign email every 3 days.';
