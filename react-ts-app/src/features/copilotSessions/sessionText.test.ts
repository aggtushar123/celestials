import { describe, it, expect } from 'vitest';
import { hiddenDecisionsText } from './sessionText';

describe('hiddenDecisionsText', () => {
  it('is null when nothing is hidden', () => {
    expect(hiddenDecisionsText(0)).toBeNull();
  });

  it('is null for a negative count (defensive)', () => {
    expect(hiddenDecisionsText(-1)).toBeNull();
  });

  it('is singular for exactly one', () => {
    expect(hiddenDecisionsText(1)).toBe("1 more decision about a record you can't open");
  });

  it('is plural for more than one', () => {
    expect(hiddenDecisionsText(4)).toBe("4 more decisions about records you can't open");
  });
});
