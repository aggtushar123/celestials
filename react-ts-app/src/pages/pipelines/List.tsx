import { useCallback, useRef, useState } from 'react';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { countText } from '../../features/organizations/filterChips';
import { bulkUpdatePipeline, exportPipeline } from '../../features/pipelines/pipelineApi';
import { pipelineChips } from '../../features/pipelines/pipelineChips';
import { DEPARTMENT_CHOICES, NO_DEPARTMENT, PIPELINE_KINDS, PRIORITY_CHOICES, stageTargets } from '../../features/pipelines/pipelineKinds';
import { hasPipelineFilters, pipelineApiQuery, type PipelineParams } from '../../features/pipelines/pipelineParams';
import type { PipelineBulkAction } from '../../features/pipelines/pipelineTypes';
import { PageHeader } from '../../components/ui';
import { ViewTabs } from '../../components/organizations/portfolio/ViewTabs';
import { DismissibleAlert } from '../../components/organizations/portfolio/DismissibleAlert';
import { ActiveFilterChips } from '../../components/organizations/portfolio/FilterChips';
import { CLEAR_DATE, SelectionActionsBar } from '../../components/organizations/portfolio/SelectionActionsBar';
import { usePortfolioBulk } from '../../components/organizations/portfolio/usePortfolioBulk';
import { PipelineItem } from '../../components/pipelines/portfolio/PipelineItem';
import { PipelineModals } from '../../components/pipelines/portfolio/PipelineModals';
import { PipelineSections, type PipelineItemRenderer } from '../../components/pipelines/portfolio/PipelineSections';
import { PipelineStagesCard } from '../../components/pipelines/portfolio/PipelineStagesCard';
import { PipelineTiles } from '../../components/pipelines/portfolio/PipelineTiles';
import { PipelineToolbar } from '../../components/pipelines/portfolio/PipelineToolbar';
import { usePipelineBook } from '../../components/pipelines/portfolio/usePipelineBook';
import { usePipelineForms } from '../../components/pipelines/portfolio/usePipelineForms';
import { usePipelineParams } from '../../components/pipelines/portfolio/usePipelineParams';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { useReportPipelineOptions } from './ask/pipelinesNames';

/** What the bulk endpoint takes for a choice (plan Decision 13): the whole
 *  company is '', a cleared date is null. */
function bulkValue(action: PipelineBulkAction, value: string): string | null {
  if (action === 'set_department' && value === NO_DEPARTMENT) return '';
  if (action === 'set_date' && value === CLEAR_DATE) return null;
  return value;
}

/** /pipelines/list (spec 2026-09-30 §1): one book of opportunities or risks
 *  across organisations and accounts. Items, groups, tiles and totals come
 *  from GET /pipelines/<kind>/; every filter, sort and group is URL state;
 *  bulk edits go to POST /pipelines/<kind>/bulk/. Keyed on the kind, so
 *  nothing (a selection, an open form) crosses from one kind to the other. */
export function List() {
  const { params } = usePipelineParams();
  return <PipelinesList key={params.kind} />;
}

function PipelinesList() {
  const { params, update, clearFilters } = usePipelineParams();
  const kind = PIPELINE_KINDS[params.kind];
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [notice, setNotice] = useState<string | null>(null);
  const forms = usePipelineForms();
  const book = usePipelineBook(kind, params, 'list', version, forms.remember);
  const searchRef = useRef<HTMLInputElement>(null);
  // The selection, bulk edits and exports: the portfolios' shared rules.
  const { selection, selecting, toggleSelectMode, endSelection, report, exporting, actionRunning, activity, runExport, runBulk } =
    usePortfolioBulk<PipelineBulkAction, string | null>({
      book,
      grouped: params.group !== '',
      isSm,
      selectAtEveryWidth: true,
      noun: kind.noun,
      nameOf: forms.titleOf,
      bulk: (body) => bulkUpdatePipeline(kind.key, body),
      exportRows: (query) => exportPipeline(kind.key, query),
      reload,
      setNotice,
    });

  const currency = book.data?.currency ?? orgCurrency;
  const options = book.data?.filters ?? null;
  // Ask Revenact (spec §3): the chip names owners, organisations and
  // accounts from this read's options. Opening an item narrows nothing
  // (plan Decision 8).
  useReportPipelineOptions(kind.key, options);
  const failed = !book.data && book.error !== null;
  const chips = pipelineChips(params, options, kind);

  const applyFilter = (patch: Partial<PipelineParams>) => {
    update(patch);
    searchRef.current?.focus();
  };

  const renderItem: PipelineItemRenderer = (row, { loading }) => (
    <PipelineItem
      key={row.id}
      row={row}
      kind={kind}
      currency={currency}
      selecting={selecting}
      selected={selection.selected.has(row.id)}
      selectDisabled={loading || book.loading || actionRunning}
      atLimit={selection.atLimit}
      onToggleSelect={selection.toggle}
      onOpen={forms.openEdit}
    />
  );

  return (
    <OrganizationsFrame>
      <PageHeader title="Pipelines" tabs={<ViewTabs label="Pipelines views" base="/pipelines" value="list" />} />
      <div className="flex flex-col gap-4 pb-6">
        {/* Containers: the tiles and items follow this column, which the Ask rail narrows, not the window. */}
        <div className="@container flex flex-col gap-3">
          <PipelineTiles kind={kind} summary={book.data?.summary ?? null} failed={failed} currency={currency} params={params} onFilter={update} />
          {book.data ? <PipelineStagesCard kind={kind} summary={book.data.summary} params={params} onFilter={update} /> : null}
        </div>
        <PipelineToolbar
          kind={kind}
          view="list"
          params={params}
          update={update}
          options={options}
          isSm={isSm}
          onExport={() => void runExport(pipelineApiQuery(params, 'list'))}
          exporting={exporting}
          onAdd={() => forms.openAdd()}
          searchRef={searchRef}
          count={countText(book.data?.count ?? null, book.total, chips.length > 0, failed, kind.noun)}
          selectMode={selecting}
          onToggleSelectMode={toggleSelectMode}
        />
        <ActiveFilterChips
          chips={chips}
          onChange={applyFilter}
          onClearAll={() => {
            clearFilters();
            searchRef.current?.focus();
          }}
        />
        {notice ? <DismissibleAlert message={notice} onDismiss={() => setNotice(null)} /> : null}
        <div className="@container">
          <PipelineSections
            kind={kind}
            params={params}
            version={version}
            book={book}
            currency={currency}
            filtered={hasPipelineFilters(params)}
            renderItem={renderItem}
            onRowsLoaded={forms.remember}
            onClearFilters={clearFilters}
            onAdd={() => forms.openAdd()}
          />
        </div>
        <SelectionActionsBar
          count={selection.selected.size}
          noun={kind.noun}
          choices={[
            { key: 'set_stage', label: 'Set stage', options: stageTargets(kind) },
            { key: 'set_priority', label: 'Set priority', options: PRIORITY_CHOICES },
            { key: 'set_department', label: 'Set department', options: DEPARTMENT_CHOICES },
          ]}
          dateChoice={{ key: 'set_date', label: 'Set date', clearLabel: 'Clear date' }}
          activity={activity}
          loading={book.loading}
          report={report}
          onApply={(key, value) => {
            const action = key as PipelineBulkAction;
            void runBulk(action, bulkValue(action, value));
          }}
          onExport={() => void runExport(new URLSearchParams({ ids: [...selection.selected].join(',') }).toString())}
          onClose={endSelection}
        />
      </div>
      <PipelineModals kind={kind} forms={forms} onSaved={reload} />
    </OrganizationsFrame>
  );
}
