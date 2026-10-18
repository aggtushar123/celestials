import { describe, expect, it } from 'vitest';
import { parseParams } from '../organizations/portfolioParams';
import {
  ACCOUNT_BOARD_GROUP_OPTIONS,
  ACCOUNT_FIELDS,
  ACCOUNT_GROUP_OPTIONS,
  ACCOUNT_HEADER_FIELDS,
  ACCOUNT_LIFECYCLE_TARGETS,
  ACCOUNT_PANEL_ORDER,
  ACCOUNT_SORT_OPTIONS,
  organisationText,
  type AccountFieldId,
} from './accountFields';
import { ACCOUNT_PARAMS } from './portfolioParams';
import { globexNa, initechApac, pizzaEmea } from './testPortfolio';

/** services/accounts_portfolio/fields.py, in its order. */
const BACKEND_IDS: AccountFieldId[] = [
  'account', 'revenactId', 'organizations', 'owner', 'lifecycleStage', 'health', 'pulse', 'aiPulseScore',
  'aiPulseValue', 'csmPulseScore', 'csmPulseModifiedAt', 'aiPulseReason', 'nps', 'csatScore', 'renewalDate',
  'arr', 'domain', 'industry', 'email', 'phone', 'address', 'createdDate', 'modifiedDate', 'pulseRecordedOn',
];

const value = (id: AccountFieldId, row = pizzaEmea) => ACCOUNT_FIELDS[id].value(row, 'USD');

describe('the account field registry', () => {
  it("names the backend's 24 fields, each in the header or one panel", () => {
    expect(Object.keys(ACCOUNT_FIELDS).sort()).toEqual([...BACKEND_IDS].sort());
    const placed = [...ACCOUNT_HEADER_FIELDS, ...Object.values(ACCOUNT_PANEL_ORDER).flat()];
    expect(placed.sort()).toEqual([...BACKEND_IDS].sort());
    expect(ACCOUNT_HEADER_FIELDS).toEqual(['account', 'owner', 'lifecycleStage', 'health', 'pulse', 'aiPulseScore', 'aiPulseValue', 'csmPulseScore']);
    expect(ACCOUNT_PANEL_ORDER).toEqual({
      commercial: ['arr', 'renewalDate'],
      voice: ['nps', 'csatScore', 'aiPulseReason'],
      profile: ['revenactId', 'organizations', 'domain', 'industry', 'email', 'phone', 'address'],
      history: ['createdDate', 'modifiedDate', 'pulseRecordedOn', 'csmPulseModifiedAt'],
    });
  });

  it('formats each value as the panels print it', () => {
    expect(value('arr')).toBe('$69,600.00');
    expect(ACCOUNT_FIELDS.arr.value(pizzaEmea, 'EUR')).toBe('€69,600.00');
    expect(value('renewalDate')).toBe('9 Aug 2026');
    expect(value('nps')).toBe('−80');
    expect(value('csatScore')).toBe('62%');
    expect(value('organizations')).toBe('Pizza Hut, Yum Brands');
    expect(value('createdDate')).toBe('1 Aug 2024');
    expect(value('pulseRecordedOn')).toBe('20 Sep 2026');
    expect(value('csmPulseModifiedAt')).toBe('18 Sep 2026');
    expect(value('aiPulseValue')).toBe('1');
    expect(value('csmPulseScore')).toBe('3');
    expect(value('pulse')).toBe('good, poor, poor');
  });

  it('shows a dash for what is not known', () => {
    for (const id of ['aiPulseValue', 'csmPulseScore', 'aiPulseScore', 'domain', 'organizations', 'renewalDate', 'nps', 'csatScore', 'pulse', 'pulseRecordedOn'] as const) {
      expect(value(id, initechApac)).toBe('—');
    }
    expect(value('owner', initechApac)).toBe('Unassigned');
  });

  it('offers the five sorts, the groups, and every stage (Churn included) as a bulk target', () => {
    expect(ACCOUNT_SORT_OPTIONS.map((o) => o.value)).toEqual(['risk', 'arr', 'renewal', 'health', 'name']);
    expect(ACCOUNT_GROUP_OPTIONS.map((o) => o.value)).toEqual(['none', 'health', 'owner', 'lifecycle', 'renewal']);
    expect(ACCOUNT_BOARD_GROUP_OPTIONS.map((o) => o.value)).toEqual(['health', 'owner', 'lifecycle', 'renewal']);
    expect(ACCOUNT_LIFECYCLE_TARGETS.map((o) => o.value)).toEqual(['onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other']);
  });

  it('names the organisation line: the first one the viewer may open, then +N', () => {
    expect(organisationText(pizzaEmea)).toBe('Pizza Hut +1');
    expect(organisationText(globexNa)).toBe('Globex');
    expect(organisationText(initechApac)).toBeNull();
  });
});

describe('the account parameters', () => {
  it('read organisation, drop product and churned, and keep only the five sorts and four groups', () => {
    const p = parseParams(new URLSearchParams('organisation=7&product=1&include_churned=1&sort=-touch&group=product'), 'health', ACCOUNT_PARAMS);
    expect(p.organisation).toEqual(['7']);
    expect(p.product).toEqual([]);
    expect(p.include_churned).toBe(false);
    expect(p.sort).toBe('-arr');
    expect(p.group).toBe('health');
    expect(parseParams(new URLSearchParams('sort=risk&group=renewal'), 'health', ACCOUNT_PARAMS)).toMatchObject({ sort: 'risk', group: 'renewal' });
  });
});
