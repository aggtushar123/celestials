// Thin apiFetch wrappers over revenact-backend's /api/v1/rules/ (backend
// plan Task 12, docs/API_CONTRACTS.md `rules`).
import { apiFetch } from '../../lib/apiClient';
import type {
  ApproveAnswer,
  Rule,
  RuleReview,
  RuleRow,
  RuleScope,
  RuleTestRequest,
  RuleTestResult,
  RuleWrite,
  RunDetail,
  RunsPage,
  ReviewStatus,
} from './ruleTypes';

export const RULES_PATH = '/rules/';
const one = (id: number) => `${RULES_PATH}${id}/`;

/** Every rule the reader may read, by name, unpaginated. */
export function fetchRules(scope: RuleScope = 'all'): Promise<RuleRow[]> {
  return apiFetch<RuleRow[]>(scope === 'all' ? RULES_PATH : `${RULES_PATH}?scope=${scope}`);
}

export function fetchRule(id: number): Promise<Rule> {
  return apiFetch<Rule>(one(id));
}

/** A rule owned by the caller (201); 429 past 50. */
export function createRule(body: RuleWrite): Promise<Rule> {
  return apiFetch<Rule>(RULES_PATH, { method: 'POST', body });
}

/** Owner only. The builder sends the whole rule; the switch sends `is_active`. */
export function updateRule(id: number, body: Partial<RuleWrite>): Promise<Rule> {
  return apiFetch<Rule>(one(id), { method: 'PATCH', body });
}

export function deleteRule(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

/** Who the rule would act on tonight, checked as a save; nothing is written. */
export function testRule(body: RuleTestRequest): Promise<RuleTestResult> {
  return apiFetch<RuleTestResult>(`${RULES_PATH}test/`, { method: 'POST', body });
}

/** The rule's nights, newest first; `cursor` is passed through as given. */
export function fetchRuns(id: number, cursor: string | null): Promise<RunsPage> {
  return apiFetch<RunsPage>(cursor ? `${one(id)}runs/?cursor=${encodeURIComponent(cursor)}` : `${one(id)}runs/`);
}

export function fetchRun(id: number, runId: number): Promise<RunDetail> {
  return apiFetch<RunDetail>(`${one(id)}runs/${runId}/`);
}

/** The caller's own reviews (owner only). */
export function fetchReviews(status: ReviewStatus = 'waiting'): Promise<RuleReview[]> {
  return apiFetch<RuleReview[]>(`${RULES_PATH}reviews/?status=${status}`);
}

/** Sends the survey as the rule's owner. A Surveys refusal is a 400 with
 *  Surveys' own body; a decided review is a 409. */
export function approveReview(id: number): Promise<ApproveAnswer> {
  return apiFetch<ApproveAnswer>(`${RULES_PATH}reviews/${id}/approve/`, { method: 'POST' });
}

export function skipReview(id: number): Promise<RuleReview> {
  return apiFetch<RuleReview>(`${RULES_PATH}reviews/${id}/skip/`, { method: 'POST' });
}
