import { ControlsView as HealthMix } from './ControlsView';
import { HealthDistribution } from '../../../health/HealthDistribution';

/** Health › Distribution: the portfolio mix (the old Controls tab) and the
 *  organisations/accounts × count/MRR rollup that used to live at /health. */
export function DistributionView() {
  return (
    <div className="flex flex-col gap-4">
      <HealthMix />
      <HealthDistribution />
    </div>
  );
}
