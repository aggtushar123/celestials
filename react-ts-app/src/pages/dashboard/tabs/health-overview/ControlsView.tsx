import { useState, useMemo } from 'react';
import type { HealthStatus } from '../../../../features/health/types';
import { useHealthOverview } from './useHealthOverview';
import { HealthEmpty, HealthError, HealthLoading, HealthTruncatedNotice } from './HealthDataState';
import { CurrentHealthDonut } from './charts/CurrentHealthDonut';
import { HealthByOwnerStackedBar } from './charts/HealthByOwnerStackedBar';
import { CSMPulseBar } from './charts/CSMPulseBar';
import { AIPulseBar } from './charts/AIPulseBar';
import { AccountHealthDetailTable } from './charts/AccountHealthDetailTable';
import { AccountHealthBySeats } from './charts/AccountHealthBySeats';
import { HealthChangeOverTimeStacked } from './charts/HealthChangeOverTimeStacked';
import { AccountsByRenewalDateBar } from './charts/AccountsByRenewalDateBar';

/** The card each chart sits in. `relative` anchors the chart's drill targets;
 *  `overflow-hidden` keeps the rounded corners, never a clipped plot, since
 *  no card has a fixed height. */
const CARD = 'relative bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden';

export function ControlsView() {
  const [activeFilter, setActiveFilter] = useState<HealthStatus | null>(null);

  const { rows, error, truncated, isInitialLoad, hasLoaded } = useHealthOverview();

  // A truncated book is a capped slice of a larger one — a drill from it
  // would only ever show *some* of the accounts a chart segment counted, so
  // every drill on this view's charts is switched off rather than quietly
  // lying.
  const drillable = !truncated;

  // Derived filtered dataset for all child charts
  const filteredData = useMemo(() => {
    if (!activeFilter) return rows;
    return rows.filter(row => row.healthStatus === activeFilter);
  }, [rows, activeFilter]);

  if (isInitialLoad) return <HealthLoading />;
  if (error) return <HealthError message={error} />;
  if (hasLoaded && rows.length === 0) return <HealthEmpty />;

  return (
    <div className="w-full h-full flex flex-col gap-4 pb-12">
      {truncated && <HealthTruncatedNotice />}
      {/* Only when a filter is on: an always-rendered empty row left a band
          of blank space above the first cards. */}
      {activeFilter && (
        <div className="flex items-center justify-end px-2">
          <button
            onClick={() => setActiveFilter(null)}
            className="text-xs bg-danger-dim hover:opacity-80 text-danger font-bold py-1 px-3 rounded-full transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-danger" />
            Clear active filter: {activeFilter}
          </button>
        </div>
      )}

      {/* Every card sits at its own height: no row has a fixed height (that
          clipped two cards stacked inside it below xl), and the donut and
          owner cards are not stretched to match a taller neighbour. */}
      <div data-row className="flex flex-col md:flex-row items-start gap-4 [&>*]:min-w-0">
        <div className={`w-full md:w-[36%] lg:w-[32%] shrink-0 ${CARD}`}>
          <CurrentHealthDonut
            data={rows}
            activeFilter={activeFilter}
            onSegmentClick={setActiveFilter}
            filteredCount={filteredData.length}
          />
        </div>
        <div className={`w-full md:flex-1 min-w-0 ${CARD}`}>
          <HealthByOwnerStackedBar data={filteredData} drillable={drillable} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 [&>*]:min-w-0">
        <div className={CARD}>
          <CSMPulseBar data={filteredData} drillable={drillable} />
        </div>
        <div className={CARD}>
          <AIPulseBar data={filteredData} drillable={drillable} />
        </div>
      </div>

      <div className={CARD}>
        <AccountsByRenewalDateBar data={filteredData} drillable={drillable} />
      </div>

      <div className="flex flex-col xl:flex-row gap-4 [&>*]:min-w-0">
        <div className={`xl:w-[32%] shrink-0 ${CARD}`}>
          <AccountHealthBySeats data={filteredData} />
        </div>
        <div className={`flex-1 min-w-0 ${CARD}`}>
          <HealthChangeOverTimeStacked data={filteredData} />
        </div>
      </div>

      <div className={CARD}>
        <AccountHealthDetailTable data={filteredData} />
      </div>
    </div>
  );
}
