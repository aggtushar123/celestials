import type { CustomFieldDefinition } from './types';

// Shared between CustomObjectsTab.tsx and CustomObjectRecordsPage.tsx
// — both render one of these per real field on a definition, in their
// own add/edit forms, so the field_type -> input-element mapping lives
// here once. Split out from recordForm.ts (not merged into it) since
// that file's other exports are plain functions, not components —
// mixing the two in one file breaks fast refresh.
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const baseClass =
    'w-full px-2.5 py-1.5 bg-surface border border-line rounded-lg text-[12.5px] text-ink focus:outline-none focus:border-accent';

  if (field.field_type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={field.name}
      />
    );
  }
  if (field.field_type === 'picklist') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.name}
        className={baseClass}
      >
        <option value="">—</option>
        {field.picklist_options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={
        field.field_type === 'date'
          ? 'date'
          : field.field_type === 'number' || field.field_type === 'currency'
            ? 'number'
            : 'text'
      }
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={field.name}
      className={baseClass}
    />
  );
}
