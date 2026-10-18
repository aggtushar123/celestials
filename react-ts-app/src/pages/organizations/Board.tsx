import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppSelector, useOrgCurrency } from '../../hooks';
import { apiFetch } from '../../lib/apiClient';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import type { Customer } from '../../features/customers/customersSlice';
import { exportPortfolio, fetchPortfolio } from '../../features/organizations/portfolioApi';
import { BOARD_GROUP, boardParams, hasFilters, includesChurned, toApiQuery } from '../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioRow } from '../../features/organizations/portfolioTypes';
import { OrganizationFormModal } from '../../components/organizations/OrganizationFormModal';
import { ChurnOrganizationModal } from '../../components/organizations/ChurnOrganizationModal';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { AccountSidePanel } from '../../components/organizations/portfolio/AccountSidePanel';
import type { BoardMove } from '../../components/organizations/portfolio/boardMove';
import { BOARD_GROUP_OPTIONS } from '../../components/organizations/portfolio/FiltersPanel';
import { useFilterCount } from '../../components/organizations/portfolio/filterCount';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioBoard } from '../../components/organizations/portfolio/PortfolioBoard';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { LifecycleCard } from '../../components/organizations/portfolio/LifecycleCard';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { useBoardMove } from '../../components/organizations/portfolio/useBoardMove';
import { errorMessage, usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { useReportPortfolioOptions } from './ask/portfolioOptions';
import { useAskFocusOnOpen } from './ask/useAskFocus';
import { useBoardRail } from './ask/useBoardRail';
import { OrganizationsFrame } from './OrganizationsFrame';
import { ICON_BUTTON, LoadingState, PageHeader } from '../../components/ui';
import { ViewTabs } from '../../components/organizations/portfolio/ViewTabs';

/** /organizations/board: the portfolio as columns (spec 2026-09-25 §1
 *  "Board", owner decisions 2026-09-26). The top half is the List's: tiles,
 *  toolbar, chips and "N of M", on the same URL params, so switching tabs
 *  keeps the filters. Group defaults to lifecycle here. Each column pages
 *  itself. A card moves by drag or Move to…, and the move PATCHes that one
 *  customer. No selection mode: bulk work stays on the List. */
export function Board() {
  const { params: urlParams, update, clearFilters } = usePortfolioParams(BOARD_GROUP);
  const params = useMemo(() => boardParams(urlParams), [urlParams]);
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();
  const defaultLifecycleStage = useAppSelector(
    (state) => state.auth.user?.organisation.default_lifecycle_stage || undefined,
  ) as Customer['lifecycle_stage'] | undefined;

  // `version` reloads everything (Add, Edit details, Churn). A saved move
  // reloads only the frame and the two columns it touched.
  const [version, setVersion] = useState(0);
  const [frameBump, setFrameBump] = useState(0);
  const [columnBumps, setColumnBumps] = useState<Record<string, number>>({});
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // A move's frame reload skips the M probe: a lifecycle move can't change M.
  const portfolio = usePortfolio(params, version + frameBump, undefined, version);

  const [openRow, setOpenRow] = useState<PortfolioRow | null>(null);
  // Any column's page landing swaps the opened card for its fresh copy, so
  // the side panel or sheet shows what a reload brought back.
  const onRowsLoaded = useCallback((rows: PortfolioRow[]) => {
    setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
  }, []);

  // The Ask rail (spec §3) wins the room (useBoardRail): the columns
  // narrow, and below xl an opened card is the sheet. Opening the rail there
  // closes the open card, and its focus stays for the next question.
  const closeOpen = useCallback(() => setOpenRow(null), []);
  const { railOpen, sidePanel } = useBoardRail(closeOpen);

  const [churning, setChurning] = useState<PortfolioRow | null>(null);
  const onSaved = useCallback((move: BoardMove) => {
    setFrameBump((n) => n + 1);
    setColumnBumps((bumps) => ({
      ...bumps,
      [move.from]: (bumps[move.from] ?? 0) + 1,
      [move.to]: (bumps[move.to] ?? 0) + 1,
    }));
  }, []);
  const board = useBoardMove({ onSaved, onChurn: setChurning });

  // A move is forgotten once its reloads land (the board calls
  // `board.settle`). A different list landing (a filter, sort or group
  // change) forgets it at once. Adjusted during render, not in an effect.
  const { loadedQuery } = portfolio;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    board.reset();
  }

  // Add: the toolbar's opens with the org's default stage; a column's "+"
  // (ruling R2) opens with that column's stage prefilled.
  const [adding, setAdding] = useState<{ stage?: LifecycleValue } | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  const failed = !portfolio.data && portfolio.error !== null;
  const countLine = useFilterCount(params, options, portfolio.data?.count ?? null, portfolio.total, failed);
  // Ask Revenact (spec §3): chips named from this read's options; an opened
  // card (side panel or sheet) narrows the next question to it.
  useReportPortfolioOptions(options);
  useAskFocusOnOpen(openRow?.id ?? null);

  const toggleOpen = useCallback((row: PortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)), []);

  // When a fresh frame lands (a filter, a churn, a move, an edit) the opened
  // card may have left the view. Ask for that one account under the view's
  // filters; if it no longer matches (or is churned while churned accounts
  // are hidden), close its panel or sheet instead of showing a stale row.
  const openId = openRow?.id ?? null;
  const lastKey = useRef(portfolio.loadedKey);
  useEffect(() => {
    const landed = lastKey.current !== portfolio.loadedKey;
    lastKey.current = portfolio.loadedKey;
    if (!landed || openId === null || portfolio.loadedKey === null) return;
    const close = () => setOpenRow((current) => (current?.id === openId ? null : current));
    if (params.ids.length > 0 && !params.ids.includes(openId)) {
      close();
      return;
    }
    let cancelled = false;
    fetchPortfolio(toApiQuery({ ...params, group: '', ids: [openId] }, { limit: '1' })).then(
      (data) => {
        if (cancelled) return;
        const row = data.results.find((r) => r.id === openId);
        if (!row || (row.churned && !includesChurned(params))) close();
        else setOpenRow((current) => (current?.id === openId ? row : current));
      },
      () => {
        // Unknown: keep the panel rather than close it on a network blip.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [portfolio.loadedKey, openId, params]);

  const openEdit = useCallback(async (id: number) => {
    setNotice(null);
    try {
      setEditing(await apiFetch<Customer>(`/customers/${id}/`));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not open this organization for editing.'));
    }
  }, []);

  const runExport = async () => {
    setExporting(true);
    setNotice(null);
    try {
      await exportPortfolio(toApiQuery(params));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not export organizations.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <OrganizationsFrame>
      <PageHeader title="Organizations" tabs={<ViewTabs label="Organizations views" base="/organizations" value="board" />} />
      {/* From sm the page fills the frame (a flex column chain with min-h-0
          down to each column's own scroller), so the page doesn't scroll
          and the columns do. A short window keeps a 360px board and lets the
          frame scroll. Phones scroll the page. */}
      <div data-part="board-page" className={`flex flex-col gap-4 pb-4 ${isSm ? 'min-h-0 flex-1' : ''}`}>
        <div className="flex shrink-0 flex-col gap-4">
          <div className="@container flex flex-col gap-3">
            <SummaryTiles
              summary={portfolio.data?.summary ?? null}
              failed={failed}
              currency={currency}
              params={params}
              onFilter={update}
            />
            {portfolio.data ? (
              <LifecycleCard summary={portfolio.data.summary} params={params} onFilter={update} />
            ) : failed ? null : (
              <LoadingState label="Loading lifecycle" variant="block" />
            )}
          </div>
          <PortfolioToolbar
            params={params}
            update={update}
            options={options}
            isSm={isSm}
            onExport={() => void runExport()}
            exporting={exporting}
            onAdd={() => setAdding({})}
            count={countLine}
            searchRef={searchRef}
            groupOptions={BOARD_GROUP_OPTIONS}
          />
          <FilterChips
            params={params}
            options={options}
            onChange={(patch) => {
              update(patch);
              searchRef.current?.focus();
            }}
            onClearAll={() => {
              clearFilters();
              searchRef.current?.focus();
            }}
          />
          {notice ? (
            <p role="alert" className="flex items-center gap-2 text-[13px] text-danger-ink">
              {notice}
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className={ICON_BUTTON}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </p>
          ) : null}
          {board.error ? (
            <p role="alert" className="flex items-center gap-2 text-[13px] text-danger-ink">
              {board.error}
              <button
                type="button"
                onClick={board.dismissError}
                aria-label="Dismiss"
                className={ICON_BUTTON}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="sr-only">
            {board.notice ?? ''}
          </p>
        </div>
        <div data-part="board-area" className={`flex gap-3 ${isSm ? 'min-h-[360px] flex-1' : ''}`}>
          <PortfolioBoard
            params={params}
            portfolio={portfolio}
            version={version}
            columnBumps={columnBumps}
            currency={currency}
            isSm={isSm}
            narrow={railOpen}
            filtered={hasFilters(params)}
            move={board.move}
            saving={board.busy}
            openId={openRow?.id ?? null}
            onOpen={toggleOpen}
            onMove={board.moveTo}
            onRowsLoaded={onRowsLoaded}
            onClearFilters={clearFilters}
            onAdd={(stage) => setAdding({ stage })}
            onShowChurned={() => update({ include_churned: true })}
            onMoveSettled={board.settle}
          />
          {sidePanel && openRow ? <AccountSidePanel row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}
        </div>
      </div>

      {!sidePanel && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeOpen} onEdit={openEdit} /> : null}

      {adding ? (
        <OrganizationFormModal
          defaultLifecycleStage={adding.stage ?? defaultLifecycleStage}
          onSaved={reload}
          onClose={() => setAdding(null)}
        />
      ) : null}
      {editing ? (
        <OrganizationFormModal customer={editing} onSaved={reload} onClose={() => setEditing(null)} />
      ) : null}
      {churning ? (
        <ChurnOrganizationModal
          customerIds={[churning.id]}
          customerNames={[churning.name]}
          onChurned={reload}
          onClose={() => setChurning(null)}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
