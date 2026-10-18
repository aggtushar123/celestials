import { useCallback, useEffect, useState } from 'react';
import type { PortfolioNoun } from '../../../features/organizations/portfolioLabels';
import { usePagedRead, type Paged, type PagedRead } from './usePagedRead';

/** A page's whole-book read, plus M for "N of M". */
export interface PagedBook<R, P extends Paged<R> & { count: number }> extends PagedRead<R, P> {
  /** M in "N of M": the count `probeQuery` answers. Null when there is no
   *  probe (no filter narrows the book; the page then says "N things") or it
   *  has not answered. Never less than N (the frame's own count), even if
   *  the probe's answer is momentarily stale. */
  total: number | null;
}

/** The frame read of a page's book (Organizations, Accounts, Pipelines):
 *  the tiles, groups, filter options, count and currency, with the rows when
 *  the list is flat. Grouped, each section or column reads its own rows, so
 *  the frame's `query` asks for one row and its `next`/`loadMore` are
 *  suppressed here. `probeQuery` (null for none) is read once more for M,
 *  reloading when it or `totalVersion` changes. `read` and `noun` must be
 *  stable, as for `usePagedRead`. */
export function usePagedBook<R, P extends Paged<R> & { count: number }>(
  read: (query: string) => Promise<P>,
  noun: PortfolioNoun,
  query: string,
  grouped: boolean,
  version: number,
  onLoaded: ((rows: R[]) => void) | undefined,
  probeQuery: string | null,
  totalVersion: number,
): PagedBook<R, P> {
  const frame = usePagedRead<R, P>(read, noun, query, true, version, grouped ? undefined : onLoaded);
  const noopLoadMore = useCallback(async () => {}, []);

  const probeKey = probeQuery ? `${probeQuery}#${totalVersion}` : null;
  const [probe, setProbe] = useState<{ key: string; count: number } | null>(null);

  useEffect(() => {
    if (!probeQuery || !probeKey) return;
    let cancelled = false;
    read(probeQuery).then(
      (data) => {
        if (!cancelled) setProbe({ key: probeKey, count: data.count });
      },
      () => {
        // M stays unknown; the page says "N things" instead of a guess.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [probeQuery, probeKey, read]);

  const rawTotal = probeKey && probe?.key === probeKey ? probe.count : null;

  return {
    ...frame,
    rows: grouped ? [] : frame.rows,
    next: grouped ? null : frame.next,
    loadMore: grouped ? noopLoadMore : frame.loadMore,
    total: rawTotal === null ? null : Math.max(rawTotal, frame.data?.count ?? 0),
  };
}
