// "Save as segment" (spec §3): a list's current URL filters as a new
// segment's rules, read with each list's own parser so a value the list
// would drop is dropped here too. What has no rule (the search, picked ids)
// is named in a note rather than lost silently (plan Decision 5).
import { ACCOUNT_PARAMS } from '../accounts/portfolioParams';
import { parseContactsParams } from '../contacts/contactsParams';
import { DEFAULT_GROUP, ORGANIZATION_PARAMS, parseParams } from '../organizations/portfolioParams';
import { KIND_NOUN } from './segmentFields';
import type { Condition, ConditionGroup, Rules, SegmentKind } from './segmentTypes';

export interface ListRules {
  rules: Rules;
  /** What did not carry over, in the builder's words. */
  notes: string[];
  /** Organisation and account ids the rules name, to read their names. */
  ids: { customer: number[]; account: number[] };
}

/** The Organizations list's "Include churned": churned or not, so everyone
 *  counts, and naming `churned` lifts the default exactly as the toggle does
 *  (API_CONTRACTS `segments`, Save as segment; the compiler reads a churned
 *  condition at any depth). */
export const INCLUDE_CHURNED: ConditionGroup = {
  group: {
    match: 'any',
    conditions: [
      { field: 'churned', op: 'is', value: true },
      { field: 'churned', op: 'is', value: false },
    ],
  },
};

export const NO_RULES_NOTE = 'Nothing on the list became a rule, so this segment starts with none: add one below.';

const searchNote = (text: string) => `The search "${text}" isn't carried over: a segment has no search rule.`;

function oneOrMany(field: string, values: (string | number)[]): Condition {
  return values.length === 1 ? { field, op: 'is', value: values[0] } : { field, op: 'in', value: values };
}

function portfolioRules(kind: 'customer' | 'account', search: URLSearchParams): ListRules {
  const p = parseParams(search, DEFAULT_GROUP, kind === 'customer' ? ORGANIZATION_PARAMS : ACCOUNT_PARAMS);
  const conditions: (Condition | ConditionGroup)[] = [];
  if (p.owner) conditions.push({ field: 'owner', op: 'is', value: p.owner === 'unassigned' ? 'unassigned' : Number(p.owner) });
  if (p.lifecycle.length) conditions.push(oneOrMany('lifecycle_stage', p.lifecycle));
  if (p.health.length) conditions.push(oneOrMany('health_category', p.health));
  if (p.product.length) conditions.push(oneOrMany('product', p.product.map(Number)));
  const organisations = (p.organisation ?? []).map(Number);
  if (organisations.length) conditions.push(oneOrMany('organisation', organisations));
  if (p.renews_within) conditions.push({ field: 'renewal_date', op: 'within_next', value: Number(p.renews_within) });
  if (p.nps) conditions.push({ field: 'nps_band', op: 'is', value: p.nps });
  if (p.include_churned && !p.lifecycle.includes('churn')) conditions.push(INCLUDE_CHURNED);

  const notes: string[] = [];
  if (p.search) notes.push(searchNote(p.search));
  if (p.ids.length) {
    const noun = p.ids.length === 1 ? KIND_NOUN[kind].one : KIND_NOUN[kind].many;
    notes.push(`${p.ids.length} picked ${noun} from the list ${p.ids.length === 1 ? "isn't" : "aren't"} carried over: a rule can't name records one by one.`);
  }
  if (conditions.length === 0) notes.push(NO_RULES_NOTE);
  return { rules: { match: 'all', conditions }, notes, ids: { customer: organisations, account: [] } };
}

function contactRules(search: URLSearchParams): ListRules {
  const p = parseContactsParams(search);
  const conditions: Condition[] = [];
  if (p.customer) conditions.push({ field: 'organisation', op: 'is', value: Number(p.customer) });
  if (p.account) conditions.push({ field: 'account', op: 'is', value: Number(p.account) });
  if (p.sentiment) conditions.push({ field: 'sentiment', op: 'is', value: p.sentiment });
  if (p.role) conditions.push({ field: 'role', op: 'is', value: p.role });
  const notes = p.q.trim() ? [searchNote(p.q.trim())] : [];
  if (conditions.length === 0) notes.push(NO_RULES_NOTE);
  return {
    rules: { match: 'all', conditions },
    notes,
    ids: { customer: p.customer ? [Number(p.customer)] : [], account: p.account ? [Number(p.account)] : [] },
  };
}

export function rulesFromList(kind: SegmentKind, search: URLSearchParams): ListRules {
  return kind === 'contact' ? contactRules(search) : portfolioRules(kind, search);
}

/** What the builder starts from on a list's Save as segment: the kind, then
 *  the list's own filter query, unchanged. */
export function saveAsSegmentSearch(kind: SegmentKind, listQuery: string): URLSearchParams {
  return new URLSearchParams([['kind', kind], ...new URLSearchParams(listQuery)]);
}

/** The same as an address (/segments/new opens the builder over the
 *  Segments list), for a link that reloads and shares as it is. */
export function saveAsSegmentHref(kind: SegmentKind, listQuery: string): string {
  return `/segments/new?${saveAsSegmentSearch(kind, listQuery).toString()}`;
}
