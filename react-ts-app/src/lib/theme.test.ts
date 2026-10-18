import { describe, expect, it } from 'vitest';
import { themeIsDark } from './theme';

describe('themeIsDark (surveys plan Decision 5)', () => {
  it('follows the setting, and the system preference for "system"', () => {
    expect(themeIsDark('dark', false, '/dashboard')).toBe(true);
    expect(themeIsDark('light', true, '/dashboard')).toBe(false);
    expect(themeIsDark('system', true, '/dashboard')).toBe(true);
    expect(themeIsDark('system', false, '/dashboard')).toBe(false);
  });

  it('is always light on the hosted survey form, and only there', () => {
    expect(themeIsDark('dark', true, '/s/abc')).toBe(false);
    expect(themeIsDark('system', true, '/s/abc')).toBe(false);
    expect(themeIsDark('dark', true, '/surveys')).toBe(true);
    expect(themeIsDark('dark', true, '/settings')).toBe(true);
  });

  it('is always light on the unsubscribe page too (campaigns spec §2.4)', () => {
    expect(themeIsDark('dark', true, '/u/tok-41-51')).toBe(false);
    expect(themeIsDark('system', true, '/u/tok-41-51')).toBe(false);
    expect(themeIsDark('dark', true, '/users')).toBe(true);
  });
});
