// Mirrors revenact-backend's services/requests — see
// docs/API_CONTRACTS.md's `requests` section.

export type RequestStatus = 'open' | 'planned' | 'shipped' | 'declined';
export type EvidenceKind = 'email' | 'ticket' | 'call';

export interface FeatureRequestRow {
  id: number;
  title: string;
  summary: string;
  status: RequestStatus;
  owner: { id: number; name: string } | null;
  /** Decimal as a string: the ARR of every company the reader may open that asked. */
  arr: string;
  companies: number;
  interactions: number;
  last_90_days: number;
  previous_90_days: number;
  created_at: string;
  updated_at: string;
}

export interface RequestEvidenceRow {
  id: number;
  kind: EvidenceKind;
  record_id: number;
  snippet: string;
  occurred_at: string;
  company: { type: 'customer' | 'account'; id: number; name: string };
}

export interface FeatureRequestFull extends FeatureRequestRow {
  companies_asking: { id: number; name: string; arr: string }[];
  evidence: RequestEvidenceRow[];
}

export interface GatherResult {
  created: number;
  linked: number;
  remaining: number;
  detail?: string;
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  shipped: 'Shipped',
  declined: 'Declined',
};
