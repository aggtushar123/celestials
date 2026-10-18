// Mirrors revenact-backend's services/attributes — see
// docs/API_CONTRACTS.md's `attributes` section.
import type { MessageSource } from '../../pages/copilot/types';

export type AttributeValueType = 'text' | 'number' | 'boolean' | 'picklist';
export type AttributeRefresh = 'manual' | 'nightly';
export type AttributeValue = string | number | boolean | null;

export interface AIAttribute {
  id: number;
  name: string;
  api_name: string;
  prompt: string;
  value_type: AttributeValueType;
  picklist_options: string[];
  applies_to_customer: boolean;
  applies_to_account: boolean;
  refresh: AttributeRefresh;
  created_at: string;
  updated_at: string;
}

export type AttributeBrief = Pick<AIAttribute, 'id' | 'name' | 'api_name' | 'prompt' | 'value_type' | 'picklist_options' | 'refresh'>;

export interface AIAttributeValue {
  id: number;
  attribute: number;
  customer: number | null;
  account: number | null;
  value: AttributeValue;
  reasoning: string;
  sources: MessageSource[];
  /** Citations withheld because this reader may not open them; the reasoning is withheld with them. */
  hidden_sources: number;
  status: 'filled' | 'insufficient' | 'failed';
  origin: 'ai' | 'human';
  set_by: { id: number; name: string } | null;
  computed_at: string;
}

export interface AttributeWithLatest {
  attribute: AttributeBrief;
  latest: AIAttributeValue | null;
}

export interface FillAllResult {
  filled: number;
  remaining: number;
  values: AIAttributeValue[];
}

export type CompanyRef = { customerId: number } | { accountId: number };

export const VALUE_TYPE_LABELS: Record<AttributeValueType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Yes / No',
  picklist: 'Picklist',
};

export const REFRESH_LABELS: Record<AttributeRefresh, string> = {
  manual: 'Manual',
  nightly: 'Nightly',
};

export function displayValue(type: AttributeValueType, value: AttributeValue): string {
  if (value === null || value === undefined) return '';
  if (type === 'boolean') return value ? 'Yes' : 'No';
  if (type === 'number' && typeof value === 'number') return value.toLocaleString();
  return String(value);
}
