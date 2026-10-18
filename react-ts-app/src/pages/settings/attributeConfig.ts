// Shared attribute-table plumbing for every entity's own Data > Custom/
// System Attributes sub-tab (Organization first, Account next — see
// organizationAttributes.ts/accountAttributes.ts) — generic over the
// entity type so AttributesTable.tsx, isFilled(), and usagePercent()
// aren't duplicated per entity the way the mock's own hardcoded table
// would have required.

export type AttributeType = 'text' | 'number' | 'date' | 'currency' | 'boolean' | 'select' | 'relation';

/** How a type reads on screen: the table's Type column and the Filter. */
export const ATTRIBUTE_TYPE_LABELS: Record<AttributeType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  currency: 'Currency',
  boolean: 'Boolean',
  select: 'Select',
  relation: 'Relation',
};

export interface AttributeDef<T> {
  displayName: string;
  name: string;
  type: AttributeType;
  isCustom: boolean;
  /** True only for the handful of fields always present on every row
   * regardless — e.g. `name` (the one field a create form actually
   * requires) or id/created_at/updated_at (always set by the backend). */
  required?: boolean;
  getValue: (entity: T) => unknown;
}

// A deliberately approximate "has this ever actually been set" check,
// not a strict null check — DecimalField-as-string financial fields
// default to "0.00" rather than null, so a literal zero reads the same
// as "not yet entered" here. Good enough for a Usage% heuristic; not
// meant to be exact for every field (a record whose real health score
// is a genuine 0.0 would undercount).
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return false;
    const asNumber = Number(trimmed);
    return Number.isNaN(asNumber) || asNumber !== 0;
  }
  if (Array.isArray(value)) return value.length > 0;
  return true; // a non-null relation object (owner/created_by/...)
}

// % of the given entities where this attribute is actually filled in —
// real data, not the old mock's own fabricated per-row percentages.
export function usagePercent<T>(attr: AttributeDef<T>, entities: T[]): number {
  if (entities.length === 0) return 0;
  const filledCount = entities.filter((e) => isFilled(attr.getValue(e))).length;
  return Math.round((filledCount / entities.length) * 100);
}

export function attributeProperties<T>(attr: AttributeDef<T>): string[] {
  const props: string[] = [];
  if (attr.required) props.push('Required');
  if (attr.isCustom) props.push('UI Editable');
  props.push('Visible');
  return props;
}

/** The table's Description column, shared with the CSV download. */
export function attributeDescription<T>(attr: AttributeDef<T>): string {
  return attr.isCustom ? 'Default' : 'System Generated';
}
