import { describe, expect, it } from 'vitest';
import { durationLabel } from './callFormat';

describe('durationLabel', () => {
  it('reads minutes as minutes and hours', () => {
    expect(durationLabel(null)).toBe('');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(60)).toBe('1 h');
    expect(durationLabel(75)).toBe('1 h 15 min');
  });
});
