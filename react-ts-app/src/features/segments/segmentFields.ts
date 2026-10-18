// What a segment rule may name, per kind, and the operators each type takes:
// a mirror of revenact-backend services/segments/registry.py (PR #84),
// pinned by segmentFields.test.ts. The backend refuses anything else with a
// 400; this list only decides what the builder offers and how a rule reads.
import type { AIAttribute } from '../attributes/types';
import { CONTACT_ROLES, SENTIMENTS } from '../contacts/contactsParams';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import { HEALTH_LABEL, NPS_BANDS, type PortfolioNoun } from '../organizations/portfolioLabels';
import { LIFECYCLE_VALUES } from '../organizations/portfolioParams';
import type { HealthBand } from '../organizations/portfolioTypes';
import type { Operator, SegmentKind } from './segmentTypes';

export type ValueType = 'number' | 'percent' | 'days' | 'date' | 'choice' | 'text' | 'boolean' | 'owner' | 'record';
/** What an id in an owner or record value names. */
export type RecordKind = 'user' | 'customer' | 'account' | 'product';

export interface Choice {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: ValueType;
  choices: Choice[];
  record: RecordKind | '';
  /** An AI attribute: "not answered yet" is worth asking, so its type also
   *  takes is_empty / is_not_empty. */
  optional: boolean;
  /** Where the field picker lists it. */
  section: 'own' | 'parent' | 'attribute';
}

