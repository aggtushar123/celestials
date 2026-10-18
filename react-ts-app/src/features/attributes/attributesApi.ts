// Thin apiFetch wrappers over revenact-backend's services/attributes.
import { apiFetch } from '../../lib/apiClient';
import type { AIAttribute, AIAttributeValue, AttributeValue, AttributeWithLatest, CompanyRef, FillAllResult } from './types';

function query(company: CompanyRef): string {
  return 'customerId' in company ? `customer=${company.customerId}` : `account=${company.accountId}`;
}

function body(company: CompanyRef): { customer: number } | { account: number } {
  return 'customerId' in company ? { customer: company.customerId } : { account: company.accountId };
}

export function fetchAttributes(): Promise<AIAttribute[]> {
  return apiFetch<AIAttribute[]>('/attributes/definitions/');
}

export function createAttribute(
  payload: Pick<AIAttribute, 'name' | 'prompt' | 'value_type' | 'picklist_options' | 'applies_to_customer' | 'applies_to_account' | 'refresh'>
): Promise<AIAttribute> {
  return apiFetch<AIAttribute>('/attributes/definitions/', { method: 'POST', body: payload });
}

export function deleteAttribute(id: number): Promise<null> {
  return apiFetch<null>(`/attributes/definitions/${id}/`, { method: 'DELETE' });
}

export function fillAttribute(id: number, company: CompanyRef): Promise<AIAttributeValue>;
export function fillAttribute(id: number): Promise<FillAllResult>;
export function fillAttribute(id: number, company?: CompanyRef): Promise<AIAttributeValue | FillAllResult> {
  return apiFetch<AIAttributeValue | FillAllResult>(`/attributes/definitions/${id}/fill/`, {
    method: 'POST',
    body: company ? body(company) : {},
  });
}

export function fetchValues(company: CompanyRef): Promise<AttributeWithLatest[]> {
  return apiFetch<AttributeWithLatest[]>(`/attributes/values/?${query(company)}`);
}

export function fetchHistory(attributeId: number, company: CompanyRef): Promise<AIAttributeValue[]> {
  return apiFetch<AIAttributeValue[]>(`/attributes/values/history/?attribute=${attributeId}&${query(company)}`);
}

export function overrideValue(attributeId: number, company: CompanyRef, value: AttributeValue): Promise<AIAttributeValue> {
  return apiFetch<AIAttributeValue>('/attributes/values/', {
    method: 'POST',
    body: { attribute: attributeId, ...body(company), value },
  });
}
