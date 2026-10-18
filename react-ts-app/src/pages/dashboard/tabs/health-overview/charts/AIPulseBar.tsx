import type { HealthDataRow } from '../mockData';
import { PulseScoreBar } from './PulseScoreBar';

/** The book's AI Pulse scores, 1–5, stacked by current health. */
export function AIPulseBar({ data, drillable = true }: { data: HealthDataRow[]; drillable?: boolean }) {
  return <PulseScoreBar data={data} field="aiPulseScore" name="AI Pulse" drillable={drillable} />;
}
