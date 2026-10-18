import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { firstError, hasErrors, NO_ERRORS, ruleErrors } from './ruleErrors';

const refused = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');

describe('refusals at their fields (backend contract)', () => {
  it('puts each field message at its field and an unknown key on the form', () => {
    expect(ruleErrors(refused(400, { name: ['This field may not be blank.'], threshold: ['Choose a value from 0 to 100.'], rule: ['Nope.'] }))).toEqual({
      form: 'Nope.',
      field: { name: 'This field may not be blank.', threshold: 'Choose a value from 0 to 100.' },
      action: [],
    });
  });

  it('reads the actions list both ways: one message, or one per action', () => {
    expect(ruleErrors(refused(400, { actions: ['Each action can be used once per rule.'] }))).toEqual({ field: { actions: 'Each action can be used once per rule.' }, action: [] });
    expect(ruleErrors(refused(400, { actions: [{}, { title: ['Give the task a title.'] }] }))).toEqual({ field: {}, action: [{}, { title: 'Give the task a title.' }] });
  });

  it('puts the segment ownership 403 at the segment, other details on the form', () => {
    expect(ruleErrors(refused(403, { detail: 'A rule can only use your own segments.' }))).toEqual({ field: { segment: 'A rule can only use your own segments.' }, action: [] });
    expect(ruleErrors(refused(429, { detail: 'You can own at most 50 rules.' }))).toEqual({ form: 'You can own at most 50 rules.', field: {}, action: [] });
  });

  it('reads a 404 as gone, and anything else as the fallback', () => {
    expect(ruleErrors(refused(404, { detail: 'Not found.' })).form).toBe('This rule or its segment is no longer there.');
    expect(ruleErrors(new Error('offline')).form).toBe('Could not save this rule. Try again.');
    expect(ruleErrors(new Error('offline'), 'Could not test this rule.').form).toBe('Could not test this rule.');
  });

  it('tells whether anything is wrong, and gives one line for a place with no fields', () => {
    expect(hasErrors(NO_ERRORS)).toBe(false);
    expect(hasErrors({ field: {}, action: [{}, {}] })).toBe(false);
    expect(hasErrors({ field: {}, action: [{}, { title: 'x' }] })).toBe(true);
    expect(firstError({ field: { segment: 'Choose a segment.' }, action: [] })).toBe('Choose a segment.');
    expect(firstError({ form: 'Nope.', field: { segment: 'x' }, action: [] })).toBe('Nope.');
  });
});
