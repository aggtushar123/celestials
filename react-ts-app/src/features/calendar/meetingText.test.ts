import { describe, expect, it } from 'vitest';
import { clock, localDate, meetingDay, meetingSpan, meetingWhen } from './meetingText';

// Local times throughout: the reader's own zone decides "Today".
const now = new Date(2026, 9, 17, 9, 0); // Sat 17 Oct 2026, 9:00
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

describe('meeting times', () => {
  it('reads a clock in 12-hour time', () => {
    expect(clock(at(17, 15))).toBe('3:00 pm');
    expect(clock(at(17, 0, 5))).toBe('12:05 am');
    expect(clock(at(17, 12, 30))).toBe('12:30 pm');
  });

  it('names the day: today, tomorrow, a weekday this week, else the date', () => {
    expect(meetingDay(at(17, 18), now)).toBe('Today');
    expect(meetingDay(at(18, 10), now)).toBe('Tomorrow');
    expect(meetingDay(at(20, 10), now)).toBe('Tue');
    expect(meetingDay(at(30, 10), now)).toBe('Oct 30');
  });

  it('puts day and time together, and all-day meetings say so', () => {
    expect(meetingWhen({ starts_at: at(17, 15), all_day: false }, now)).toBe('Today · 3:00 pm');
    expect(meetingWhen({ starts_at: at(18, 0), all_day: true }, now)).toBe('Tomorrow · all day');
    expect(meetingSpan({ starts_at: at(17, 15), ends_at: at(17, 15, 30), all_day: false })).toBe('3:00 pm – 3:30 pm');
    expect(meetingSpan({ starts_at: at(17, 0), ends_at: at(18, 0), all_day: true })).toBe('All day');
  });

  it('groups by the local date', () => {
    expect(localDate(at(17, 23, 30))).toBe('2026-10-17');
  });
});
