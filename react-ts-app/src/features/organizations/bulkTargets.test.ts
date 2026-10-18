import { describe, expect, it } from 'vitest';
import { LIFECYCLE_TARGETS, ownerTargets } from './bulkTargets';

describe('bulk targets', () => {
  it('offers every stage but churn, whether or not an account is in it', () => {
    expect(LIFECYCLE_TARGETS.map((option) => option.value)).toEqual([
      'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'expansion', 'other',
    ]);
    expect(LIFECYCLE_TARGETS.find((option) => option.value === 'expansion')?.name).toBe('Expansion');
  });

  it('always offers Unassigned, then active members only', () => {
    expect(
      ownerTargets([
        { id: 9, name: 'Nora New', is_active: true },
        { id: 4, name: 'Gone', is_active: false },
      ]),
    ).toEqual([
      { value: 'unassigned', name: 'Unassigned' },
      { value: '9', name: 'Nora New' },
    ]);
    expect(ownerTargets([])).toEqual([{ value: 'unassigned', name: 'Unassigned' }]);
  });
});
