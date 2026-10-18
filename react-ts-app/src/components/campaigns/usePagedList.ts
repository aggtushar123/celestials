import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** What Campaigns' cursor-paged endpoints answer, at least. */
export interface Page<R> {
  results: R[];
  next: string | null;
}

type Load<P extends Page<unknown>> = { key: string; gen: number; rows: Row<P>[] | null; page: P | null; error: string | null };
/** A page's row type. */
type Row<P extends Page<unknown>> = P['results'][number];
type More = { gen: number; busy: boolean; error: string | null };

export interface PagedList<P extends Page<unknown>> {
  rows: Row<P>[] | null;
  /** The last page answered (first or appended): its extras, e.g. `hidden`. */
  page: P | null;
  next: string | null;
  error: string | null;
  more: { busy: boolean; error: string | null };
  retry: () => void;
  showMore: () => void;
  /** Change the shown rows in place (a polled send), keeping the page. */
  update: (change: (rows: Row<P>[]) => Row<P>[]) => void;
}

/** One cursor-paged list: the first page read again whenever `key`
 *  changes (or Try again), Show more appending the next. Every first page
 *  gets a new generation; an append and a Show more's busy or error belong
 *  to the generation they started under, so one that answers after a
 *  filter or tab change (even back to the same key) is dropped, never a
 *  stuck skeleton or a stale "Could not load more". `fetchPage` is read
 *  through a ref: only `key` decides when to read again. */
export function usePagedList<P extends Page<unknown>>(
  key: string,
  fetchPage: (cursor: string | null) => Promise<P>,
  words: { error: string; more: string },
): PagedList<P> {
  const [attempt, setAttempt] = useState(0);
  const full = `${key}#${attempt}`;
  const [load, setLoad] = useState<Load<P> | null>(null);
  const [more, setMore] = useState<More | null>(null);
  const fetchRef = useRef(fetchPage);
  const wordsRef = useRef(words);
  const genRef = useRef(0);
  useEffect(() => {
    fetchRef.current = fetchPage;
    wordsRef.current = words;
  });
  useEffect(() => {
    let alive = true;
    const gen = ++genRef.current;
    fetchRef.current(null).then(
      (page) => {
        if (alive) setLoad({ key: full, gen, rows: page.results, page, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: full, gen, rows: null, page: null, error: errorMessage(err, wordsRef.current.error) });
      },
    );
    return () => {
      alive = false;
    };
  }, [full]);
  const current = load?.key === full ? load : null;
  const shownMore = current && more?.gen === current.gen ? more : null;

  async function showMore() {
    const cursor = current?.page?.next;
    if (!current || !cursor || shownMore?.busy) return;
    const gen = current.gen;
    setMore({ gen, busy: true, error: null });
    try {
      const page = await fetchRef.current(cursor);
      setLoad((last) => (last?.gen === gen && last.rows ? { ...last, rows: [...last.rows, ...page.results], page } : last));
      setMore((last) => (last?.gen === gen ? { gen, busy: false, error: null } : last));
    } catch (err) {
      setMore((last) => (last?.gen === gen ? { gen, busy: false, error: errorMessage(err, wordsRef.current.more) } : last));
    }
  }

  return {
    rows: current?.rows ?? null,
    page: current?.page ?? null,
    next: current?.page?.next ?? null,
    error: current?.error ?? null,
    more: { busy: shownMore?.busy ?? false, error: shownMore?.error ?? null },
    retry: () => setAttempt((n) => n + 1),
    showMore: () => void showMore(),
    update: (change) => setLoad((last) => (last?.rows ? { ...last, rows: change(last.rows) } : last)),
  };
}
