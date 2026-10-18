/** "45 min", "1 h", "1 h 15 min"; '' when the length is not known. */
export function durationLabel(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
