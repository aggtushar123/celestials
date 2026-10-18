import { useLayoutEffect, useRef, useState } from 'react';
import type { PortfolioNoun } from '../../../features/organizations/portfolioLabels';
import type { BulkResult } from '../../../features/organizations/portfolioTypes';
import type { BulkReport } from './SelectionActionsBar';
import { errorMessage } from './usePagedRead';
import { useSelection } from './useSelection';

/** A portfolio List's selection, bulk edits and exports (Organizations,
 *  Accounts, Pipelines): the same rules on every page.
 *
 *  One selection rule (Organizations spec §1): a different list landing
 *  (`loadedQuery` changed: a filter, sort or group change) resets the
 *  selection. Grouped, there is no one full row set to prune against (the
 *  frame is a limit=1 read), so it clears. Flat, it prunes to the new page
 *  one's rows. A reload of the same query (the version bump after a bulk
 *  action, an edit or Try again) keeps it, so the ids a bulk action failed
 *  on stay selected for a retry, even ones from a Show-more page. The last
 *  bulk report goes with it either way. Adjusted during render, not in an
 *  effect.
 *
 *  Phones: the toolbar's Select toggle shows the checkboxes without a long
 *  press; turning it off (or closing the bar) ends selection mode and
 *  clears the selection. `selectAtEveryWidth` (Pipelines, whose rows show no
 *  checkbox until then) keeps the toggle's mode on from sm too. */
export function usePortfolioBulk<A extends string, V>({
  book,
  grouped,
  isSm,
  selectAtEveryWidth = false,
  noun,
  nameOf,
  bulk,
  exportRows,
  reload,
  setNotice,
}: {
  /** The page's frame read: the query that landed and its rows. */
  book: { loadedQuery: string | null; rows: { id: number }[] };
  grouped: boolean;
  isSm: boolean;
  /** The Select toggle's mode holds at every width, not only below sm. */
  selectAtEveryWidth?: boolean;
  /** Names the error messages ("Could not export accounts."). */
  noun: PortfolioNoun;
  /** A failed id's name for the bulk report. */
  nameOf: (id: number) => string;
  bulk: (body: { ids: number[]; action: A; value: V }) => Promise<BulkResult>;
  exportRows: (query: string) => Promise<void>;
  /** Reads the book again after every bulk action. */
  reload: () => void;
  /** Where an export's failure is said. */
  setNotice: (notice: string | null) => void;
}) {
  const selection = useSelection();
  const { prune, clear: clearSelection } = selection;

  const { loadedQuery } = book;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  const [report, setReport] = useState<BulkReport | null>(null);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    if (grouped) clearSelection();
    else prune(book.rows.map((row) => row.id));
    setReport(null);
  }
  // Read by runBulk after its await: the query that is loaded by then.
  const loadedQueryRef = useRef(loadedQuery);
  useLayoutEffect(() => {
    loadedQueryRef.current = loadedQuery;
  });

  const [exporting, setExporting] = useState(false);
  const [actionRunning, setActionRunning] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  // On whenever selection mode is, however it started (toggle or long press).
  const selecting = selection.selecting || (selectMode && (selectAtEveryWidth || !isSm));
  const endSelection = () => {
    selection.clear();
    setReport(null);
    setSelectMode(false);
  };
  const toggleSelectMode = () => {
    if (selecting) endSelection();
    else setSelectMode(true);
  };

  const runExport = async (query: string) => {
    setExporting(true);
    setNotice(null);
    try {
      await exportRows(query);
    } catch (err) {
      setNotice(errorMessage(err, `Could not export ${noun.many}.`));
    } finally {
      setExporting(false);
    }
  };

  const runBulk = async (action: A, value: V) => {
    const ids = [...selection.selected];
    const startQuery = loadedQueryRef.current;
    setActionRunning(true);
    setReport(null);
    try {
      const result = await bulk({ ids, action, value });
      setReport({
        updated: result.updated.length,
        failed: result.failed.map((failure) => ({ ...failure, name: nameOf(failure.id) })),
      });
      // Failures stay selected, so they can be retried, unless a different
      // list landed meanwhile (the query changed while this ran): these ids
      // may no longer be listed, so nothing stays selected.
      if (loadedQueryRef.current === startQuery) selection.replace(result.failed.map((failure) => failure.id));
      else selection.clear();
    } catch (err) {
      setReport({ updated: 0, failed: [], error: errorMessage(err, `Could not update these ${noun.many}.`) });
    } finally {
      setActionRunning(false);
      reload();
    }
  };

  const activity: 'applying' | 'exporting' | null = actionRunning ? 'applying' : exporting ? 'exporting' : null;

  return { selection, selecting, toggleSelectMode, endSelection, report, exporting, actionRunning, activity, runExport, runBulk };
}
