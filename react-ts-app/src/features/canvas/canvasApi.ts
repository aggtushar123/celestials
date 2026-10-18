// Thin apiFetch wrappers over revenact-backend's /api/v1/canvases/ (spec §4).
import { accountBase } from '../../lib/accountPaths';
import { apiFetch } from '../../lib/apiClient';
import { galleryQuery } from './canvasParams';
import type { Canvas, CanvasCreate, CanvasPatch, GalleryPage, RecordKind, RecordMaps } from './canvasTypes';

export const CANVASES_PATH = '/canvases/';
const one = (id: number) => `${CANVASES_PATH}${id}/`;

export function fetchGallery(q: string, cursor: string | null): Promise<GalleryPage> {
  const query = galleryQuery(q, cursor);
  return apiFetch<GalleryPage>(query ? `${CANVASES_PATH}?${query}` : CANVASES_PATH);
}

/** Contract note 1: an account's maps through the flat account route. */
export function recordMapsPath(record: { kind: RecordKind; id: number }): string {
  return record.kind === 'organization' ? `/customers/${record.id}/canvases/` : `${accountBase(record.id)}/canvases/`;
}

export function fetchRecordMaps(record: { kind: RecordKind; id: number }): Promise<RecordMaps> {
  return apiFetch<RecordMaps>(recordMapsPath(record));
}

export function createMap(body: CanvasCreate): Promise<Canvas> {
  return apiFetch<Canvas>(CANVASES_PATH, { method: 'POST', body });
}

export function fetchMap(id: number): Promise<Canvas> {
  return apiFetch<Canvas>(one(id));
}

export function saveMap(id: number, body: CanvasPatch): Promise<Canvas> {
  return apiFetch<Canvas>(one(id), { method: 'PATCH', body });
}

export function deleteMap(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}
