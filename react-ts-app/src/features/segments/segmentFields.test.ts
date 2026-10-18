import { describe, expect, it } from 'vitest';
import type { AIAttribute } from '../attributes/types';
import { OPERATORS, fieldsFor, findField, operatorsOf, recordHref } from './segmentFields';

const attribute = (over: Partial<AIAttribute>): AIAttribute => ({
  id: 1,
  name: 'Tier',
  api_name: 'tier',
  prompt: '',
  value_type: 'picklist',
  picklist_options: ['SMB', 'Enterprise'],
  applies_to_customer: true,
  applies_to_account: false,
  refresh: 'manual',
  created_at: '',
  updated_at: '',
  ...over,
});

const keys = (kind: 'customer' | 'account' | 'contact', attributes: AIAttribute[] = []) => fieldsFor(kind, attributes).map((f) => f.key);

/** `fieldsFor`, reduced to the four things G12 pins: the key, the value
 *  type, the record a picker searches, and the raw choice values (never
 *  their labels — the registry stores no labels, only value strings). */
type Pinned = { key: string; type: string; record: string; choices: string[] };
const pinned = (kind: 'customer' | 'account' | 'contact', attributes: AIAttribute[] = []): Pinned[] =>
  fieldsFor(kind, attributes).map((f) => ({ key: f.key, type: f.type, record: f.record, choices: f.choices.map((c) => c.value) }));

// Every ordinary (non-attribute) field below is a literal table copied by
// hand from revenact-backend services/segments/registry.py on main
// (PR #84): each field's key, type, record and choice VALUES (the registry
// stores no labels — those are this frontend's own words). This test does
// not read the backend, so a backend change to the registry needs this
// table updated by hand; until it is, the change fails here.
const LIFECYCLE_CHOICES = ['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other'];
// registry.py:87 — `Customer.HealthCategory.values`, good/average/poor. Not
// the portfolio UI's severity order (poor/average/good).
const HEALTH_CHOICES = ['good', 'average', 'poor'];
const NPS_CHOICES = ['promoter', 'passive', 'detractor'];

/** What an organisation and an account both have (registry.py `_SHARED`). */
const SHARED_FIELDS: Pinned[] = [
  { key: 'lifecycle_stage', type: 'choice', record: '', choices: LIFECYCLE_CHOICES },
  { key: 'health_score', type: 'number', record: '', choices: [] },
  { key: 'health_category', type: 'choice', record: '', choices: HEALTH_CHOICES },
  { key: 'csat_score', type: 'percent', record: '', choices: [] },
  { key: 'nps_score', type: 'number', record: '', choices: [] },
  { key: 'nps_band', type: 'choice', record: '', choices: NPS_CHOICES },
  { key: 'arr', type: 'number', record: '', choices: [] },
  { key: 'renewal_date', type: 'date', record: '', choices: [] },
  { key: 'owner', type: 'owner', record: 'user', choices: [] },
  { key: 'open_tickets', type: 'number', record: '', choices: [] },
  { key: 'last_touch', type: 'days', record: '', choices: [] },
  { key: 'ai_pulse', type: 'number', record: '', choices: [] },
  { key: 'csm_pulse', type: 'number', record: '', choices: [] },
  { key: 'created', type: 'date', record: '', choices: [] },
];

/** registry.py `CUSTOMER_FIELDS` = `_SHARED` plus these five. */
const CUSTOMER_FIELDS: Pinned[] = [
  ...SHARED_FIELDS,
  { key: 'ces_percentage', type: 'percent', record: '', choices: [] },
  { key: 'product', type: 'record', record: 'product', choices: [] },
  { key: 'seat_use', type: 'percent', record: '', choices: [] },
  { key: 'churned', type: 'boolean', record: '', choices: [] },
  { key: 'archived', type: 'boolean', record: '', choices: [] },
];

/** registry.py `ACCOUNT_FIELDS` = `_SHARED` plus `organisation`. */
const ACCOUNT_FIELDS: Pinned[] = [...SHARED_FIELDS, { key: 'organisation', type: 'record', record: 'customer', choices: [] }];

