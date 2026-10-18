import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import {
  EMPTY_PIPELINE_FILTERS,
  hasPipelineFilters,
  pipelineApiQuery,
  type PipelineParams,
  type PipelineView,
} from '../../../features/pipelines/pipelineParams';
import type { PipelinePage, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { usePagedBook, type PagedBook } from '../../organizations/portfolio/usePagedBook';

export const PIPELINE_PAGE_SIZE = 50;
export const PIPELINE_SECTION_SIZE = 25;

/** `total` is M in "N of M": the kind's book in the same stages as N (the
 *  URL's, else the view's default ones) and the same `ids` (with `ids` and
 *  no stage the server lists every stage, so M must name them too, ruling
 *  F16) with every other filter off. Null when nothing but the stage choice
 *  and `ids` narrows (M would equal N; the page then says "N
 *  opportunities"), and never less than N. */
export type PipelineBook = PagedBook<PipelineRow, PipelinePage>;

/** M's query, or null when nothing but the stages and ids narrows the
 *  book. Sort never changes a count, so it is dropped here (as
 *  Organizations' probe sends none): otherwise a sort change alone would
 *  reload the probe. */
function totalQuery(params: PipelineParams, view: PipelineView): string | null {
  if (!hasPipelineFilters({ ...params, stage: [], ids: [] })) return null;
  const query = new URLSearchParams(
    pipelineApiQuery({ ...params, ...EMPTY_PIPELINE_FILTERS, stage: params.stage, ids: params.ids, group: '' }, view, { limit: '1' }),
  );
  query.delete('sort');
  return query.toString();
}

/** The page's frame read of the kind's book (the tiles, groups, filter
 *  options, count and currency), with the rows when the List is flat.
 *  Grouped, each section or column reads its own rows and this read asks
 *  for one row only. `totalVersion` reloads the M probe (default:
 *  `version`); the Board passes one that skips its moves, which cannot
 *  change M. */
export function usePipelineBook(
  kind: PipelineKind,
  params: PipelineParams,
  view: PipelineView,
  version: number,
  onLoaded?: (rows: PipelineRow[]) => void,
  totalVersion: number = version,
): PipelineBook {
  const grouped = params.group !== '';
  return usePagedBook<PipelineRow, PipelinePage>(
    kind.fetch,
    kind.noun,
    pipelineApiQuery(params, view, { limit: String(grouped ? 1 : PIPELINE_PAGE_SIZE) }),
    grouped,
    version,
    onLoaded,
    totalQuery(params, view),
    totalVersion,
  );
}
