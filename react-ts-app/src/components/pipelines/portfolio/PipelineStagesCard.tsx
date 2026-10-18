import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineParams } from '../../../features/pipelines/pipelineParams';
import type { PipelineSummary } from '../../../features/pipelines/pipelineTypes';
import { BreakdownCard } from '../../organizations/portfolio/BreakdownCard';

const only = (values: string[], value: string) => values.length === 1 && values[0] === value;

/** The kind's open stages with their counts (spec 2026-09-30 §1), empty
 *  ones included, each a stage filter: out of the tile row into their own
 *  card (UI foundations spec §4.3). A kind with one open stage (Risks) has
 *  nothing to break down: the Open tile already says it. */
export function PipelineStagesCard({
  kind,
  summary,
  params,
  onFilter,
}: {
  kind: PipelineKind;
  summary: Pick<PipelineSummary, 'stages'>;
  params: Pick<PipelineParams, 'stage'>;
  onFilter: (patch: Partial<PipelineParams>) => void;
}) {
  const stages = summary.stages.filter((stage) => kind.openStages.includes(stage.value));
  if (stages.length < 2) return null;
  return (
    <BreakdownCard
      title="Stages"
      items={stages}
      pressed={(value) => only(params.stage, value)}
      onToggle={(value) => onFilter({ stage: only(params.stage, value) ? [] : [value] })}
    />
  );
}
