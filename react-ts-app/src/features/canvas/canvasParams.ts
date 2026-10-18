/** `/canvas/12` gives 12; anything but a positive whole number is no map. */
export function parseMapId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

export function galleryQuery(q: string, cursor: string | null): string {
  const query = new URLSearchParams();
  if (q.trim()) query.set('q', q.trim());
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}
