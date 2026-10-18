import { useCallback, useRef, useState } from 'react';
import { useAppSelector, useOrgCurrency } from '../../hooks';
import { apiFetch } from '../../lib/apiClient';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import type { Customer } from '../../features/customers/customersSlice';
import { useMembers } from '../../features/knowledge/useMembers';
import { LIFECYCLE_TARGETS, ownerTargets } from '../../features/organizations/bulkTargets';
import { bulkUpdate, exportPortfolio } from '../../features/organizations/portfolioApi';
import { ORGANIZATION_NOUN } from '../../features/organizations/portfolioLabels';
import { filterQuery, hasFilters, toApiQuery, type PortfolioParams } from '../../features/organizations/portfolioParams';
import type { BulkAction, PortfolioRow } from '../../features/organizations/portfolioTypes';
import { OrganizationFormModal } from '../../components/organizations/OrganizationFormModal';
import { ChurnOrganizationModal } from '../../components/organizations/ChurnOrganizationModal';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { AccountDetails } from '../../components/organizations/portfolio/AccountDetails';
import { AccountRow } from '../../components/organizations/portfolio/AccountRow';
import { AccountSheet } from '../../components/organizations/portfolio/AccountSheet';
import { useFilterCount } from '../../components/organizations/portfolio/filterCount';
import { FilterChips } from '../../components/organizations/portfolio/FilterChips';
import { PortfolioSections } from '../../components/organizations/portfolio/PortfolioSections';
import { PortfolioToolbar } from '../../components/organizations/portfolio/PortfolioToolbar';
import { SelectionBar } from '../../components/organizations/portfolio/SelectionBar';
import { LifecycleCard } from '../../components/organizations/portfolio/LifecycleCard';
import { SummaryTiles } from '../../components/organizations/portfolio/SummaryTiles';
import { usePins } from '../../components/organizations/portfolio/usePins';
import type { PortfolioRowRenderer } from '../../components/organizations/portfolio/PortfolioSections';
import { errorMessage, usePortfolio } from '../../components/organizations/portfolio/usePortfolio';
import { usePortfolioParams } from '../../components/organizations/portfolio/usePortfolioParams';
import { usePortfolioBulk } from '../../components/organizations/portfolio/usePortfolioBulk';
import { useReportPortfolioOptions } from './ask/portfolioOptions';
import { useAskFocusOnOpen } from './ask/useAskFocus';
import { OrganizationsFrame } from './OrganizationsFrame';
import { LoadingState, PageHeader } from '../../components/ui';
import { ViewTabs } from '../../components/organizations/portfolio/ViewTabs';
import { useSaveAsSegment } from '../segments/useSaveAsSegment';

type Targets = { ids: number[]; names: string[] };

/** /organizations/list: the portfolio (spec 2026-09-25 §1). Every filter,
 *  sort and group is URL state. Rows, groups, tiles and totals come from
 *  GET /organizations/portfolio/. Bulk edits go to /organizations/bulk/.
 *  Churn keeps its own modal, one account at a time. */
