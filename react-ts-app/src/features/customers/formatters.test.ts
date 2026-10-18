import { describe, it, expect } from 'vitest';
import { capitalize, formatRelativeTime } from './formatters';

describe('capitalize', () => {
  it('uppercases only the first letter', () => {
    expect(capitalize('active')).toBe('Active');
    expect(capitalize('positive')).toBe('Positive');
  });
});

describe('formatRelativeTime', () => {
  it('formats a past ISO datetime as "<duration> ago"', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
  });

  it('returns an em dash for null (Contact.last_contacted_at is nullable)', () => {
    expect(formatRelativeTime(null)).toBe('—');
  });
});
