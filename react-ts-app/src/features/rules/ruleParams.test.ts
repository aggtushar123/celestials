import { describe, expect, it } from 'vitest';
import { openRun, scenariosTab } from './ruleParams';

describe('the rules URL state', () => {
  it('opens Rules unless the tab is canvas (plan Decision 2)', () => {
    expect(scenariosTab(new URLSearchParams(''))).toBe('rules');
    expect(scenariosTab(new URLSearchParams('tab=canvas'))).toBe('canvas');
    expect(scenariosTab(new URLSearchParams('tab=nonsense'))).toBe('rules');
  });

  it('reads ?run= as a night id, or nothing', () => {
    expect(openRun(new URLSearchParams('run=9'))).toBe(9);
    expect(openRun(new URLSearchParams('run=x'))).toBeNull();
    expect(openRun(new URLSearchParams(''))).toBeNull();
  });
});
