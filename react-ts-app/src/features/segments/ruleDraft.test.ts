import { describe, expect, it } from 'vitest';
import {
  addCondition,
  addGroup,
  conditionCount,
  firstIncomplete,
  fromRules,
  isComplete,
  isDraftGroup,
  newCondition,
  removeNode,
  setMatch,
  toRules,
  updateCondition,
  withField,
  withOp,
  type DraftCondition,
} from './ruleDraft';
import { findField, type FieldDef } from './segmentFields';
import { RENEWAL_RISK } from './testSegments';

const f = (key: string): FieldDef => findField('customer', key, [])!;
const fieldOf = (key: string) => findField('customer', key, []);

describe('rule draft', () => {
  it('round-trips saved rules, groups included, and leaves no value on a valueless condition', () => {
    expect(toRules(fromRules(RENEWAL_RISK.rules))).toEqual(RENEWAL_RISK.rules);
    const draft = fromRules({ match: 'any', conditions: [{ field: 'arr', op: 'is_empty' }] });
    expect(toRules(draft).conditions[0]).toEqual({ field: 'arr', op: 'is_empty' });
  });

  it("starts a condition on the field's first operator, and a yes/no one on yes", () => {
    expect(newCondition(f('csat_score'))).toMatchObject({ field: 'csat_score', op: 'gt', value: undefined });
    expect(newCondition(f('churned'))).toMatchObject({ op: 'is', value: true });
    expect(newCondition(f('lifecycle_stage'))).toMatchObject({ op: 'is', value: undefined });
  });

  it('resets the operator and value when the field changes', () => {
    const csat: DraftCondition = { uid: 'x', field: 'csat_score', op: 'between', value: [50, 70] };
    expect(withField(csat, f('renewal_date'))).toEqual({ uid: 'x', field: 'renewal_date', op: 'within_next', value: undefined });
  });

  it('keeps what still fits when the operator changes, and starts over when it does not', () => {
    const base: DraftCondition = { uid: 'x', field: 'csat_score', op: 'gt', value: 60 };
    expect(withOp(base, f('csat_score'), 'lt').value).toBe(60);
    expect(withOp(base, f('csat_score'), 'between').value).toEqual([60, undefined]);
    expect(withOp({ ...base, op: 'between', value: [40, 70] }, f('csat_score'), 'gt').value).toBe(40);
    expect(withOp(base, f('csat_score'), 'is_empty').value).toBeUndefined();
    const stage: DraftCondition = { uid: 'y', field: 'lifecycle_stage', op: 'is', value: 'live' };
    expect(withOp(stage, f('lifecycle_stage'), 'in').value).toEqual(['live']);
    expect(withOp({ ...stage, op: 'in', value: ['live', 'renewal'] }, f('lifecycle_stage'), 'is_not').value).toBe('live');
    const renewal: DraftCondition = { uid: 'z', field: 'renewal_date', op: 'gt', value: '2026-12-01' };
    expect(withOp(renewal, f('renewal_date'), 'within_next').value).toBeUndefined();
  });

  it('calls a condition complete only with every value its operator needs', () => {
    const c = (op: DraftCondition['op'], value: DraftCondition['value'], field = 'csat_score'): DraftCondition => ({ uid: 'x', field, op, value });
    expect(isComplete(c('gt', 60), f('csat_score'))).toBe(true);
    expect(isComplete(c('gt', undefined), f('csat_score'))).toBe(false);
    expect(isComplete(c('between', [60, undefined]), f('csat_score'))).toBe(false);
    expect(isComplete(c('is_empty', undefined), f('csat_score'))).toBe(true);
    expect(isComplete(c('in', [], 'lifecycle_stage'), f('lifecycle_stage'))).toBe(false);
    expect(isComplete(c('is', null, 'owner'), f('owner'))).toBe(true);
    expect(isComplete(c('is', 'live', 'lifecycle_stage'), null)).toBe(false);
    expect(isComplete(c('is', 'live', 'lifecycle_stage'), f('csat_score'))).toBe(false);
  });

  it('adds a group asking the other question, counts conditions inside groups, and finds the first unfinished one', () => {
    let draft = addCondition(fromRules(null), f('csat_score'));
    draft = addGroup(draft, f('lifecycle_stage'));
    const group = draft.conditions[1];
    expect(isDraftGroup(group) && group.match).toBe('any');
    draft = addCondition(draft, f('health_category'), group.uid);
    expect(conditionCount(draft)).toBe(3);
    expect(firstIncomplete(draft, fieldOf)).toBe(draft.conditions[0].uid);
    const first = draft.conditions[0].uid;
    draft = updateCondition(draft, first, (c) => ({ ...c, value: 60 }));
    expect(firstIncomplete(draft, fieldOf)).toBe(isDraftGroup(group) ? group.conditions[0].uid : null);
  });

  it('removes a group with its last condition, and sets all/any on the rules or on one group', () => {
    let draft = addGroup(fromRules(null), f('csat_score'));
    const group = draft.conditions[0];
    draft = setMatch(draft, 'all', group.uid);
    expect(isDraftGroup(draft.conditions[0]) && draft.conditions[0].match).toBe('all');
    draft = setMatch(draft, 'any');
    expect(draft.match).toBe('any');
    const only = isDraftGroup(group) ? group.conditions[0].uid : '';
    expect(removeNode(draft, only).conditions).toEqual([]);
  });
});
