import type { RelationshipLabel, SurveyType } from './canvasTypes';

/** The four labels, in the spec's order; '' is "No label". */
export const RELATIONSHIP_LABELS: readonly Exclude<RelationshipLabel, ''>[] = ['Reports to', 'Introduced by', 'Blocks', 'Influences'];
/** Every choice a line's label menu offers, "No label" last. */
export const LABEL_CHOICES: readonly RelationshipLabel[] = [...RELATIONSHIP_LABELS, ''];
export const NO_LABEL = 'No label';

export const NAME_MAX = 120;
export const NODES_MAX = 60;
export const EDGES_MAX = 150;
/** Spec §1.4: a 240 × 160 grid, six to a row. */
export const GRID = { x: 240, y: 160, perRow: 6 } as const;
export const STALE_DAYS = 60;
export const GALLERY_PAGE = 50;
export const SEARCH_DEBOUNCE_MS = 300;

export const SURVEY_LABEL: Record<SurveyType, string> = { nps: 'NPS', csat: 'CSAT', ces: 'CES' };

/** The spec's sentences, used verbatim. */
export const SAY = {
  CHANGED: 'Someone else changed this map. Reload to see their changes.',
  NOT_DELETER: "Only the map's creator or their managers can delete it.",
  NAME: 'Give the map a name.',
  PEOPLE: 'Add people from this organisation or account.',
  HIDDEN: "Someone you can't open",
  REMOVED: 'Removed contact',
  NO_MAPS: 'No maps yet',
  NO_PLANS: 'No open plans',
  UNSAVED: 'Unsaved changes',
  UNSUBSCRIBED: 'Unsubscribed',
  NOT_ON_MAP: 'Not on the map',
  PHONE_NOTE: 'Edit maps on a larger screen.',
  MISSING: "This map doesn't exist or isn't shared with you.",
} as const;

/** The board's own refusals, before anything is sent (Decision 14). */
export const CHECK = {
  FULL: `A map holds at most ${NODES_MAX} people.`,
  LINES_FULL: `A map holds at most ${EDGES_MAX} lines.`,
  ALREADY_ON: 'They are already on the map.',
  SELF: 'Pick someone else to connect them to.',
  DUPLICATE: 'They already have this relationship.',
  PENDING: 'Save to see their facts.',
} as const;
