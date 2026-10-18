import { useCallback, useMemo, useRef, useState } from 'react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { countText } from '../../features/organizations/filterChips';
import { exportPipeline } from '../../features/pipelines/pipelineApi';
import { pipelineChips } from '../../features/pipelines/pipelineChips';
import { PIPELINE_KINDS } from '../../features/pipelines/pipelineKinds';
import { boardPipelineParams, hasPipelineFilters, pipelineApiQuery } from '../../features/pipelines/pipelineParams';
import { PageHeader } from '../../components/ui';
import { ViewTabs } from '../../components/organizations/portfolio/ViewTabs';
import { DismissibleAlert } from '../../components/organizations/portfolio/DismissibleAlert';
import { ActiveFilterChips } from '../../components/organizations/portfolio/FilterChips';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { PipelineBoard } from '../../components/pipelines/portfolio/PipelineBoard';
import { PipelineModals } from '../../components/pipelines/portfolio/PipelineModals';
import type { PipelineMove } from '../../components/pipelines/portfolio/pipelineMove';
import { PipelineStagesCard } from '../../components/pipelines/portfolio/PipelineStagesCard';
import { PipelineTiles } from '../../components/pipelines/portfolio/PipelineTiles';
import { PipelineToolbar } from '../../components/pipelines/portfolio/PipelineToolbar';
import { usePipelineBook } from '../../components/pipelines/portfolio/usePipelineBook';
import { usePipelineForms } from '../../components/pipelines/portfolio/usePipelineForms';
import { usePipelineMove } from '../../components/pipelines/portfolio/usePipelineMove';
import { usePipelineParams } from '../../components/pipelines/portfolio/usePipelineParams';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { useBoardRail } from '../organizations/ask/useBoardRail';
import { useReportPipelineOptions } from './ask/pipelinesNames';

/** A card opens its form, a modal over the rail at every width, so the rail
 *  never has an open card to close (plan Decision 6): closing the form on a
 *  viewport change would lose its unsaved edits. */
const KEEP_FORM = () => {};

/** /pipelines/board (spec 2026-09-30 §1 "Board"): the book as stage
 *  columns. The tiles, toolbar and chips are the List's, on the same URL;
 *  a card moves by drag or Move to…, saved through the item's own PATCH;
 *  a card opens its form. No selection mode: bulk work stays on the List.
 *  Keyed on the kind, as the List is. */
export function Board() {
  const { params } = usePipelineParams();
  return <PipelinesBoard key={params.kind} />;
}

function PipelinesBoard() {
  const { params: urlParams, update, clearFilters } = usePipelineParams();
  const params = useMemo(() => boardPipelineParams(urlParams), [urlParams]);
  const kind = PIPELINE_KINDS[params.kind];
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();

  // `version` reloads everything (Add, Edit, Delete). A saved move reloads
  // only the frame and the two columns it touched.
  const [version, setVersion] = useState(0);
  const [frameBump, setFrameBump] = useState(0);
  const [columnBumps, setColumnBumps] = useState<Record<string, number>>({});
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = usePipelineForms();
  // The Ask rail (spec §1 "Board", §3) narrows the columns while it is open,
  // as on the Accounts Board (useBoardRail).
  const { railOpen } = useBoardRail(KEEP_FORM);

  // A move's frame reload skips the M probe: a stage move can't change M.
  const book = usePipelineBook(kind, params, 'board', version + frameBump, undefined, version);

  const onSaved = useCallback((move: PipelineMove) => {
    setFrameBump((n) => n + 1);
    setColumnBumps((bumps) => ({
      ...bumps,
      [move.from]: (bumps[move.from] ?? 0) + 1,
      [move.to]: (bumps[move.to] ?? 0) + 1,
    }));
  }, []);
  const board = usePipelineMove(kind, onSaved);

  // A different list landing (a filter, sort or group change) forgets a
  // move at once. Adjusted during render, not in an effect.
  const { loadedQuery } = book;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    board.reset();
  }

  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const currency = book.data?.currency ?? orgCurrency;
  const options = book.data?.filters ?? null;
  // Ask Revenact (spec §3): the chip names owners, organisations and
  // accounts from this read's options on the Board. Opening a card narrows
  // nothing (plan Decision 8).
  useReportPipelineOptions(kind.key, options);
  const failed = !book.data && book.error !== null;
  const chips = pipelineChips(params, options, kind);

  const runExport = async () => {
    setExporting(true);
    setNotice(null);
    try {
      await exportPipeline(kind.key, pipelineApiQuery(params, 'board'));
    } catch (err) {
      setNotice(errorMessage(err, `Could not export ${kind.noun.many}.`));
    } finally {
      setExporting(false);
    }
  };

  return (
    <OrganizationsFrame>
      <PageHeader title="Pipelines" tabs={<ViewTabs label="Pipelines views" base="/pipelines" value="board" />} />
      {/* From sm the page fills the frame and the columns scroll; phones scroll the page. */}
      <div data-part="board-page" className={`flex flex-col gap-4 pb-4 ${isSm ? 'min-h-0 flex-1' : ''}`}>
        <div className="flex shrink-0 flex-col gap-4">
          <div className="@container flex flex-col gap-3">
            <PipelineTiles kind={kind} summary={book.data?.summary ?? null} failed={failed} currency={currency} params={params} onFilter={update} />
            {book.data ? <PipelineStagesCard kind={kind} summary={book.data.summary} params={params} onFilter={update} /> : null}
          </div>
          <PipelineToolbar
            kind={kind}
            view="board"
            params={params}
            update={update}
            options={options}
            isSm={isSm}
            onExport={() => void runExport()}
            exporting={exporting}
            onAdd={() => forms.openAdd()}
            searchRef={searchRef}
            count={countText(book.data?.count ?? null, book.total, chips.length > 0, failed, kind.noun)}
          />
          <ActiveFilterChips
            chips={chips}
            onChange={(patch) => {
              update(patch);
              searchRef.current?.focus();
            }}
            onClearAll={() => {
              clearFilters();
              searchRef.current?.focus();
            }}
          />
          {notice ? <DismissibleAlert message={notice} onDismiss={() => setNotice(null)} /> : null}
          {board.error ? <DismissibleAlert message={board.error} onDismiss={board.dismissError} /> : null}
          <p role="status" aria-live="polite" className="sr-only">
            {board.notice ?? ''}
          </p>
        </div>
        <div data-part="board-area" className={`flex gap-3 ${isSm ? 'min-h-[360px] flex-1' : ''}`}>
          <PipelineBoard
            kind={kind}
            params={params}
            book={book}
            version={version}
            columnBumps={columnBumps}
            currency={currency}
            isSm={isSm}
            narrow={railOpen}
            filtered={hasPipelineFilters(params)}
            move={board.move}
            saving={board.busy}
            onOpen={forms.openEdit}
            onMove={board.moveTo}
            onRowsLoaded={forms.remember}
            onClearFilters={clearFilters}
            onAdd={forms.openAdd}
            onMoveSettled={board.settle}
          />
        </div>
      </div>
      <PipelineModals kind={kind} forms={forms} onSaved={reload} />
    </OrganizationsFrame>
  );
}