export function List() {
  const { params, update, clearFilters } = usePortfolioParams();
  const isSm = useMediaQuery(SM);
  const [saveAsSegment, saveAsSegmentModal] = useSaveAsSegment('customer');
  const orgCurrency = useOrgCurrency();
  const defaultLifecycleStage = useAppSelector(
    (state) => state.auth.user?.organisation.default_lifecycle_stage || undefined,
  ) as Customer['lifecycle_stage'] | undefined;

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Names of every row loaded so far, for bulk results and the churn and
  // archive dialogs. Written in fetch callbacks, read in event handlers.
  const names = useRef(new Map<number, string>());
  const nameOf = useCallback((id: number) => names.current.get(id) ?? `Organization ${id}`, []);
  const [openRow, setOpenRow] = useState<PortfolioRow | null>(null);
  // Every page that lands (the flat list's, or any section's): remember the
  // names, and swap the opened row for its fresh copy, so an open sheet or
  // panel shows what a reload (after Edit details, say) brought back.
  const onRowsLoaded = useCallback((rows: PortfolioRow[]) => {
    for (const row of rows) names.current.set(row.id, row.name);
    setOpenRow((current) => (current && rows.find((row) => row.id === current.id)) || current);
  }, []);

  const portfolio = usePortfolio(params, version, onRowsLoaded);
  const { pins, toggle: togglePin } = usePins();
  const members = useMembers();
  const searchRef = useRef<HTMLInputElement>(null);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [churning, setChurning] = useState<Targets | null>(null);
  const [archiving, setArchiving] = useState<Targets | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The selection, bulk edits and exports: the portfolios' shared rules.
  const { selection, selecting, toggleSelectMode, endSelection, report, exporting, actionRunning, activity, runExport, runBulk } =
    usePortfolioBulk<BulkAction, number | string | null>({
      book: portfolio,
      grouped: params.group !== '',
      isSm,
      noun: ORGANIZATION_NOUN,
      nameOf,
      bulk: bulkUpdate,
      exportRows: exportPortfolio,
      reload,
      setNotice,
    });

  const currency = portfolio.data?.currency ?? orgCurrency;
  const options = portfolio.data?.filters ?? null;
  const failed = !portfolio.data && portfolio.error !== null;
  const countLine = useFilterCount(params, options, portfolio.data?.count ?? null, portfolio.total, failed);
  // Ask Revenact (spec §3): the chips name owners and products from this
  // read's options, and an opened row narrows the next question to it.
  useReportPortfolioOptions(options);
  useAskFocusOnOpen(openRow?.id ?? null);

  const toggleOpen = useCallback((row: PortfolioRow) => setOpenRow((current) => (current?.id === row.id ? null : row)), []);
  const closeSheet = useCallback(() => setOpenRow(null), []);

  const openEdit = useCallback(async (id: number) => {
    setNotice(null);
    try {
      setEditing(await apiFetch<Customer>(`/customers/${id}/`));
    } catch (err) {
      setNotice(errorMessage(err, 'Could not open this organization for editing.'));
    }
  }, []);

  const targets = (): Targets => {
    const ids = [...selection.selected];
    return { ids, names: ids.map(nameOf) };
  };

  const applyFilter = (patch: Partial<PortfolioParams>) => {
    update(patch);
    searchRef.current?.focus();
  };

  const renderRow: PortfolioRowRenderer = (row, { loading }) => {
    const open = openRow?.id === row.id;
    return (
      <AccountRow
        key={row.id}
        row={row}
        currency={currency}
        pins={pins}
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
        {open && isSm ? <AccountDetails id={`account-${row.id}-details`} row={row} onEdit={openEdit} /> : null}
      </AccountRow>
    );
  };

  return (
    <OrganizationsFrame>
      <PageHeader title="Organizations" tabs={<ViewTabs label="Organizations views" base="/organizations" value="list" />} />
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
          pins={pins}
          onTogglePin={togglePin}
          onExport={() => void runExport(toApiQuery(params))}
          exporting={exporting}
          onAdd={() => setAdding(true)}
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
        {notice ? (
          <p role="alert" className="text-[13px] text-danger-ink">
            {notice}
          </p>
        ) : null}
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
            onAdd={() => setAdding(true)}
            pinned={pins.length > 0}
          />
        </div>
        <SelectionBar
          count={selection.selected.size}
          owners={ownerTargets(members)}
          lifecycles={LIFECYCLE_TARGETS}
          activity={activity}
          loading={portfolio.loading}
          report={report}
          onSetOwner={(id) => void runBulk('set_owner', id)}
          onSetLifecycle={(stage) => void runBulk('set_lifecycle', stage)}
          onExport={() =>
            void runExport(new URLSearchParams({ ids: [...selection.selected].join(','), include_churned: '1' }).toString())
          }
          onArchive={() => setArchiving(targets())}
          onChurn={() => setChurning(targets())}
          onClose={endSelection}
        />
      </div>

      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={closeSheet} onEdit={openEdit} /> : null}

      {adding ? (
        <OrganizationFormModal
          defaultLifecycleStage={defaultLifecycleStage}
          onClose={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
      {editing ? (
        <OrganizationFormModal
          customer={editing}
          onClose={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      {churning ? (
        <ChurnOrganizationModal
          customerIds={churning.ids}
          customerNames={churning.names}
          onChurned={() => {
            selection.clear();
            reload();
          }}
          onClose={() => setChurning(null)}
        />
      ) : null}
      {archiving ? (
        <ConfirmDialog
          title={archiving.ids.length === 1 ? `Archive ${archiving.names[0]}?` : `Archive ${archiving.ids.length} organizations?`}
          message="Hidden from this list and the summary, but not deleted. You can unarchive later."
          confirmLabel="Archive"
          danger
          onConfirm={() => runBulk('archive', null)}
          onClose={() => setArchiving(null)}
        />
      ) : null}
      {saveAsSegmentModal}
    </OrganizationsFrame>
  );
}
