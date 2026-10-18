import { describe, expect, it } from 'vitest';
import { isWorkPath } from './workTabs';

describe('workTabs', () => {
  it('knows a Work route, and nothing that only starts with the same letters', () => {
    expect(isWorkPath('/work')).toBe(true);
    expect(isWorkPath('/work/mine')).toBe(true);
    expect(isWorkPath('/workspace')).toBe(false);
    expect(isWorkPath('/settings/work')).toBe(false);
  });
});
