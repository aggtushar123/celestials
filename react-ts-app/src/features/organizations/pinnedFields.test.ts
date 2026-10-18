import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PINS, readPins, togglePin, writePins } from './pinnedFields';

describe('pinned fields', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts empty and remembers pins per user', () => {
    expect(readPins(1)).toEqual([]);
    writePins(1, ['nps', 'totalSeatUtilization']);
    expect(readPins(1)).toEqual(['nps', 'totalSeatUtilization']);
    expect(readPins(2)).toEqual([]);
    expect(localStorage.getItem('revenact.organizations.pins.1')).toBe('["nps","totalSeatUtilization"]');
  });

  it('drops unknown and header fields and caps at three', () => {
    localStorage.setItem('revenact.organizations.pins.1', JSON.stringify(['nps', 'owner', 'bogus', 'tcv', 'domain', 'cesPercentage']));
    expect(readPins(1)).toEqual(['nps', 'tcv', 'domain']);
    localStorage.setItem('revenact.organizations.pins.1', '{not json');
    expect(readPins(1)).toEqual([]);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPins(1)).toEqual([]);
    expect(() => writePins(1, ['nps'])).not.toThrow();
  });

  it('toggles a pin, never past the cap', () => {
    expect(togglePin([], 'nps')).toEqual(['nps']);
    expect(togglePin(['nps'], 'nps')).toEqual([]);
    const full = ['nps', 'tcv', 'domain'] as const;
    expect(full).toHaveLength(MAX_PINS);
    expect(togglePin([...full], 'cesPercentage')).toEqual([...full]);
  });
});