/** registry.py `CONTACT_FIELDS`. */
const CONTACT_OWN_FIELDS: Pinned[] = [
  { key: 'role', type: 'choice', record: '', choices: ['executive_sponsor', 'champion', 'economic_buyer', 'technical_lead', 'decision_maker', 'influencer', 'finance_manager', 'other'] },
  { key: 'sentiment', type: 'choice', record: '', choices: ['positive', 'neutral', 'negative'] },
  { key: 'status', type: 'choice', record: '', choices: ['active', 'inactive'] },
  { key: 'language', type: 'text', record: '', choices: [] },
  { key: 'last_contacted', type: 'days', record: '', choices: [] },
  { key: 'organisation', type: 'record', record: 'customer', choices: [] },
  { key: 'account', type: 'record', record: 'account', choices: [] },
];

/** registry.py `resolve_parent`: every `CUSTOMER_FIELDS` key, as `parent.<key>`,
 *  type/record/choices unchanged (`PARENT_EXCLUDED` drops only `organisation`,
 *  which `CUSTOMER_FIELDS` never has). */
const PARENT_FIELDS: Pinned[] = CUSTOMER_FIELDS.map((f) => ({ ...f, key: `parent.${f.key}` }));
const CONTACT_FIELDS: Pinned[] = [...CONTACT_OWN_FIELDS, ...PARENT_FIELDS];

describe('segment fields mirror the backend registry', () => {
  it('pins every organisation field: its key, type, record and choice values, in registry order', () => {
    expect(pinned('customer')).toEqual(CUSTOMER_FIELDS);
  });

  it('pins every account field: the shared fields plus organisation, none of CES, product, seat use, churned or archived', () => {
    expect(pinned('account')).toEqual(ACCOUNT_FIELDS);
  });

  it('pins every contact field: its own seven, then parent.<every organisation field>, never parent.organisation', () => {
    expect(pinned('contact')).toEqual(CONTACT_FIELDS);
    expect(keys('contact')).not.toContain('parent.organisation');
  });

  it('takes each type\'s operators as the contract lists them', () => {
    expect(OPERATORS).toEqual({
      number: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
      percent: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
      days: ['gt', 'lt', 'between', 'is_empty'],
      date: ['within_next', 'within_last', 'gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
      choice: ['is', 'is_not', 'in'],
      text: ['is', 'is_not', 'in', 'is_empty', 'is_not_empty'],
      boolean: ['is'],
      owner: ['is', 'is_not', 'in'],
      record: ['is', 'is_not', 'in'],
    });
  });

  it('adds an AI attribute only where it applies, with its options and "not answered yet"', () => {
    const tier = attribute({});
    const seats = attribute({ id: 2, name: 'Seats band', api_name: 'seats', value_type: 'number', picklist_options: [], applies_to_customer: false, applies_to_account: true });
    expect(keys('customer', [tier, seats])).toContain('attr:tier');
    expect(keys('customer', [tier, seats])).not.toContain('attr:seats');
    expect(keys('account', [tier, seats])).toContain('attr:seats');
    expect(keys('account', [tier, seats])).not.toContain('attr:tier');
    expect(keys('contact', [tier, seats])).toEqual(expect.arrayContaining(['parent.attr:tier', 'parent.attr:seats']));
    expect(keys('contact', [tier, seats])).not.toContain('attr:tier');
    const field = findField('customer', 'attr:tier', [tier])!;
    expect(field.label).toBe('Tier');
    expect(field.choices.map((c) => c.value)).toEqual(['SMB', 'Enterprise']);
    expect(operatorsOf(field)).toEqual(['is', 'is_not', 'in', 'is_empty', 'is_not_empty']);
    expect(operatorsOf(findField('account', 'attr:seats', [seats])!)).toEqual(['gt', 'lt', 'between', 'is_empty', 'is_not_empty']);
  });

  it('labels a contact\'s parent field for what it reads, and finds nothing for a key the kind lacks', () => {
    expect(findField('contact', 'parent.csat_score', [])?.label).toBe('CSAT % of their organisation or account');
    expect(findField('contact', 'parent.csat_score', [])?.section).toBe('parent');
    expect(findField('customer', 'mood', [])).toBeNull();
    expect(findField('account', 'churned', [])).toBeNull();
  });

  it('links a record to its own page by kind', () => {
    expect([recordHref('customer', 7), recordHref('account', 12), recordHref('contact', 41)]).toEqual([
      '/organizations/7',
      '/accounts/12',
      '/contacts/41',
    ]);
  });
});
