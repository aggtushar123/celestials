import { useAppDispatch } from '../../../hooks';
import { updateOpportunity, updateRisk, type Opportunity, type Risk } from '../../../features/customers/customersSlice';
import { stageLabel, type PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineRow } from '../../../features/pipelines/pipelineTypes';
import { useStageMove, type StageMoveState } from '../../organizations/portfolio/useBoardMove';
import type { PipelineMove } from './pipelineMove';

export type PipelineMoveState = StageMoveState<PipelineRow>;

/** Moving one item between stage columns (spec §1 "dragging a card sets its
 *  stage"), on the boards' shared useStageMove: optimistic, one at a time,
 *  saved through the item's own PATCH (the slice's updateOpportunity /
 *  updateRisk, which the Deals & risks boards use too), rolled back with the
 *  server's reason. */
export function usePipelineMove(kind: PipelineKind, onSaved: (move: PipelineMove) => void): PipelineMoveState {
  const dispatch = useAppDispatch();
  return useStageMove<PipelineRow, string>({
    stageOf: (row) => row.stage.value,
    nameOf: (row) => row.title,
    stageLabel: (stage) => stageLabel(kind, stage),
    fallbackReason: `Could not update ${kind.noun.one}.`,
    save: (row, to) =>
      kind.key === 'opportunities'
        ? dispatch(updateOpportunity({ id: row.id, stage: to as Opportunity['stage'] })).unwrap()
        : dispatch(updateRisk({ id: row.id, stage: to as Risk['stage'] })).unwrap(),
    onSaved,
  });
}
