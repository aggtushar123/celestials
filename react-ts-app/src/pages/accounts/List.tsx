import { useCallback, useRef, useState } from 'react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ACCOUNT_LIFECYCLE_TARGETS, ACCOUNT_NOUN } from '../../features/accounts/accountFields';
import { bulkUpdateAccounts, exportAccountPortfolio } from '../../features/accounts/portfolioApi';
import type { AccountBulkAction, AccountFilterOptions, AccountPortfolioRow } from '../../features/accounts/portfolioTypes';
import { useMembers } from '../../features/knowledge/useMembers';
import { ownerTargets } from '../../features/organizations/bulkTargets';
import { filterQuery, hasFilters, toApiQuery, type PortfolioParams } from '../../features/organizations/portfolioParams';
import { AccountPanels } from '../../components/accounts/portfolio/AccountPanels';
import { ACCOUNT_KIND } from '../../components/accounts/portfolio/accountKind';
import { AccountRow } from '../../components/organizations/portfolio/AccountRow';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { DismissibleAlert } from '../../components/organizations/portfolio/DismissibleAlert';
import { useFilterCount } from '../../components/organizations/portfolio/filterCount';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioKindContext } from '../../components/organizations/portfolio/portfolioKind';
import { PortfolioSections, type PortfolioRowRenderer } from '../../components/organizations/portfolio/PortfolioSections';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { SelectionBar } from '../../components/organizations/portfolio/SelectionBar';
import { LifecycleCard } from '../../components/organizations/portfolio/LifecycleCard';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { usePortfolioBulk } from '../../components/organizations/portfolio/usePortfolioBulk';
import { AccountFormModal } from '../organizations/AccountFormModal';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { LoadingState, PageHeader } from '../../components/ui';
import { ViewTabs } from '../../components/organizations/portfolio/ViewTabs';
import { useReportAccountsOptions } from './ask/accountsNames';
import { useAccountEditing } from './useAccountEditing';
import { useSaveAsSegment } from '../segments/useSaveAsSegment';

/** /accounts/list: the Accounts portfolio (spec 2026-09-29 §1), the
 *  Organizations list's components with ACCOUNT_KIND. Rows, groups, tiles
 *  and totals come from GET /accounts/portfolio/; every filter, sort and
 *  group is URL state; bulk owner and lifecycle go to POST /accounts/bulk/.
 *  No archive or churn: Churn is an ordinary stage. */
export function List() {
  return (
    <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
      <AccountsList />
    </PortfolioKindContext.Provider>
  );
}

function AccountsList() {
  const { params, update, clearFilters } = usePortfolioParams();
  const isSm = useMediaQuery(SM);
  const [saveAsSegment, saveAsSegmentModal] = useSaveAsSegment('account');
  const orgCurrency = useOrgCurrency();

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = useAccountEditing(setNotice);
  const { remember, nameOf } = forms;

  const [openRow, setOpenRow] = useState<AccountPortfolioRow | null>(null);
  // Every page that lands (the flat list's, or any section's): remember the
  // rows, and swap the opened row for its fresh copy.
  const onRowsLoaded = useCallback(
    (rows: AccountPortfolioRow[]) => {
      remember(rows);
      setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
    },
    [remember],
  );

  const portfolio = usePortfolio<AccountPortfolioRow, AccountFilterOptions>(params, version, onRowsLoaded);
  const members = useMembers();
  const searchRef = useRef<HTMLInputElement>(null);
  const { selection, selecting, toggleSelectMode, endSelection, report, exporting, actionRunning, activity, runExport, runBulk } =
    usePortfolioBulk<AccountBulkAction, number | string | null>({
      book: portfolio,
      grouped: params.group !== '',
      isSm,
      noun: ACCOUNT_NOUN,
      nameOf,
      bulk: bulkUpdateAccounts,
      exportRows: exportAccountPortfolio,
      reload,
      setNotice,
    });

  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  // Ask Revenact (spec §3): the chip names owners and organisations from
  // this read's options. Opening a row narrows nothing: the server drops a
  // focus on the List (plan Decision 3).
  useReportAccountsOptions(options);
  const failed = !portfolio.data && portfolio.error !== null;
  const countLine = useFilterCount(params, options, portfolio.data?.count ?? null, portfolio.total, failed);

  const toggleOpen = useCallback(
    (row: AccountPortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)),
    [],
  );
  const closeSheet = useCallback(() => setOpenRow(null), []);

  const applyFilter = (patch: Partial<PortfolioParams>) => {
    update(patch);
    searchRef.current?.focus();
  };

  const renderRow: PortfolioRowRenderer<AccountPortfolioRow> = (row, { loading }) => {
    const open = openRow?.id === row.id;
    return (
      <AccountRow
        key={row.id}
        row={row}
        currency={currency}
        pins={[]}
        isSm={isSm}
        selecting={selecting}
        selected={selection.selected.has(row.id)}
        selectDisabled={loading || portfolio.loading || actionRunning}
        atLimit={selection.atLimit}
        open={open}
        onToggleSelect={selection.toggle}
        onLongPress={selection.toggle}
        onToggleOpen={toggleOpen}
      >
        {open && isSm ? (
          <AccountPanels
            id={`account-${row.id}-details`}
            row={row}
            currency={currency}
            onEdit={ACCOUNT_KIND.editable(row) ? forms.openEdit : undefined}
          />
        ) : null}
      </AccountRow>
    );
  };

  return (
    <OrganizationsFrame>
      <PageHeader title="Accounts" tabs={<ViewTabs label="Accounts views" base="/accounts" value="list" />} />
      <div className="flex flex-col gap-4 pb-6">
        {/* Containers: the tiles and rows follow this column, which the Ask
            rail narrows, not the window. */}
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
          onExport={() => void runExport(toApiQuery(params))}
          exporting={exporting}
          onAdd={() => forms.openAdd()}
          onSaveAsSegment={() => saveAsSegment(filterQuery(params))}
          count={countLine}
          searchRef={searchRef}
          selectMode={selecting}
          onToggleSelectMode={toggleSelectMode}
        />
        <FilterChips
          params={params}
          options={options}
          onChange={applyFilter}
          onClearAll={() => {
            clearFilters();
            searchRef.current?.focus();
          }}
        />
        {notice ? <DismissibleAlert message={notice} onDismiss={() => setNotice(null)} /> : null}
        <div className="@container">
          <PortfolioSections
            params={params}
            version={version}
            portfolio={portfolio}
            currency={currency}
            filtered={hasFilters(params)}
            renderRow={renderRow}
            onRowsLoaded={onRowsLoaded}
            onClearFilters={clearFilters}
            onAdd={() => forms.openAdd()}
          />
        </div>
        <SelectionBar
          count={selection.selected.size}
          owners={ownerTargets(members)}
          lifecycles={ACCOUNT_LIFECYCLE_TARGETS}
          keepChurn
          activity={activity}
          loading={portfolio.loading}
          report={report}
          onSetOwner={(id) => void runBulk('set_owner', id)}
          onSetLifecycle={(stage) => void runBulk('set_lifecycle', stage)}
          onExport={() => void runExport(new URLSearchParams({ ids: [...selection.selected].join(',') }).toString())}
          onClose={endSelection}
        />
      </div>

      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeSheet} onEdit={forms.openEdit} /> : null}

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
      {saveAsSegmentModal}
    </OrganizationsFrame>
  );
}
