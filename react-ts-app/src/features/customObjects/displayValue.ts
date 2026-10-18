import { formatDate } from '../customers/formatters';
import type { CustomFieldDefinition, CustomObjectRecord } from './types';

// Shared between CustomObjectsTab.tsx (one parent's own records) and
// CustomObjectRecordsPage.tsx (every record of one object type across
// the whole org) — both render the same field_type -> display-string
// mapping, so it lives here once rather than copy-pasted per page.
export function displayValue(field: CustomFieldDefinition, record: CustomObjectRecord): string {
  const value = record.data[field.api_name];
  if (value === undefined || value === null || value === '') return '—';
  if (field.field_type === 'boolean') return value ? 'Yes' : 'No';
  if (field.field_type === 'date') return formatDate(String(value));
  if (field.field_type === 'currency') return `$${Number(value).toLocaleString()}`;
  return String(value);
}
