// Thin wrappers over apiClient's apiFetch — same pattern every other
// feature's own API layer uses (see e.g. features/customers/customersSlice.ts's
// thunks). Replaces the old scenarioStorage.ts's localStorage-backed
// functions of the same shape now that revenact-backend has a real
// Scenario model (see docs/API_CONTRACTS.md's `scenarios` section).
import { apiFetch } from '../../lib/apiClient';
import type { Scenario, ScenarioRun, ScenarioWritePayload } from './types';

// Pagination is off on this endpoint (see ScenarioListCreateView's own
// docstring) — a plain array, not fetchAllPages's {count,next,...} shape.
export function fetchScenarios(): Promise<Scenario[]> {
  return apiFetch<Scenario[]>('/scenarios/');
}

export function fetchScenario(id: number | string): Promise<Scenario> {
  return apiFetch<Scenario>(`/scenarios/${id}/`);
}

export function createScenario(payload: ScenarioWritePayload): Promise<Scenario> {
  return apiFetch<Scenario>('/scenarios/', { method: 'POST', body: payload });
}

export function updateScenario(id: number, payload: ScenarioWritePayload): Promise<Scenario> {
  return apiFetch<Scenario>(`/scenarios/${id}/`, { method: 'PATCH', body: payload });
}

export function deleteScenario(id: number): Promise<null> {
  return apiFetch<null>(`/scenarios/${id}/`, { method: 'DELETE' });
}

export function runScenario(id: number, customerId: number): Promise<ScenarioRun> {
  return apiFetch<ScenarioRun>(`/scenarios/${id}/run/`, {
    method: 'POST',
    body: { customer_id: customerId },
  });
}

export function fetchScenarioRuns(id: number): Promise<ScenarioRun[]> {
  return apiFetch<ScenarioRun[]>(`/scenarios/${id}/runs/`);
}
