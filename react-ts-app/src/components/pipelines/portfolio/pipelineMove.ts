import { rowWithStage, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineGroupKey } from '../../../features/pipelines/pipelineParams';
import type { PipelinePage, PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { withMovedItem, withMovedTotals, type StageMove } from '../../organizations/portfolio/boardMove';

/** One item moving between stage columns (the boards' shared StageMove). */
export type PipelineMove = StageMove<PipelineRow>;

export interface PipelineColumnSpec {
  /** The group key: the column's `group_value`. */
  key: string;
  label: string;
  count: number;
  mrr: number;
  /** Starts collapsed on the Board (Closed Lost; spec §1). */
  collapsible: boolean;
}

/** The Board's columns. By stage, every stage the server lists for the kind
 *  (`summary.stages`, in board order, empty ones included, so there is
 *  always somewhere to drop), narrowed to the stage filter when one is set;
 *  each column's count and MRR are its group's (`groups` lists only
 *  non-empty ones, so a stage with none reads 0). Any other grouping shows
 *  the server's groups as they are. */
export function pipelineColumns(
  group: PipelineGroupKey,
  page: { groups: PipelinePage['groups']; summary: { stages: { value: string; label: string }[] } },
  kind: PipelineKind,
  stageFilter: string[],
): PipelineColumnSpec[] {
  if (group !== 'stage') return page.groups.map((g) => ({ key: g.key, label: g.label, count: g.count, mrr: g.mrr, collapsible: false }));
  return page.summary.stages
    .filter((stage) => stageFilter.length === 0 || stageFilter.includes(stage.value))
    .map((stage) => {
      const found = page.groups.find((g) => g.key === stage.value);
      return {
        key: stage.value,
        label: stage.label,
        count: found?.count ?? 0,
        mrr: found?.mrr ?? 0,
        collapsible: kind.collapsedStages.includes(stage.value),
      };
    });
}

/** A column header with a move applied: one item and its MRR out of
 *  `from`, into `to`. */
export function withPipelineMove(spec: PipelineColumnSpec, move: PipelineMove | null): PipelineColumnSpec {
  return withMovedTotals(spec, move, 'mrr', move?.row.mrr ?? 0);
}

/** A column's cards with a move applied: the moved card leaves every column
 *  but its new one, where it sits on top, once, reading as its new stage
 *  (open, overdue and signal as the server would compute them). */
export function withMovedPipelineRow(rows: PipelineRow[], key: string, move: PipelineMove | null, kind: PipelineKind): PipelineRow[] {
  return withMovedItem(rows, key, move, (row, to) => rowWithStage(row, to, kind));
}