export const OPERATORS: Record<ValueType, Operator[]> = {
  number: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
  percent: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
  days: ['gt', 'lt', 'between', 'is_empty'],
  date: ['within_next', 'within_last', 'gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
  choice: ['is', 'is_not', 'in'],
  text: ['is', 'is_not', 'in', 'is_empty', 'is_not_empty'],
  boolean: ['is'],
  owner: ['is', 'is_not', 'in'],
  record: ['is', 'is_not', 'in'],
};

export const VALUELESS: Operator[] = ['is_empty', 'is_not_empty'];
/** Counting each condition inside a group (backend MAX_CONDITIONS). */
export const MAX_CONDITIONS = 20;

export const KIND_LABEL: Record<SegmentKind, string> = { customer: 'Organisations', account: 'Accounts', contact: 'Contacts' };
export const KIND_NOUN: Record<SegmentKind, PortfolioNoun> = {
  customer: { one: 'organisation', many: 'organisations' },
  account: { one: 'account', many: 'accounts' },
  contact: { one: 'contact', many: 'contacts' },
};

export const PARENT_PREFIX = 'parent.';
export const ATTRIBUTE_PREFIX = 'attr:';
const PARENT_SUFFIX = ' of their organisation or account';

export function operatorsOf(field: FieldDef): Operator[] {
  const operators = OPERATORS[field.type];
  return field.optional ? [...operators, ...VALUELESS.filter((op) => !operators.includes(op))] : operators;
}

function field(key: string, label: string, type: ValueType, extra: Partial<FieldDef> = {}): FieldDef {
  return { key, label, type, choices: [], record: '', optional: false, section: 'own', ...extra };
}

const LIFECYCLE: Choice[] = LIFECYCLE_VALUES.map((value) => ({ value, label: LIFECYCLE_LABELS[value] }));
/** Registry order (services/segments/registry.py:87, `Customer.HealthCategory.values`):
 *  good, average, poor. Not `HEALTH_BANDS` (`portfolioParams.ts`), which is the
 *  portfolio UI's own severity order (poor, average, good) for a different surface. */
const HEALTH_CATEGORY_ORDER: HealthBand[] = ['good', 'average', 'poor'];
const HEALTH: Choice[] = HEALTH_CATEGORY_ORDER.map((value) => ({ value, label: HEALTH_LABEL[value] }));
const NPS_WORDS: Record<string, string> = { promoter: 'Promoter', passive: 'Passive', detractor: 'Detractor' };
const NPS: Choice[] = NPS_BANDS.map((value) => ({ value, label: NPS_WORDS[value] }));
const STATUS: Choice[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** What an organisation and an account both have, in the registry's order. */
const SHARED: FieldDef[] = [
  field('lifecycle_stage', 'Lifecycle stage', 'choice', { choices: LIFECYCLE }),
  field('health_score', 'Health score', 'number'),
  field('health_category', 'Health', 'choice', { choices: HEALTH }),
  field('csat_score', 'CSAT %', 'percent'),
  field('nps_score', 'NPS', 'number'),
  field('nps_band', 'NPS band', 'choice', { choices: NPS }),
  field('arr', 'ARR', 'number'),
  field('renewal_date', 'Renewal date', 'date'),
  field('owner', 'Owner', 'owner', { record: 'user' }),
  field('open_tickets', 'Open tickets', 'number'),
  field('last_touch', 'Days since last touch', 'days'),
  field('ai_pulse', 'AI pulse', 'number'),
  field('csm_pulse', 'CSM pulse', 'number'),
  field('created', 'Created date', 'date'),
];

const CUSTOMER: FieldDef[] = [
  ...SHARED,
  field('ces_percentage', 'CES %', 'percent'),
  field('product', 'Product', 'record', { record: 'product' }),
  field('seat_use', 'Seat use %', 'percent'),
  field('churned', 'Churned', 'boolean'),
  field('archived', 'Archived', 'boolean'),
];

const ACCOUNT: FieldDef[] = [...SHARED, field('organisation', 'Organisation', 'record', { record: 'customer' })];

const CONTACT: FieldDef[] = [
  field('role', 'Role', 'choice', { choices: CONTACT_ROLES }),
  field('sentiment', 'Sentiment', 'choice', { choices: SENTIMENTS }),
  field('status', 'Status', 'choice', { choices: STATUS }),
  field('language', 'Language', 'text'),
  field('last_contacted', 'Days since last contacted', 'days'),
  field('organisation', 'Organisation', 'record', { record: 'customer' }),
  field('account', 'Account', 'record', { record: 'account' }),
];

const ATTRIBUTE_TYPES: Record<AIAttribute['value_type'], ValueType> = {
  number: 'number',
  boolean: 'boolean',
  picklist: 'choice',
  text: 'text',
};

function attributeField(attribute: AIAttribute): FieldDef {
  return field(`${ATTRIBUTE_PREFIX}${attribute.api_name}`, attribute.name, ATTRIBUTE_TYPES[attribute.value_type], {
    choices: attribute.picklist_options.map((option) => ({ value: option, label: option })),
    optional: true,
    section: 'attribute',
  });
}

/** A contacts rule's `parent.<key>`: read on the contact's own organisation
 *  or account. Every organisation field qualifies (the account's own fields
 *  are a subset of them, and `organisation` is the contact's own). */
function parentField(own: FieldDef): FieldDef {
  return { ...own, key: `${PARENT_PREFIX}${own.key}`, label: `${own.label}${PARENT_SUFFIX}`, section: 'parent' };
}

export function fieldsFor(kind: SegmentKind, attributes: AIAttribute[]): FieldDef[] {
  if (kind === 'customer') return [...CUSTOMER, ...attributes.filter((a) => a.applies_to_customer).map(attributeField)];
  if (kind === 'account') return [...ACCOUNT, ...attributes.filter((a) => a.applies_to_account).map(attributeField)];
  return [
    ...CONTACT,
    ...CUSTOMER.map(parentField),
    ...attributes.filter((a) => a.applies_to_customer || a.applies_to_account).map((a) => parentField(attributeField(a))),
  ];
}

export function findField(kind: SegmentKind, key: string, attributes: AIAttribute[]): FieldDef | null {
  return fieldsFor(kind, attributes).find((f) => f.key === key) ?? null;
}

/** A member's own page. */
export function recordHref(kind: SegmentKind, id: number): string {
  if (kind === 'customer') return `/organizations/${id}`;
  if (kind === 'account') return `/accounts/${id}`;
  return `/contacts/${id}`;
}
