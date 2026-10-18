import type { CurrencyCode, UserFunction } from '../auth/authSlice';
import type { Option } from '../organizations/portfolioTypes';

// Mirrors revenact-backend's GET /api/v1/pipelines/{opportunities,risks}/
// (branch feat/pipelines-portfolio, docs/API_CONTRACTS.md -> pipelines_portfolio;
// services/pipelines_portfolio/rows.py and shape.py).

export type PipelineKindKey = 'opportunities' | 'risks';

export interface PipelineRow {
  id: number;
  kind: 'opportunity' | 'risk';
  title: string;
  /** "Part of": always an organisation or account the viewer may open. */
  parent: { type: 'organisation' | 'account'; id: number; name: string };
  /** The parent organisations the viewer may open, lowest id first. */
  companies: { id: number; name: string }[];
  /** The parent's owner; `{id: null, name: "Not in your book"}` when that
   *  person is outside the viewer's organisation; null when unassigned. */
  owner: { id: number | null; name: string } | null;
  /** In the workspace's currency (the response's `currency`). */
  mrr: number;
  stage: { value: string; label: string };
  priority: { value: 'high' | 'medium' | 'low'; label: string };
  /** `label` is '' for the whole company (no department). */
  department: { value: UserFunction | ''; label: string };
  /** Expected close or due by; `days` from today, negative once passed. */
  date: { value: string | null; days: number | null };
  open: boolean;
  /** Open, with its date in the past (due today is not overdue). */
  overdue: boolean;
  signal: { kind: 'overdue' | 'high_priority'; label: string } | null;
  stage_changed_at: string;
  created_at: string;
}

export interface PipelineTotal {
  count: number;
  mrr: number;
}

export interface PipelineGroup extends PipelineTotal {
  key: string;
  label: string;
}

/** The tiles, over every stage of the filtered set (the stage filter is the
 *  only one they ignore). */
export interface PipelineSummary {
  items: number;
  mrr: number;
  open: PipelineTotal;
  within: { '30': PipelineTotal; '90': PipelineTotal };
  overdue: PipelineTotal;
  /** Closed Won (risks: Mitigated) whose stage changed this quarter. */
  done_this_quarter: PipelineTotal & { stage: string };
  /** Every stage, empty ones included: the Board's column headers. */
  stages: (PipelineTotal & { value: string; label: string })[];
}

export interface PipelineFilterOptions {
  organisations: Option[];
  accounts: Option[];
  /** Named people, then `outside` ("Not in your book"), then `unassigned`. */
  owners: Option[];
  stages: Option[];
  priorities: Option[];
  /** `none` is the whole company. */
  departments: Option[];
}

export interface PipelinePage {
  kind: PipelineKindKey;
  results: PipelineRow[];
  next_cursor: string | null;
  count: number;
  groups: PipelineGroup[];
  summary: PipelineSummary;
  filters: PipelineFilterOptions;
  currency: CurrencyCode;
}

export type PipelineBulkAction = 'set_stage' | 'set_priority' | 'set_department' | 'set_date';

export interface PipelineBulkRequest {
  ids: number[];
  action: PipelineBulkAction;
  /** A stage, priority, department ('' = whole company), or a date
   *  (YYYY-MM-DD, null to clear). */
  value: string | null;
}
