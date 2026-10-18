export interface DrillRow {
  id: string; // customer id as a string
  name: string;
  owner?: string;
  arr?: number | null;
  detail?: string; // one short line, e.g. "45 days overdue"
}

export type DrillSource =
  | { kind: 'rows'; rows: DrillRow[] }
  | { kind: 'server'; path: string; query: string; segment: string };

export interface DrillRequest {
  title: string; // e.g. "At risk"
  figure: string; // e.g. "$114.5K" — shown beside the title
  source: DrillSource;
}
