// Shared fixtures for feature request tests, shaped exactly like
// docs/API_CONTRACTS.md's `requests` section.
import type { FeatureRequestFull, FeatureRequestRow, RequestEvidenceRow } from '../features/requests/types';

export function requestRow(overrides: Partial<FeatureRequestRow> = {}): FeatureRequestRow {
  return {
    id: 4,
    title: 'Slack alerts',
    summary: 'Push health alerts into a shared Slack channel.',
    status: 'open',
    owner: null,
    arr: '200000',
    companies: 2,
    interactions: 3,
    last_90_days: 3,
    previous_90_days: 1,
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-22T09:00:00Z',
    ...overrides,
  };
}

export function evidenceRow(overrides: Partial<RequestEvidenceRow> = {}): RequestEvidenceRow {
  return {
    id: 11,
    kind: 'email',
    record_id: 412,
    snippet: 'Can we get alerts in Slack?',
    occurred_at: '2026-09-15T09:00:00Z',
    company: { type: 'customer', id: 12, name: 'Pizza Hut' },
    ...overrides,
  };
}

export function requestFull(overrides: Partial<FeatureRequestFull> = {}): FeatureRequestFull {
  return {
    ...requestRow(),
    companies_asking: [
      { id: 12, name: 'Pizza Hut', arr: '120000' },
      { id: 13, name: 'Burger King', arr: '80000' },
    ],
    evidence: [evidenceRow(), evidenceRow({ id: 12, kind: 'ticket', record_id: 9, snippet: 'Slack notifications please', company: { type: 'customer', id: 13, name: 'Burger King' } })],
    ...overrides,
  };
}

export function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
