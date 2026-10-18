import type { CustomFieldDefinition, CustomObjectRecord } from './types';

// Shared between CustomObjectsTab.tsx (one parent's own records) and
// CustomObjectRecordsPage.tsx (every record of one object type across
// the whole org, plus real add/edit there now) — both build the exact
// same kind of dynamic add/edit form from a definition's own real
// fields, so it lives here once rather than copy-pasted per page. See
// FieldInput.tsx for the matching per-field input component (split
// into its own file since it's the one actual component here — mixing
// it with these plain functions in one file breaks fast refresh).

// A field value as held in the add/edit form's own local state — plain
// strings/booleans straight from each input, coerced to the real
// number/boolean createCustomObjectRecord expects only at submit time
// (see `toPayload`). Kept as strings while editing so a half-typed
// number ("12.") or an empty required field doesn't get silently
// mangled before the user's done typing.
export type FormValues = Record<string, string | boolean>;

export function initialFormValues(
  fields: CustomFieldDefinition[],
  record?: CustomObjectRecord
): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const existing = record?.data[field.api_name];
    if (field.field_type === 'boolean') {
      values[field.api_name] = typeof existing === 'boolean' ? existing : false;
    } else {
      values[field.api_name] = existing === undefined || existing === null ? '' : String(existing);
    }
  }
  return values;
}

export function toPayload(
  fields: CustomFieldDefinition[],
  values: FormValues
): CustomObjectRecord['data'] {
  const data: CustomObjectRecord['data'] = {};
  for (const field of fields) {
    const value = values[field.api_name];
    if (field.field_type === 'boolean') {
      data[field.api_name] = Boolean(value);
      continue;
    }
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) continue; // omitted — backend enforces is_required itself
    if (field.field_type === 'number' || field.field_type === 'currency') {
      data[field.api_name] = Number(trimmed);
    } else {
      data[field.api_name] = trimmed;
    }
  }
  return data;
}
