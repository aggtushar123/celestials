// The Pipelines row's grid (UI foundations spec §4.2: figures line up down
// the list) once the list's @container is 60rem wide: the checkbox, title
// and Part of; MRR; stage; priority; department; the date line; then Ask
// about this. Below 60rem the row is one flex line and its meta line says
// the facts (ListRow `gridAt`). Grid mode closes the column gap to 0.5rem
// so the labels show beside the Ask rail at 1440. Literal strings, so
// Tailwind sees every class; the test keeps them in step with the numbers.

export const PIPELINE_TRACKS_REM = [14, 5, 8, 5.5, 8, 7, 6.5] as const;
export const PIPELINE_GAP_REM = 0.5;
export const PIPELINE_BREAKPOINT_REM = 60;
export const PIPELINE_COLUMNS = '@min-[60rem]:grid-cols-[minmax(14rem,1fr)_5rem_8rem_5.5rem_8rem_7rem_6.5rem] @min-[60rem]:gap-x-2';
export const PIPELINE_GRID_AT = { row: '@min-[60rem]:grid', cell: '@min-[60rem]:block' } as const;
export const PIPELINE_HEADER_SHOW = '@min-[60rem]:grid';
/** The meta line's facts, shown only while the columns are not. */
export const PIPELINE_NARROW_ONLY = '@min-[60rem]:hidden';
export const PIPELINE_ALIGNS: ('left' | 'right')[] = ['left', 'right', 'left', 'left', 'left', 'left', 'left'];

/** The column labels, the first naming the kind ("Opportunity", "Risk"). */
export function pipelineLabels(noun: string): string[] {
  return [noun.charAt(0).toUpperCase() + noun.slice(1), 'MRR', 'Stage', 'Priority', 'Department', 'Date', ''];
}
