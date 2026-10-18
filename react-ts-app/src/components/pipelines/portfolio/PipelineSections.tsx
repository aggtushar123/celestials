import type { ReactNode } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { withArticle, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import { pipelineApiQuery, type PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineGroup, PipelinePage, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { EmptyBookState, PagedSections } from '../../organizations/portfolio/PortfolioSections';
import { ListHeaderRow } from '../../ui';
import { PIPELINE_ALIGNS, PIPELINE_COLUMNS, PIPELINE_HEADER_SHOW, pipelineLabels } from './pipelineColumns';
import { PIPELINE_SECTION_SIZE, type PipelineBook } from './usePipelineBook';

/** An item renderer that also gets its own section's (or the flat list's)
 *  `loading`, so it can disable that item's checkbox meanwhile. */
export type PipelineItemRenderer = (row: PipelineRow, state: { loading: boolean }) => ReactNode;

/** The List's body: grouped sections (each with its own pages) or one flat
 *  list, with the loading, empty and error states. The Organizations list's
 *  sections (PagedSections), in this kind's words: one list card per section
 *  (or the flat list) with column labels from a 60rem column, and the
 *  loading, empty and error states inside it. */
export function PipelineSections({
  kind,
  params,
  version,
  book,
  currency,
  filtered,
  renderItem,
  onRowsLoaded,
  onClearFilters,
  onAdd,
}: {
  kind: PipelineKind;
  params: PipelineParams;
  version: number;
  book: PipelineBook;
  currency: CurrencyCode;
  filtered: boolean;
  renderItem: PipelineItemRenderer;
  /** Rows that just landed (page one or a Show more); it only ever adds. */
  onRowsLoaded: (rows: PipelineRow[]) => void;
  onClearFilters: () => void;
  onAdd: () => void;
}) {
  return (
    <PagedSections<PipelineRow, PipelinePage, PipelineGroup>
      book={book}
      read={kind.fetch}
      noun={kind.noun}
      grouped={params.group !== ''}
      listHeading={`${kind.title} list`}
      sectionQuery={(groupKey) => pipelineApiQuery(params, 'list', { group_value: groupKey, limit: String(PIPELINE_SECTION_SIZE) })}
      version={version}
      groupMoney={(group) => formatCompactMoney(group.mrr, currency)}
      renderRow={renderItem}
      onRowsLoaded={onRowsLoaded}
      empty={
        <EmptyBookState
          filtered={filtered}
          noun={kind.noun}
          title={`No open ${kind.noun.many}`}
          detail={`Add ${withArticle(kind.noun.one)}, or show the closed stages from Filters.`}
          onClearFilters={onClearFilters}
          onAdd={onAdd}
        />
      }
      framed
      listHeader={<ListHeaderRow columns={PIPELINE_COLUMNS} labels={pipelineLabels(kind.noun.one)} align={PIPELINE_ALIGNS} show={PIPELINE_HEADER_SHOW} />}
      skeleton={() => null}
    />
  );
}
