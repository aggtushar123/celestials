import { formatDate } from '../customers/formatters';

// Day grouping for the story stream (spec §1.6 "grouped by day, newest first").

const pad = (n: number) => String(n).padStart(2, '0');

/** What the day grouping reads from a story item: `occurred_at` is always a
 *  UTC timestamp, and `all_day` marks a date-only record (midnight UTC). */
export type Timed = { occurred_at: string; all_day: boolean };

/** YYYY-MM-DD of a moment in the viewer's time zone. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The calendar day an item happened on: a timed item in the viewer's time
 *  zone; an all-day item is the date part of its timestamp, so it never
 *  moves to the day before west of UTC. */
export function dayKey(item: Timed): string {
  return item.all_day ? item.occurred_at.slice(0, 10) : localDay(new Date(item.occurred_at));
}

/** "2:05 PM", or '' for an all-day item. */
export function timeLabel(item: Timed): string {
  if (item.all_day) return '';
  return new Date(item.occurred_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "Today", "Yesterday" or "31 Aug 2026". */
export function dayLabel(key: string, today: string): string {
  if (key === today) return 'Today';
  const [y, m, d] = today.split('-').map(Number);
  if (key === localDay(new Date(y, m - 1, d - 1))) return 'Yesterday';
  return formatDate(key);
}

/** One group per day, days in the order they first appear. */
export function groupByDay<T extends Timed>(items: T[]): { key: string; items: T[] }[] {
  const days = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(item);
    const day = days.get(key);
    if (day) day.push(item);
    else days.set(key, [item]);
  }
  return [...days].map(([key, dayItems]) => ({ key, items: dayItems }));
}
