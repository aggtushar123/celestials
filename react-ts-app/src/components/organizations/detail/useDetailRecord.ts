import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/apiClient';
import { errorMessage } from '../portfolio/usePortfolio';

/** Where a detail page reads from: its portfolio row (with whatever else the
 *  read carries, `extra`) and its record. Define it once at module level, so
 *  its identity never changes. */
export interface DetailSource<Row, Extra> {
  /** The portfolio row for this id, or null when the viewer has none. */
  readRow: (id: number) => Promise<{ row: Row | null; extra: Extra }>;
  recordPath: (id: number) => string;
  rowError: string;
  recordError: string;
}

type RowLoad<Row> = { key: string; row: Row | null } | { key: string; error: string };
type RecordLoad<Rec> = { key: string; record: Rec } | { key: string; error: string };

export interface DetailRecordState<Row, Extra, Rec> {
  /** The row for this id; null until it lands, or when not found. The last
   *  one that landed stays while a reload runs or fails. */
  row: Row | null;
  /** What came with that row; null exactly when `row` is. */
  extra: Extra | null;
  record: Rec | null;
  /** The row for the current id and version has not landed (or failed) yet. */
  loading: boolean;
  /** No id, or no row for it (the viewer may not open it). */
  notFound: boolean;
  error: string | null;
  recordError: string | null;
  retry: () => void;
}

/** A detail page's two reads, fired together by the id alone: the portfolio
 *  row and the record. A new `version` (after an edit, say) reloads both
 *  while the old row stays on screen; a row or record for another id never
 *  shows. No id reads nothing and is not found. */
export function useDetailRecord<Row extends { id: number }, Extra, Rec extends { id: number }>(
  id: number | null,
  version: number,
  source: DetailSource<Row, Extra>,
): DetailRecordState<Row, Extra, Rec> {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${version}#${attempt}`;
  const [rowLoad, setRowLoad] = useState<RowLoad<Row> | null>(null);
  // The last row that landed: it stays on screen while a new version reloads
  // and after a reload fails, so a failed refresh never blanks the page.
  const [last, setLast] = useState<{ row: Row; extra: Extra } | null>(null);
  const [recordLoad, setRecordLoad] = useState<RecordLoad<Rec> | null>(null);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    source.readRow(id).then(
      ({ row, extra }) => {
        if (cancelled) return;
        setRowLoad({ key, row });
        setLast(row ? { row, extra } : null);
      },
      (err: unknown) => {
        if (!cancelled) setRowLoad({ key, error: errorMessage(err, source.rowError) });
      },
    );
    apiFetch<Rec>(source.recordPath(id)).then(
      (record) => {
        if (!cancelled) setRecordLoad({ key, record });
      },
      (err: unknown) => {
        if (!cancelled) setRecordLoad({ key, error: errorMessage(err, source.recordError) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, key, source]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const shown = rowLoad && 'row' in rowLoad ? rowLoad : null;
  const current = last && last.row.id === id ? last : null;
  const record = recordLoad && 'record' in recordLoad && recordLoad.record.id === id ? recordLoad.record : null;
  return {
    row: current?.row ?? null,
    extra: current?.extra ?? null,
    record,
    loading: id !== null && rowLoad?.key !== key,
    notFound: id === null || (shown !== null && shown.key === key && shown.row === null),
    error: rowLoad && 'error' in rowLoad && rowLoad.key === key ? rowLoad.error : null,
    recordError: recordLoad && 'error' in recordLoad && recordLoad.key === key ? recordLoad.error : null,
    retry,
  };
}
