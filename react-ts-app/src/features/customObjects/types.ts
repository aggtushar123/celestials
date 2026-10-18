// Mirrors revenact-backend's services/custom_objects — see
// docs/API_CONTRACTS.md's `custom_objects` section.

export type CustomFieldType = 'text' | 'number' | 'currency' | 'date' | 'boolean' | 'picklist';

export interface CustomFieldDefinition {
  id: number;
  name: string;
  api_name: string;
  field_type: CustomFieldType;
  field_type_display: string;
  is_required: boolean;
  picklist_options: string[];
  order: number;
  created_at: string;
}

export interface CustomObjectDefinition {
  id: number;
  name: string;
  api_name: string;
  applies_to_customer: boolean;
  applies_to_account: boolean;
  fields: CustomFieldDefinition[];
  records_count: number;
  created_at: string;
}

// A field's own value, keyed by CustomFieldDefinition.api_name — a
// string (text/date/picklist), number, or boolean depending on that
// field's own field_type. Untyped here since it's genuinely
// admin-defined and dynamic; CustomObjectsTab's own dynamic form is
// what actually knows which shape a given key should be.
export type CustomObjectRecordData = Record<string, string | number | boolean>;

export interface CustomObjectRecord {
  id: number;
  object_definition_id: number;
  customer_id: number | null;
  account_id: number | null;
  /** Which Organization/Account this record belongs to — real on every
   * response, but only actually needed on the org-wide per-object page
   * (CustomObjectRecordsPage.tsx), which spans every parent at once;
   * CustomObjectsTab.tsx already knows its own single parent. */
  parent_name: string;
  parent_type: 'customer' | 'account';
  data: CustomObjectRecordData;
  created_at: string;
  updated_at: string;
}
