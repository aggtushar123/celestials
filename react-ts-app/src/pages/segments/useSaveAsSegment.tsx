import { useCallback, useState, type ReactNode } from 'react';
import { saveAsSegmentSearch } from '../../features/segments/fromListFilters';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { NewSegmentModal } from './Builder';

/** A list's Save as segment (owner, 2026-10-03): the builder modal opens over
 *  the list itself, starting from its filters, so Cancel leaves the reader
 *  where they were. Returns the toolbar's handler and the modal to render. */
export function useSaveAsSegment(kind: SegmentKind): [(listQuery: string) => void, ReactNode] {
  const [search, setSearch] = useState<URLSearchParams | null>(null);
  const open = useCallback((listQuery: string) => setSearch(saveAsSegmentSearch(kind, listQuery)), [kind]);
  const modal = search ? <NewSegmentModal search={search} onClose={() => setSearch(null)} /> : null;
  return [open, modal];
}
