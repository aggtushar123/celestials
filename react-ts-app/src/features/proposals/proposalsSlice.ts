// Mirrors revenact-backend's proposal payloads exactly; see
// docs/API_CONTRACTS.md -> metrics -> proposals. Types only since Waiting on
// you (spec 2026-10-05-brain-waiting-design): the desk is read through
// features/brain, and no store state is kept for proposals.

export type ProposalKind = 'task' | 'initiative';
export type ProposalStatus = 'proposed' | 'approved' | 'rejected';

export interface TaskAction {
  customer_id: number;
  customer_name: string;
  title: string;
  assignee_name: string;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
}

export interface InitiativeAction {
  metric: string;
  metric_label: string;
  dimension: string;
  member: string;
  member_label: string;
  target_value: number;
  target_by: string;
}

export interface Proposal {
  id: number;
  batch: string;
  kind: ProposalKind;
  kind_display: string;
  title: string;
  /** Null for a reader without view_all_accounts — withheld, never sent
   *  empty (SOC2:AUTH-02; see revenact-backend's
   *  services/metrics/proposal_access.py). */
  rationale: string | null;
  /** Empty for the same reader, for the same reason. */
  evidence: string[];
  action: TaskAction | InitiativeAction;
  initiative: { id: number; title: string } | null;
  status: ProposalStatus;
  status_display: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
  result: Record<string, number>;
  generated_by: string | null;
  /** Set when the facilitator wrote this from a multiplayer session's decisions. */
  source: { session_id: number; conversation_id: number; title: string } | null;
  created_at: string;
}
