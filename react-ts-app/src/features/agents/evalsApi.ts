import { apiFetch } from '../../lib/apiClient';

/** One graded case of Copilot's golden set (backend copilot.evals, 2026-10-16). */
export interface EvalResult {
  id: string;
  kind: string;
  question: string;
  asker?: 'admin' | 'csm_a' | 'csm_b';
  answer?: string;
  correct?: number;
  grounded?: number;
  private?: boolean;
  verdict?: 'pass' | 'fail';
  reason: string;
  passed: boolean;
  skipped?: boolean;
}

export interface EvalRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  model: string;
  judge_model: string;
  total: number;
  passed: number;
  results: EvalResult[];
}

export interface EvalsPayload {
  run: EvalRun | null;
  history: { id: number; started_at: string; total: number; passed: number }[];
}

/** GET /copilot/evals/: the newest golden-set run and the last 10 pass rates (view-all-accounts). */
export const fetchEvals = () => apiFetch<EvalsPayload>('/copilot/evals/');

export const ASKER_LABEL: Record<NonNullable<EvalResult['asker']>, string> = {
  admin: 'Asked as an admin',
  csm_a: 'Asked as a CSM',
  csm_b: 'Asked as another CSM',
};
