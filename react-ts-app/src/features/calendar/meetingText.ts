// How a meeting's time reads on a card, in the reader's own time zone.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3:00 pm". */
export function clock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The day a meeting falls on: "Today", "Tomorrow", "Mon" within a week, else "Oct 24". */
export function meetingDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return 'Today';
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  const days = (d.getTime() - now.getTime()) / 86_400_000;
  if (days > 0 && days < 7) return DAYS[d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Today · 3:00 pm", or "Tomorrow · all day". */
export function meetingWhen(meeting: { starts_at: string; all_day: boolean }, now = new Date()): string {
  return `${meetingDay(meeting.starts_at, now)} · ${meeting.all_day ? 'all day' : clock(meeting.starts_at)}`;
}

/** "3:00 pm – 3:30 pm", or "All day". */
export function meetingSpan(meeting: { starts_at: string; ends_at: string; all_day: boolean }): string {
  return meeting.all_day ? 'All day' : `${clock(meeting.starts_at)} – ${clock(meeting.ends_at)}`;
}

/** The local calendar date, "YYYY-MM-DD", for grouping by day. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
