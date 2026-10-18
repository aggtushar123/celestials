// Thin apiFetch wrappers — same pattern as pages/settings/webhooksApi.ts.
// Mirrors revenact-backend's services/custom_objects — see
// docs/API_CONTRACTS.md's `custom_objects` section.
import { apiFetch, fetchAllPages } from '../../lib/apiClient';
import type { CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord } from './types';

// ── Object definitions (Settings > Custom Objects — admin-only writes) ──

export function fetchCustomObjectDefinitions(): Promise<CustomObjectDefinition[]> {
  return apiFetch<CustomObjectDefinition[]>('/custom-objects/definitions/');
}

export function fetchCustomObjectDefinition(id: number): Promise<CustomObjectDefinition> {
  return apiFetch<CustomObjectDefinition>(`/custom-objects/definitions/${id}/`);
}

export function createCustomObjectDefinition(payload: {
  name: string;
  applies_to_customer: boolean;
  applies_to_account: boolean;
}): Promise<CustomObjectDefinition> {
  return apiFetch<CustomObjectDefinition>('/custom-objects/definitions/', {
    method: 'POST',
    body: payload,
  });
}

export function deleteCustomObjectDefinition(id: number): Promise<null> {
  return apiFetch<null>(`/custom-objects/definitions/${id}/`, { method: 'DELETE' });
}

// ── Field definitions (nested under one object definition) ──

export function createCustomFieldDefinition(
  definitionId: number,
  payload: {
    name: string;
    field_type: CustomFieldDefinition['field_type'];
    is_required: boolean;
    picklist_options: string[];
  }
): Promise<CustomFieldDefinition> {
  return apiFetch<CustomFieldDefinition>(`/custom-objects/definitions/${definitionId}/fields/`, {
    method: 'POST',
    body: payload,
  });
}

export function deleteCustomFieldDefinition(definitionId: number, fieldId: number): Promise<null> {
  return apiFetch<null>(`/custom-objects/definitions/${definitionId}/fields/${fieldId}/`, {
    method: 'DELETE',
  });
}

// ── Records (one object definition's real rows for one Customer/Account) ──

export function fetchCustomObjectRecords(
  definitionId: number,
  parent: { customerId: number } | { accountId: number }
): Promise<CustomObjectRecord[]> {
  const parentParam =
    'customerId' in parent ? `customer=${parent.customerId}` : `account=${parent.accountId}`;
  return apiFetch<CustomObjectRecord[]>(
    `/custom-objects/records/?definition=${definitionId}&${parentParam}`
  );
}

// Every record of one object type across the whole organisation, any
// parent — the org-wide per-object page (pages/customObjects/
// CustomObjectRecordsPage.tsx) reached from the sidebar's own real
// "Custom Objects" section. The backend paginates this one (unlike the
// single-parent call above, which stays a plain array) — fetchAllPages
// walks every page into one flat list, same convention as
// SettingsPage.tsx's own "every record, not just the first page" need.
export function fetchAllCustomObjectRecords(definitionId: number): Promise<CustomObjectRecord[]> {
  return fetchAllPages<CustomObjectRecord>(`/custom-objects/records/?definition=${definitionId}`);
}

export function createCustomObjectRecord(payload: {
  object_definition_id: number;
  customer_id?: number;
  account_id?: number;
  data: CustomObjectRecord['data'];
}): Promise<CustomObjectRecord> {
  return apiFetch<CustomObjectRecord>('/custom-objects/records/', { method: 'POST', body: payload });
}

export function updateCustomObjectRecord(
  id: number,
  payload: { data: CustomObjectRecord['data'] }
): Promise<CustomObjectRecord> {
  return apiFetch<CustomObjectRecord>(`/custom-objects/records/${id}/`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteCustomObjectRecord(id: number): Promise<null> {
  return apiFetch<null>(`/custom-objects/records/${id}/`, { method: 'DELETE' });
}
