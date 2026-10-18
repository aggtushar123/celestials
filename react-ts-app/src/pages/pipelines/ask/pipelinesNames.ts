import { createContext, useContext, useEffect } from 'react';
import type { PipelinesNames } from '../../../features/pipelines/askContext';
import type { PipelineFilterOptions, PipelineKindKey } from '../../../features/pipelines/pipelineTypes';

/** Only the page knows what its read returned: the List and the Board
 *  report their book's filter options, with the kind they were read for, so
 *  a live question's chip can name owners, organisations and accounts before
 *  the server has. Null outside PipelinesAskLayout. */
export const PipelinesNamesContext = createContext<((names: PipelinesNames) => void) | null>(null);

/** `options` is null until the page's read lands: nothing is reported until then. */
export function useReportPipelineOptions(kind: PipelineKindKey, options: PipelineFilterOptions | null): void {
  const report = useContext(PipelinesNamesContext);
  useEffect(() => {
    if (report && options) report({ kind, options });
  }, [report, kind, options]);
}
