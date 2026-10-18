// Thin wrappers over apiClient's apiFetch — same pattern as
// copilotApi.ts's own.
import { apiFetch } from '../../lib/apiClient';
import type { CockpitSummary } from './cockpitTypes';

// `days` controls the Renewals window (backend defaults to 30 — see
// CockpitSummaryView's own `?days=` docstring) — Renewals' own "Next
// N Days" dropdown passes this for real now.
export function fetchCockpitSummary(days?: number): Promise<CockpitSummary> {
  return apiFetch<CockpitSummary>(`/cockpit/summary/${days ? `?days=${days}` : ''}`);
}
