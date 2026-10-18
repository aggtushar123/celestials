import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioSummary } from '../../../features/organizations/portfolioTypes';
import { BreakdownCard } from './BreakdownCard';

const only = <T,>(values: T[], value: T) => values.length === 1 && values[0] === value;

/** The lifecycle stages with their counts, each a filter (UI foundations
 *  spec §4.3: a breakdown of more than three rows leaves the tile row for
 *  its own card). Stages with nobody in them are left out. */
export function LifecycleCard({
  summary,
  params,
  onFilter,
}: {
  summary: Pick<PortfolioSummary, 'lifecycle'>;
  params: Pick<PortfolioParams, 'lifecycle'>;
  onFilter: (patch: Partial<PortfolioParams>) => void;
}) {
  const stages = summary.lifecycle.filter((stage) => stage.count > 0);
  if (stages.length === 0) return null;
  return (
    <BreakdownCard
      title="Lifecycle"
      items={stages}
      pressed={(value) => only(params.lifecycle, value as LifecycleValue)}
      onToggle={(value) => onFilter({ lifecycle: only(params.lifecycle, value as LifecycleValue) ? [] : [value as LifecycleValue] })}
    />
  );
}
