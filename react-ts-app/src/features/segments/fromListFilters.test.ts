import { describe, expect, it } from 'vitest';
import { INCLUDE_CHURNED, NO_RULES_NOTE, rulesFromList, saveAsSegmentHref } from './fromListFilters';

const q = (text: string) => new URLSearchParams(text);

describe('Save as segment: list filters to rules (plan Decision 5)', () => {
  it('turns every Organizations filter into one condition, in the list\'s own order', () => {
    const { rules, notes, ids } = rulesFromList('customer', q('owner=2&lifecycle=live,renewal&health=poor&product=3&renews_within=90&nps=detractor'));
    expect(rules).toEqual({
      match: 'all',
      conditions: [
        { field: 'owner', op: 'is', value: 2 },
        { field: 'lifecycle_stage', op: 'in', value: ['live', 'renewal'] },
        { field: 'health_category', op: 'is', value: 'poor' },
        { field: 'product', op: 'is', value: 3 },
        { field: 'renewal_date', op: 'within_next', value: 90 },
        { field: 'nps_band', op: 'is', value: 'detractor' },
      ],
    });
    expect(notes).toEqual([]);
    expect(ids).toEqual({ customer: [], account: [] });
  });

  it('keeps an unassigned owner as the word the registry takes', () => {
    expect(rulesFromList('customer', q('owner=unassigned')).rules.conditions).toEqual([{ field: 'owner', op: 'is', value: 'unassigned' }]);
  });

  it('lifts the churned default for include_churned=1 with "churned or not", unless a lifecycle already names churn', () => {
    expect(rulesFromList('customer', q('health=good&include_churned=1')).rules.conditions).toEqual([
      { field: 'health_category', op: 'is', value: 'good' },
      INCLUDE_CHURNED,
    ]);
    expect(INCLUDE_CHURNED).toEqual({
      group: { match: 'any', conditions: [{ field: 'churned', op: 'is', value: true }, { field: 'churned', op: 'is', value: false }] },
    });
    expect(rulesFromList('customer', q('lifecycle=churn&include_churned=1')).rules.conditions).toEqual([
      { field: 'lifecycle_stage', op: 'is', value: 'churn' },
    ]);
  });

  it('names what does not carry over: the search and the picked records', () => {
    const { rules, notes } = rulesFromList('customer', q('search=pizza&ids=7,1&health=poor'));
    expect(rules.conditions).toEqual([{ field: 'health_category', op: 'is', value: 'poor' }]);
    expect(notes).toEqual([
      'The search "pizza" isn\'t carried over: a segment has no search rule.',
      "2 picked organisations from the list aren't carried over: a rule can't name records one by one.",
    ]);
  });

  it('says the segment starts with no rules when nothing became one', () => {
    expect(rulesFromList('customer', q('search=pizza')).notes).toEqual([
      'The search "pizza" isn\'t carried over: a segment has no search rule.',
      NO_RULES_NOTE,
    ]);
    expect(rulesFromList('account', q('')).notes).toEqual([NO_RULES_NOTE]);
  });

  it('turns the Accounts filters, organisations included, and asks for those organisations\' names', () => {
    const { rules, ids } = rulesFromList('account', q('organisation=7,9&lifecycle=live&product=3&include_churned=1'));
    expect(rules.conditions).toEqual([
      { field: 'lifecycle_stage', op: 'is', value: 'live' },
      { field: 'organisation', op: 'in', value: [7, 9] },
    ]);
    expect(ids).toEqual({ customer: [7, 9], account: [] });
  });

  it('turns the Contacts filters into organisation, account, sentiment and role, and its q into a note', () => {
    const { rules, notes, ids } = rulesFromList('contact', q('q=lu&customer=6&account=31&sentiment=negative&role=champion'));
    expect(rules.conditions).toEqual([
      { field: 'organisation', op: 'is', value: 6 },
      { field: 'account', op: 'is', value: 31 },
      { field: 'sentiment', op: 'is', value: 'negative' },
      { field: 'role', op: 'is', value: 'champion' },
    ]);
    expect(notes).toEqual(['The search "lu" isn\'t carried over: a segment has no search rule.']);
    expect(ids).toEqual({ customer: [6], account: [31] });
  });

  it('opens the builder with the kind first and the list query unchanged', () => {
    expect(saveAsSegmentHref('customer', 'search=pizza&owner=2')).toBe('/segments/new?kind=customer&search=pizza&owner=2');
    expect(saveAsSegmentHref('contact', '')).toBe('/segments/new?kind=contact');
  });
});
