import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EMPTY_PIPELINE_FILTERS,
  parsePipelineParams,
  pipelineUrlSearch,
  type PipelineParams,
} from '../../../features/pipelines/pipelineParams';

/** The Pipelines page's URL state, shared by the List and the Board. Updates
 *  replace the history entry, like the portfolios' filters, so Back leaves
 *  the page rather than undoing a chip. */
export function usePipelineParams() {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parsePipelineParams(search), [search]);

  const update = useCallback(
    (patch: Partial<PipelineParams>) => {
      setSearch((prev) => pipelineUrlSearch({ ...parsePipelineParams(prev), ...patch }), { replace: true });
    },
    [setSearch],
  );

  const clearFilters = useCallback(() => update(EMPTY_PIPELINE_FILTERS), [update]);

  return { params, update, clearFilters };
}
