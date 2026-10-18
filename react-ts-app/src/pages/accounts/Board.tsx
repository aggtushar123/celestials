import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { exportAccountPortfolio, fetchAccountPortfolio } from '../../features/accounts/portfolioApi';
import type { AccountFilterOptions, AccountPortfolioRow } from '../../features/accounts/portfolioTypes';
import { BOARD_GROUP, boardParams, hasFilters, toApiQuery } from '../../features/organizations/portfolioParams';
import { ACCOUNT_KIND } from '../../components/accounts/portfolio/accountKind';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { AccountSidePanel } from '../../components/organizations/portfolio/AccountSidePanel';
import type { BoardMove } from '../../components/organizations/portfolio/boardMove';
import { DismissibleAlert } from '../../components/organizations/portfolio/DismissibleAlert';
import { useFilterCount } from '../../components/organizations/portfolio/filterCount';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioBoard } from '../../components/organizations/portfolio/PortfolioBoard';
import { PortfolioKindContext } from '../../components/organizations/portfolio/portfolioKind';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { LifecycleCard } from '../../components/organizations/portfolio/LifecycleCard';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { useBoardMove } from '../../components/organizations/portfolio/useBoardMove';
import { errorMessage, usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { AccountFormModal } from '../organizations/AccountFormModal';
import { useBoardRail } from '../organizations/ask/useBoardRail';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { LoadingState, PageHeader } from '../../components/ui';
import { ViewTabs } from '../../components/organizations/portfolio/ViewTabs';
import { useReportAccountsOptions } from './ask/accountsNames';
import { useAccountEditing } from './useAccountEditing';

/** /accounts/board: the Accounts portfolio as columns (spec 2026-09-29 §1
 *  "Board"), the Organizations board's components with ACCOUNT_KIND. The
 *  tiles, toolbar and chips are the List's, on the same URL params; group
 *  defaults to lifecycle, and every stage is a column (Churn included, as
 *  an ordinary stage). A card moves by drag or Move to…, saved through the
 *  single-account PATCH. No selection mode: bulk work stays on the List. */
export function Board() {
  return (
    <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
      <AccountsBoard />
    </PortfolioKindContext.Provider>
  );
}

function AccountsBoard() {
  const { params: urlParams, update, clearFilters } = usePortfolioParams(BOARD_GROUP);
  const params = useMemo(() => boardParams(urlParams), [urlParams]);
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();

  // `version` reloads everything (Add, Edit details). A saved move reloads
  // only the frame and the two columns it touched.
  const [version, setVersion] = useState(0);
  const [frameBump, setFrameBump] = useState(0);
  const [columnBumps, setColumnBumps] = useState<Record<string, number>>({});
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = useAccountEditing(setNotice);
  const { remember } = forms;

  // A move's frame reload skips the M probe: a lifecycle move can't change M.
  const portfolio = usePortfolio<AccountPortfolioRow, AccountFilterOptions>(params, version + frameBump, undefined, version);

  const [openRow, setOpenRow] = useState<AccountPortfolioRow | null>(null);
  // Any column's page landing: remember its rows, and swap the opened card
  // for its fresh copy.
  const onRowsLoaded = useCallback(
    (rows: AccountPortfolioRow[]) => {
      remember(rows);
      setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
    },
    [remember],
  );

  // The Ask rail (spec §3) wins the room, as on the Organizations board
  // (useBoardRail): the columns narrow, and below xl an opened card is the
  // sheet. Opening the rail there closes the open card.
  const closeOpen = useCallback(() => setOpenRow(null), []);
  const { railOpen, sidePanel } = useBoardRail(closeOpen);

  const onSaved = useCallback((move: BoardMove<AccountPortfolioRow>) => {
    setFrameBump((n) => n + 1);
    setColumnBumps((bumps) => ({
      ...bumps,
      [move.from]: (bumps[move.from] ?? 0) + 1,
      [move.to]: (bumps[move.to] ?? 0) + 1,
    }));
  }, []);
  const board = useBoardMove<AccountPortfolioRow>({ onSaved });

  // A different list landing (a filter, sort or group change) forgets a
  // move at once. Adjusted during render, not in an effect.
  const { loadedQuery } = portfolio;
  const [seenQuery, setSeenQuery] = useState(loadedQuery);
  if (seenQuery !== loadedQuery) {
    setSeenQuery(loadedQuery);
    board.reset();
  }

  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  // Ask Revenact (spec §3): the chip names owners and organisations from
  // this read's options. Opening a card narrows nothing: the server drops a
  // focus on the Board (plan Decision 3).
  useReportAccountsOptions(options);
  const failed = !portfolio.data && portfolio.error !== null;
  const countLine = useFilterCount(params, options, portfolio.data?.count ?? null, portfolio.total, failed);

  const toggleOpen = useCallback(
    (row: AccountPortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)),
    [],
  );

  // When a fresh frame lands (a filter, a move, an edit) the opened card may
  // have left the view. Ask for that one account under the view's filters;
  // if it no longer matches, close its panel or sheet.
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
    fetchAccountPortfolio(toApiQuery({ ...params, group: '', ids: [openId] }, { limit: '1' })).then(
      (data) => {
        if (cancelled) return;
        const row = data.results.find((r) => r.id === openId);
        if (!row) close();
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

  const runExport = async () => {
    setExporting(true);
    setNotice(null);
    try {
      await exportAccountPortfolio(toApiQuery(params));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not export accounts.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <OrganizationsFrame>
      <PageHeader title="Accounts" tabs={<ViewTabs label="Accounts views" base="/accounts" value="board" />} />
      {/* From sm the page fills the frame, so the page doesn't scroll and
          the columns do. Phones scroll the page. */}
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
            onAdd={() => forms.openAdd()}
            count={countLine}
            searchRef={searchRef}
            groupOptions={ACCOUNT_KIND.boardGroupOptions}
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
          {notice ? <DismissibleAlert message={notice} onDismiss={() => setNotice(null)} /> : null}
          {board.error ? <DismissibleAlert message={board.error} onDismiss={board.dismissError} /> : null}
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
            onAdd={forms.openAdd}
            onMoveSettled={board.settle}
          />
          {sidePanel && openRow ? (
            <AccountSidePanel row={openRow} currency={currency} onClose={closeOpen} onEdit={forms.openEdit} />
          ) : null}
        </div>
      </div>

      {!sidePanel && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeOpen} onEdit={forms.openEdit} /> : null}

      {forms.adding ? (
        <AccountFormModal
          companies={forms.companies}
          defaultLifecycleStage={forms.adding.stage}
          onSaved={reload}
          onClose={forms.closeAdd}
        />
      ) : null}
      {forms.editing ? (
        <AccountFormModal
          account={forms.editing}
          onClose={() => {
            forms.closeEdit();
            reload();
          }}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
