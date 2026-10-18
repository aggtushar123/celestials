import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { createCustomFieldDefinition, deleteCustomFieldDefinition } from './customObjectsApi';
import type { CustomFieldDefinition, CustomFieldType, CustomObjectDefinition } from './types';

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'picklist', label: 'Picklist' },
];

export interface ManageFieldsPanelProps {
  definition: CustomObjectDefinition;
  /** Field mutation (add/delete) is admin-only server-side (IsOrgAdmin
   * — see revenact-backend's own CustomFieldDefinitionListCreateView).
   * Non-admins still see the real field list below, just without the
   * "+ Add field"/delete controls. */
  isAdmin: boolean;
  onFieldAdded: (field: CustomFieldDefinition) => void;
  onFieldDeleted: (fieldId: number) => void;
}

// The object's own schema, moved here from the Settings > Custom
// Objects page (CustomObjectsPage.tsx) it used to live on exclusively
// — this object's own real page (CustomObjectRecordsPage.tsx) is now
// where an admin actually manages it, alongside the object's own real
// records; Settings keeps only the org-wide list + creating a brand
// new object.
export function ManageFieldsPanel({ definition, isAdmin, onFieldAdded, onFieldDeleted }: ManageFieldsPanelProps) {
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [isFieldSubmitting, setIsFieldSubmitting] = useState(false);
  const [fieldAddError, setFieldAddError] = useState<string | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<CustomFieldDefinition | null>(null);

  function resetFieldForm() {
    setShowFieldForm(false);
    setNewFieldName('');
    setNewFieldType('text');
    setNewFieldRequired(false);
    setNewFieldOptions('');
    setFieldAddError(null);
  }

  async function handleAddField() {
    setFieldAddError(null);
    setIsFieldSubmitting(true);
    try {
      const field = await createCustomFieldDefinition(definition.id, {
        name: newFieldName,
        field_type: newFieldType,
        is_required: newFieldRequired,
        picklist_options:
          newFieldType === 'picklist'
            ? newFieldOptions
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
            : [],
      });
      onFieldAdded(field);
      resetFieldForm();
    } catch (err) {
      setFieldAddError(err instanceof ApiError ? err.message : 'Could not add this field.');
    } finally {
      setIsFieldSubmitting(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-line-subtle shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[12px] font-bold text-ink-faint uppercase tracking-wide">Fields</h2>
        {isAdmin && (
          <button
            onClick={() => setShowFieldForm((v) => !v)}
            className="flex items-center gap-1 text-[11.5px] font-bold text-accent hover:text-accent-hover"
          >
            <Plus className="w-3.5 h-3.5" />
            Add field
          </button>
        )}
      </div>

      {definition.fields.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint mb-2">No fields yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 mb-2">
          {definition.fields.map((field) => (
            <li key={field.id} className="flex items-center gap-2 text-[12.5px] text-ink-muted">
              <span className="font-semibold text-ink">{field.name}</span>
              <span>· {field.field_type_display}</span>
              {field.is_required && <span className="text-danger">· Required</span>}
              {field.field_type === 'picklist' && <span>· {field.picklist_options.join(', ')}</span>}
              {isAdmin && (
                <button
                  onClick={() => setDeleteFieldTarget(field)}
                  aria-label={`Delete field ${field.name}`}
                  className="ml-1 p-1 hover:bg-subtle rounded-md text-ink-faint hover:text-danger transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showFieldForm && (
        <div className="flex flex-col gap-2.5 bg-subtle/30 border border-line-subtle rounded-lg p-3.5 mt-2">
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder="Field name"
              className="flex-1 px-3 py-1.5 bg-surface border border-line rounded-lg text-[12.5px] text-ink focus:outline-none focus:border-accent"
            />
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)}
              className="px-2.5 py-1.5 bg-surface border border-line rounded-lg text-[12.5px] text-ink focus:outline-none focus:border-accent"
            >
              {FIELD_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-muted whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={newFieldRequired}
                onChange={(e) => setNewFieldRequired(e.target.checked)}
              />
              Required
            </label>
          </div>
          {newFieldType === 'picklist' && (
            <input
              type="text"
              value={newFieldOptions}
              onChange={(e) => setNewFieldOptions(e.target.value)}
              placeholder="Options, comma-separated (e.g. Gold, Silver, Bronze)"
              className="w-full px-3 py-1.5 bg-surface border border-line rounded-lg text-[12.5px] text-ink focus:outline-none focus:border-accent"
            />
          )}
          {fieldAddError && <p className="text-[12px] text-danger">{fieldAddError}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddField}
              disabled={!newFieldName.trim() || isFieldSubmitting}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-[12px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFieldSubmitting ? 'Adding…' : 'Add'}
            </button>
            <button onClick={resetFieldForm} className="text-[12px] font-semibold text-ink-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {deleteFieldTarget && (
        <ConfirmDialog
          title={`Delete field "${deleteFieldTarget.name}"?`}
          message="Existing records keep whatever value they already had for it, but it won't show or be editable anymore — this can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteCustomFieldDefinition(definition.id, deleteFieldTarget.id);
            onFieldDeleted(deleteFieldTarget.id);
          }}
          onClose={() => setDeleteFieldTarget(null)}
        />
      )}
    </div>
  );
}
