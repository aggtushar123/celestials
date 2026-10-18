import { companyLabel } from '../../features/customers/formatters';
import type { Opportunity, Risk } from '../../features/customers/customersSlice';
import { OPPORTUNITY_STAGES, RISK_STAGES } from '../../features/pipelines/pipelineKinds';

// Plain data/helpers shared by KanbanBoard.tsx and its consumers (the
// Organization/Account Deals & risks tab, DealsTab.tsx and DealItem.tsx;
// and the Pipelines portfolio's own item parts, itemParts.tsx) — split
// out from KanbanBoard.tsx itself because a file exporting a component
// can only export components (react-refresh/only-export-components),
// not also these.

export const PRIORITY_COLORS = {
  high: 'bg-danger-dim text-danger border-danger/40',
  medium: 'bg-warning-dim text-warning border-warning/40',
  low: 'bg-success-dim text-success border-success/40',
};

// Opportunity.Stage / Risk.Stage on the backend, in board order (Closed
// Lost included since 2026-09-30), named once in pipelineKinds.ts.
export const OPPORTUNITY_STAGE_COLUMNS: { stage: Opportunity['stage']; title: string }[] = OPPORTUNITY_STAGES.map(({ value, label }) => ({
  stage: value,
  title: label,
}));

export const RISK_STAGE_COLUMNS: { stage: Risk['stage']; title: string }[] = RISK_STAGES.map(({ value, label }) => ({ stage: value, title: label }));

// Opportunity and Risk are otherwise unrelated models, but their own
// card content is field-for-field identical (title/mrr/companies/
// account_name/priority) — this is the common shape KanbanBoard needs,
// satisfied structurally by both without either importing the other.
export interface PipelineCardEntity {
  id: number;
  title: string;
  mrr: string;
  priority: 'high' | 'medium' | 'low';
  /** Opportunity/Risk only: whose pipeline it is on. */
  department?: string;
  department_display?: string;
  companies: { id: number; name: string }[];
  account_name: string | null;
}

export function pipelineOrgLabel(e: PipelineCardEntity): string {
  const label = companyLabel(e.companies);
  return e.account_name ? `${label} • ${e.account_name}` : label;
}
