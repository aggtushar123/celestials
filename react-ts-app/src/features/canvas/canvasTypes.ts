// Spec 2026-10-04-canvas-design §4, field for field (binding for both plans).
import type { MadeBy } from '../agents/agentTypes';
import type { PlanRow, RecordKind, RecordRef } from '../plans/planTypes';
import type { PersonRef } from '../segments/segmentTypes';

export type { PersonRef, RecordKind, RecordRef };

export type RelationshipLabel = 'Reports to' | 'Introduced by' | 'Blocks' | 'Influences' | '';
export type Reading = 'positive' | 'neutral' | 'negative';

export interface CanvasNode {
  id: string;
  position: { x: number; y: number };
  data: { contact_id: number };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label: RelationshipLabel;
}

export type SurveyType = 'nps' | 'csat' | 'ces';

export interface LatestSurvey {
  type: SurveyType;
  score: number;
  answered_at: string;
}

export interface MapPerson {
  name: string;
  /** The role slug (Contract note 3). */
  role: string;
  /** The role's label, shown (Contract note 3). */
  role_display: string;
  /** Never null (Contract note 4). */
  sentiment: Reading;
  /** The word shown. */
  sentiment_label: string;
  last_contacted_at: string | null;
  latest_survey: LatestSurvey | null;
  campaigns_unsubscribed: boolean;
}

/** A person added from the tray has no facts until the next save (Contract note 14). */
export type PersonFacts = MapPerson & { pending?: true };

export interface NotOnMap {
  id: number;
  name: string;
  role: string;
  role_display: string;
}

export interface CanvasRow {
  id: number;
  name: string;
  record: RecordRef;
  /** Node count, hidden and removed nodes included (Contract note 13). */
  people: number;
  updated_at: string;
  updated_by: PersonRef | null;
  /** The agent action that laid it out (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
}

export interface Canvas extends CanvasRow {
  version: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Keyed by contact id, as a string. */
  people_by_contact: Record<string, MapPerson>;
  /** Node ids whose contact the reader can't open. */
  hidden: string[];
  /** Node ids whose contact no longer exists. */
  removed: string[];
  not_on_map: NotOnMap[];
  open_plans: PlanRow[];
  can_delete: boolean;
  created_by: PersonRef | null;
}

export interface GalleryPage {
  results: CanvasRow[];
  next: string | null;
}

export interface RecordMaps {
  results: CanvasRow[];
}

export type MapStart = 'people' | 'blank';

/** Exactly one of `customer` or `account`. */
export interface CanvasCreate {
  name: string;
  customer?: number;
  account?: number;
  start: MapStart;
}

export interface CanvasPatch {
  name?: string;
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  version: number;
}
