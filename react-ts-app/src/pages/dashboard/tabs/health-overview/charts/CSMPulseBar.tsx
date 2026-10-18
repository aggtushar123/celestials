import type { HealthDataRow } from '../mockData';
import { PulseScoreBar } from './PulseScoreBar';

/** The book's CSM Pulse scores, 1–5, stacked by current health. */
export function CSMPulseBar({ data, drillable = true }: { data: HealthDataRow[]; drillable?: boolean }) {
  return <PulseScoreBar data={data} field="csmPulseScore" name="CSM Pulse" drillable={drillable} />;
}
