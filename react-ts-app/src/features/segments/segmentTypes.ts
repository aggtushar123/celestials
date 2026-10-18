// The Segments contract (revenact-backend PR #84, docs/API_CONTRACTS.md
// `segments`), field for field. A segment stores rules, never members:
// every read is computed for the reader over what they may open.
import type { MadeBy } from '../agents/agentTypes';
import type { CurrencyCode } from '../auth/authSlice';
import type { ContactsSummary } from '../contacts/contactsTypes';
import type { HealthBand, PortfolioGroup } from '../organizations/portfolioTypes';

/** `customer` is an organisation (the backend's model name). */
export type SegmentKind = 'customer' | 'account' | 'contact';
export type SegmentScope = 'all' | 'mine' | 'shared';
export type Sharing = 'private' | 'workspace' | 'people';
export type Match = 'all' | 'any';
export type Operator =
  | 'is'
  | 'is_not'
  | 'in'
  | 'gt'
  | 'lt'
  | 'between'
  | 'within_next'
  | 'within_last'
  | 'is_empty'
  | 'is_not_empty';

/** A rule value as stored. An id the reader cannot open reads `null`. */
export type RuleScalar = number | string | boolean | null;
export type RuleValue = RuleScalar | RuleScalar[];

export interface Condition {
  field: string;
  op: Operator;
  /** Absent for `is_empty` / `is_not_empty`. */
  value?: RuleValue;
}

/** One group: its own all/any. Groups do not nest. */
export interface ConditionGroup {
  group: { match: Match; conditions: Condition[] };
}

export interface Rules {
  match: Match;
  conditions: (Condition | ConditionGroup)[];
}

/** Names for the ids in `rules` the reader may open, by id. People are named
 *  only from the reader's own workspace. */
export interface RuleLabels {
  organisations: Record<string, string>;
  accounts: Record<string, string>;
  products: Record<string, string>;
  people: Record<string, string>;
}

export const NO_LABELS: RuleLabels = { organisations: {}, accounts: {}, products: {}, people: {} };

export interface PersonRef {
  id: number;
  name: string;
}

export interface DayMoves {
  entered: number;
  left: number;
}

export interface SegmentListRow {
  id: number;
  name: string;
  kind: SegmentKind;
  owner: PersonRef;
  is_owner: boolean;
  sharing: Sharing;
  paused: boolean;
  /** The owner's nightly figures, naming nobody: null on a row the reader
   *  does not own (Ruling S8). `sparkline` is 30 sizes, oldest first, and
   *  `[]` before the first evaluation. */
  member_count: number | null;
  today: DayMoves | null;
  sparkline: number[] | null;
  updated_at: string;
  /** The agent action that made it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
}

export interface Segment {
  id: number;
  name: string;
  description: string;
  kind: SegmentKind;
  rules: Rules;
  labels: RuleLabels;
  /** Only the ones the reader may open. */
  pinned_ids: number[];
  excluded_ids: number[];
  sharing: Sharing;
  shared_with: PersonRef[];
  owner: PersonRef;
  is_owner: boolean;
  alert_on_changes: boolean;
  paused: boolean;
  /** The owner's nightly figure: null for anyone else (Ruling S8). */
  member_count: number | null;
  last_evaluated_on: string | null;
  created_at: string;
  updated_at: string;
  /** The agent action that made it (Agents delivery 3); null or absent when a person did. */
  made_by?: MadeBy | null;
}

/** POST /segments/ (PATCH takes the same without `kind`). Pins have their
 *  own endpoint. */
export interface SegmentWrite {
  name: string;
  kind: SegmentKind;
  description: string;
  rules: Rules;
  sharing: Sharing;
  /** Sent only with `sharing: 'people'`; the server clears it otherwise. */
  shared_with?: number[];
  alert_on_changes: boolean;
}

/** The tiles, over every member the reader may open (search narrows the
 *  rows, never these). A contacts segment has no ARR, health or CSAT. The
 *  preview's `entered_7d` / `left_7d` are null. */
export interface SegmentSummary {
  members: number;
  arr: number | null;
  unconverted_count: number;
  avg_health: number | null;
  avg_csat: number | null;
  entered_7d: number | null;
  left_7d: number | null;
  currency: CurrencyCode;
  contacts?: ContactsSummary;
}

/** GET /segments/<id>/members/: the kind's own rows and paging, the tiles,
 *  and how many of the owner's members the reader may not open (a count). */
export interface SegmentMembersPage<R> {
  kind: SegmentKind;
  results: R[];
  next_cursor: string | null;
  count: number;
  groups: PortfolioGroup[];
  currency: CurrencyCode;
  hidden_count: number;
  summary: SegmentSummary;
}

export interface ChangeRecord {
  id: number;
  name: string;
  /** Field keys, or `pinned`, `deleted`, `access`, `churned`, `archived`. */
  reason: string[];
}

/** One day: at most 100 named per direction; `totals` counts every record
 *  the reader may open that moved, `more` the ones the cap left unnamed. */
export interface ChangeDay {
  date: string;
  entered: ChangeRecord[];
  left: ChangeRecord[];
  totals: DayMoves;
  more: DayMoves;
}

export interface SegmentChanges {
  kind: SegmentKind;
  days: ChangeDay[];
  hidden_count: number;
}

export interface PreviewRequest {
  kind: SegmentKind;
  rules: Rules;
  pinned_ids?: number[];
  excluded_ids?: number[];
}

export interface PreviewCompany {
  id: number;
  name: string;
  owner: PersonRef | null;
  health: { score: number; category: HealthBand };
}

export interface PreviewContact {
  id: number;
  name: string;
  role: string;
  parent: { kind: 'customer' | 'account'; id: number; name: string };
}

export interface PreviewResponse {
  kind: SegmentKind;
  count: number;
  /** The first ten by name. */
  results: (PreviewCompany | PreviewContact)[];
  summary: SegmentSummary;
}

export type MemberStateValue = 'pinned' | 'excluded' | 'none';

export interface MemberState {
  pinned_ids: number[];
  excluded_ids: number[];
}
