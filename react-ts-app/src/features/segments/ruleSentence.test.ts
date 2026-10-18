// Pinned to a non-UTC, non-DST zone (IST, UTC+5:30) so the "whatever the
// time zone" test below can actually fail if `dayText` ever started reading
// a `Date` instead of parsing the string. Set before any Date is used.
process.env.TZ = 'Asia/Kolkata';

import { describe, expect, it } from 'vitest';
import type { AIAttribute } from '../attributes/types';
import { conditionParts, dayText, reasonText, ruleSentence, sentenceText } from './ruleSentence';
import { findField } from './segmentFields';
import { NO_LABELS, type Condition, type Rules } from './segmentTypes';
import { EMEA_ACCOUNTS, RENEWAL_RISK } from './testSegments';

const tier: AIAttribute = {
  id: 1, name: 'Tier', api_name: 'tier', prompt: '', value_type: 'picklist', picklist_options: ['SMB'],
  applies_to_customer: true, applies_to_account: true, refresh: 'manual', created_at: '', updated_at: '',
};
const read = (condition: Condition, kind: 'customer' | 'account' | 'contact' = 'customer', labels = NO_LABELS) =>
  sentenceText(conditionParts(condition, findField(kind, condition.field, [tier]), labels));

describe('ruleSentence', () => {
  it('reads the rules as one sentence, a group in brackets with its own and/or', () => {
    expect(sentenceText(ruleSentence(RENEWAL_RISK.rules, 'customer', NO_LABELS, []))).toBe(
      'Organisations where CSAT % is less than 60 and (Renewal date is in the next 90 days or Health is Poor)',
    );
  });

  it('joins with "or" when any condition will do', () => {
    const rules: Rules = { match: 'any', conditions: [{ field: 'churned', op: 'is', value: true }, { field: 'archived', op: 'is', value: false }] };
    expect(sentenceText(ruleSentence(rules, 'customer', NO_LABELS, []))).toBe('Organisations where Churned is yes or Archived is no');
  });

  it('names an organisation from the labels and never names one the reader cannot open', () => {
    const parts = ruleSentence(EMEA_ACCOUNTS.rules, 'account', EMEA_ACCOUNTS.labels, []);
    expect(sentenceText(parts)).toBe("Accounts where Organisation is any of Pizza Hut, an organisation you can't open");
    expect(parts.filter((p) => p.role === 'hidden').map((p) => p.text)).toEqual(["an organisation you can't open"]);
  });

  it('reads an owner as their name, Unassigned, or an owner you cannot open', () => {
    const labels = { ...NO_LABELS, people: { '4': 'Carl CSM' } };
    expect(read({ field: 'owner', op: 'in', value: [4, 'unassigned', 99, null] }, 'customer', labels)).toBe(
      "Owner is any of Carl CSM, Unassigned, an owner you can't open, an owner you can't open",
    );
  });

  it('reads dates, windows, ranges, days, empties, choices and text in words', () => {
    expect(read({ field: 'created', op: 'between', value: ['2026-01-05', '2026-03-31'] })).toBe('Created date is between 5 Jan 2026 and 31 Mar 2026');
    expect(read({ field: 'renewal_date', op: 'within_last', value: 30 })).toBe('Renewal date was in the last 30 days');
    expect(read({ field: 'renewal_date', op: 'gt', value: '2026-12-01' })).toBe('Renewal date is after 1 Dec 2026');
    expect(read({ field: 'last_touch', op: 'gt', value: 45 })).toBe('Days since last touch is more than 45 days');
    expect(read({ field: 'last_touch', op: 'is_empty' })).toBe('Days since last touch is never');
    expect(read({ field: 'arr', op: 'is_not_empty' })).toBe('ARR is not empty');
    expect(read({ field: 'lifecycle_stage', op: 'is_not', value: 'churn' })).toBe('Lifecycle stage is not Churn');
    expect(read({ field: 'language', op: 'is', value: 'de' }, 'contact')).toBe('Language is "de"');
  });

  it('labels parent and AI attribute fields, and falls back to the bare key for one it does not know', () => {
    expect(read({ field: 'parent.health_category', op: 'is', value: 'good' }, 'contact')).toBe('Health of their organisation or account is Good');
    expect(read({ field: 'attr:tier', op: 'is', value: 'SMB' })).toBe('Tier is SMB');
    expect(sentenceText(conditionParts({ field: 'attr:gone', op: 'is_empty' }, null, NO_LABELS))).toBe('gone is empty');
  });

  it('says a segment with no rules holds only its pins', () => {
    expect(sentenceText(ruleSentence({ match: 'all', conditions: [] }, 'contact', NO_LABELS, []))).toBe('No rules: only pinned contacts are members');
  });

  it('writes a day as day, short month and year, whatever the time zone (pinned to IST above)', () => {
    expect(dayText('2026-10-05')).toBe('5 Oct 2026');
  });

  it('flags a figure as numeric when it is built, not by a leading-digit guess: a day count and a plain number both qualify, a date does not', () => {
    const days = conditionParts({ field: 'renewal_date', op: 'within_next', value: 90 }, findField('customer', 'renewal_date', []), NO_LABELS);
    const number = conditionParts({ field: 'nps_score', op: 'lt', value: -20 }, findField('customer', 'nps_score', []), NO_LABELS);
    const date = conditionParts({ field: 'created', op: 'gt', value: '2026-12-01' }, findField('customer', 'created', []), NO_LABELS);
    expect(days.find((p) => p.text === '90 days')?.numeric).toBe(true);
    expect(number.find((p) => p.text === '-20')?.numeric).toBe(true);
    expect(date.find((p) => p.text === '1 Dec 2026')?.numeric).toBeFalsy();
  });

  it("reads a change's reasons as field names, or what happened to the record", () => {
    expect(reasonText(['csat_score', 'health_category'], 'entered', 'customer', [])).toBe('CSAT %, Health');
    expect(reasonText(['pinned'], 'entered', 'customer', [])).toBe('Pinned');
    expect(reasonText(['pinned'], 'left', 'customer', [])).toBe('Unpinned');
    expect(reasonText(['access', 'deleted'], 'left', 'account', [])).toBe("No longer in the owner's book, Deleted");
  });

  it("strips attr: and parent. from a reason key the mirror can't name (a deleted attribute), never the raw key", () => {
    expect(reasonText(['attr:old_name'], 'entered', 'customer', [])).toBe('old_name');
    expect(reasonText(['parent.old_name'], 'entered', 'contact', [])).toBe('old_name');
  });
});
