// Test-only: two records, their people and three maps (spec §1.3's three
// node classes), shared by every Canvas test and the stub.
import type { MadeBy } from '../agents/agentTypes';
import type { PlanRow } from '../plans/planTypes';
import { CARL, DANA, ME } from '../segments/testSegments';
import type { CanvasEdge, CanvasNode, MapPerson, PersonRef, RecordRef } from './canvasTypes';

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const PIZZA_HUT: RecordRef = { kind: 'organization', id: 7, name: 'Pizza Hut' };
export const PIZZA_EMEA: RecordRef = { kind: 'account', id: 12, name: 'Pizza EMEA' };
/** A record the reader can't open: its maps never show. */
export const SECRET_CO: RecordRef = { kind: 'organization', id: 99, name: 'Secret Co' };

export interface StoredPerson {
  id: number;
  name: string;
  role: string;
  role_display: string;
  /** Where they work: an account's people are also the organisation's. */
  record: RecordRef;
  readable: boolean;
  deleted?: boolean;
  facts: Omit<MapPerson, 'name' | 'role' | 'role_display'>;
}

const facts = (over: Partial<MapPerson> = {}): Omit<MapPerson, 'name' | 'role' | 'role_display'> => ({
  sentiment: 'neutral',
  sentiment_label: 'Neutral',
  last_contacted_at: null,
  latest_survey: null,
  campaigns_unsubscribed: false,
  ...over,
});

export const ROSA: StoredPerson = {
  id: 51, name: 'Rosa Diaz', role: 'decision_maker', role_display: 'Decision Maker', record: PIZZA_EMEA, readable: true,
  facts: facts({ sentiment: 'positive', sentiment_label: 'Positive', last_contacted_at: daysAgo(12), latest_survey: { type: 'nps', score: 9, answered_at: '2026-10-03T12:00:00Z' } }),
};
export const TOM: StoredPerson = {
  id: 52, name: 'Tom Lee', role: 'champion', role_display: 'Champion', record: PIZZA_EMEA, readable: true,
  facts: facts({ last_contacted_at: daysAgo(70), campaigns_unsubscribed: true }),
};
export const PRIYA: StoredPerson = {
  id: 53, name: 'Priya Shah', role: 'influencer', role_display: 'Influencer', record: PIZZA_HUT, readable: true,
  facts: facts({ sentiment: 'negative', sentiment_label: 'Negative' }),
};
/** Exists, but the reader may not open them (spec §1.3 `hidden`). */
export const HIDDEN_HAL: StoredPerson = { id: 54, name: 'Hal Hidden', role: 'economic_buyer', role_display: 'Economic Buyer', record: PIZZA_EMEA, readable: false, facts: facts() };
export const OMAR: StoredPerson = { id: 55, name: 'Omar Farouk', role: 'other', role_display: 'Other', record: PIZZA_EMEA, readable: true, facts: facts() };
/** Deleted since being mapped (spec §1.3 `removed`). */
export const GONE_GIL: StoredPerson = { id: 59, name: 'Gil Gone', role: 'other', role_display: 'Other', record: PIZZA_EMEA, readable: true, deleted: true, facts: facts() };
export const PEOPLE: StoredPerson[] = [ROSA, TOM, PRIYA, HIDDEN_HAL, OMAR, GONE_GIL];

export interface StoredMap {
  id: number;
  name: string;
  record: RecordRef;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  version: number;
  created_by: PersonRef | null;
  updated_by: PersonRef | null;
  updated_at: string;
  made_by?: MadeBy | null;
}

const at = (id: string, contact: number, x: number, y: number): CanvasNode => ({ id, position: { x, y }, data: { contact_id: contact } });

/** Rosa reports to Tom; Hal is hidden; Gil is removed; Omar is in the tray. */
export const EMEA_MAP: StoredMap = {
  id: 301, name: 'EMEA buying group', record: PIZZA_EMEA,
  nodes: [at('n1', 51, 0, 0), at('n2', 52, 240, 0), at('n3', 54, 480, 0), at('n4', 59, 0, 160)],
  edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'Reports to' }],
  version: 4, created_by: CARL, updated_by: DANA, updated_at: daysAgo(2),
};
export const HUT_MAP: StoredMap = {
  id: 302, name: 'Pizza Hut leadership', record: PIZZA_HUT, nodes: [at('n1', 53, 0, 0)], edges: [],
  version: 1, created_by: ME, updated_by: ME, updated_at: daysAgo(5),
};
/** Dana's map: Alice (ME) is not above Dana, so she may not delete it. */
export const DANA_MAP: StoredMap = {
  id: 303, name: "Dana's renewal map", record: PIZZA_EMEA, nodes: [], edges: [],
  version: 1, created_by: DANA, updated_by: DANA, updated_at: daysAgo(9),
};
export const SECRET_MAP: StoredMap = {
  id: 304, name: 'Secret map', record: SECRET_CO, nodes: [], edges: [],
  version: 1, created_by: DANA, updated_by: DANA, updated_at: daysAgo(1),
};
export const MAPS: StoredMap[] = [EMEA_MAP, HUT_MAP, DANA_MAP, SECRET_MAP];

export const EMEA_PLAN: PlanRow = {
  id: 41, name: 'EMEA onboarding', kind: 'onboarding', status: 'on_track', record: PIZZA_EMEA, owner: ME,
  start_date: '2026-09-01', target_date: '2026-11-30', milestones_done: 1, milestones_total: 3,
  tasks_done: 2, tasks_total: 6, next_due: '2026-10-20', is_overdue: false, can_edit: true,
  pending_tasks: 0, started_by_agent: null,
};
