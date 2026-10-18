// Thin apiFetch wrappers — same pattern as webhooksApi.ts. Mirrors
// revenact-backend's services/fx_rates — see docs/API_CONTRACTS.md's
// `fx_rates` section.
import { apiFetch } from '../../lib/apiClient';
import type { CurrencyCode } from '../../features/auth/authSlice';

export interface FxRate {
  id: number;
  currency: CurrencyCode;
  currency_display: string;
  /** DRF DecimalField serializes as a string — see customersSlice.ts's
   * own comment on this for why the type here is `string`, not `number`. */
  rate_to_org_currency: string;
  updated_at: string;
}

export interface FxRateWritePayload {
  currency: CurrencyCode;
  rate_to_org_currency: string;
}

// Pagination is off on this endpoint (see FxRateListCreateView's own
// docstring) — a plain array.
export function fetchFxRates(): Promise<FxRate[]> {
  return apiFetch<FxRate[]>('/fx-rates/');
}

export function createFxRate(payload: FxRateWritePayload): Promise<FxRate> {
  return apiFetch<FxRate>('/fx-rates/', { method: 'POST', body: payload });
}

export function updateFxRate(id: number, payload: Pick<FxRateWritePayload, 'rate_to_org_currency'>): Promise<FxRate> {
  return apiFetch<FxRate>(`/fx-rates/${id}/`, { method: 'PATCH', body: payload });
}

export function deleteFxRate(id: number): Promise<null> {
  return apiFetch<null>(`/fx-rates/${id}/`, { method: 'DELETE' });
}
