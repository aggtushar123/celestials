// A leaf module: imports nothing from bundleText, work/recommended or agentsText,
// so the source line and the agents words can both use it without a cycle.
import { formatDate } from '../customers/formatters';
import { localDay, timeLabel } from '../organizations/storyDays';

/** "9:58 AM" today, "7 Oct 2026, 9:58 AM" another day, in the reader's time zone. */
export function whenText(iso: string, now: Date = new Date()): string {
  const clock = timeLabel({ occurred_at: iso, all_day: false });
  const day = localDay(new Date(iso));
  return day === localDay(now) ? clock : `${formatDate(day)}, ${clock}`;
}
