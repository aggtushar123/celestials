import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Boxes, Network, Layers, Plus, Pencil, Trash2 } from 'lucide-react';
import { useCapability } from '../../hooks';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import {
  createCustomObjectRecord,
  deleteCustomObjectRecord,
  fetchAllCustomObjectRecords,
  fetchCustomObjectDefinition,
  updateCustomObjectRecord,
} from '../../features/customObjects/customObjectsApi';
import { displayValue } from '../../features/customObjects/displayValue';
import { FieldInput } from '../../features/customObjects/FieldInput';
import { ManageFieldsPanel } from '../../features/customObjects/ManageFieldsPanel';
import { initialFormValues, toPayload } from '../../features/customObjects/recordForm';
import type { FormValues } from '../../features/customObjects/recordForm';
import type { CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord } from '../../features/customObjects/types';

interface CompanyOption {
  id: number;
  name: string;
}

// The real destination behind the sidebar's own dynamic "CUSTOM
// OBJECTS" section (Sidebar.tsx) — this object's own real home page:
// manage its fields (ManageFieldsPanel, admin-only to mutate) and its
// real records, org-wide, spanning every Organization/Account it
// applies to (unlike CustomObjectsTab.tsx, which is scoped to one
// specific parent already known from the Details page it's mounted
// on). Adding a record here means picking a real parent first — a
// Company (Organization) select, plus a dependent Account select when
// the object applies to Accounts too — same picker shape as
// components/canvas/NewMapDialog.tsx's own standalone-Add flow.
//
// `key={id}` below forces a full remount when navigating from one
// custom object straight to another (two different sidebar items,
// same route pattern) — simpler and more correct than resetting every
// piece of this page's own state by hand inside an effect that reruns
// on a changed id.
export function CustomObjectRecordsPage() {
  const { id } = useParams<{ id: string }>();
  return <CustomObjectRecordsPageForId key={id} definitionId={Number(id)} />;
}

function CustomObjectRecordsPageForId({ definitionId }: { definitionId: number }) {
  const navigate = useNavigate();
  const isAdmin = useCapability('manage_custom_objects');

  const [definition, setDefinition] = useState<CustomObjectDefinition | null>(null);
  const [records, setRecords] = useState<CustomObjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  const [isAdding, setIsAdding] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [accountOptions, setAccountOptions] = useState<CompanyOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [addValues, setAddValues] = useState<FormValues>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const latestAccountRequestRef = useRef(0);

  const [editingRecord, setEditingRecord] = useState<CustomObjectRecord | null>(null);
  const [editValues, setEditValues] = useState<FormValues>({});

  const [deleteTarget, setDeleteTarget] = useState<CustomObjectRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchCustomObjectDefinition(definitionId),
      fetchAllCustomObjectRecords(definitionId),
      apiFetch<CompanyOption[] | { results: CompanyOption[] }>('/customers/'),
    ])
      .then(([def, recs, customersResponse]) => {
        if (cancelled) return;
        setDefinition(def);
        setRecords(recs);
        setCompanies(Array.isArray(customersResponse) ? customersResponse : customersResponse.results);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load this custom object.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [definitionId]);

  function handleCompanyChange(companyId: string) {
    setSelectedCompanyId(companyId);
    setSelectedAccountId('');
    setAccountOptions([]);
    if (!companyId || !definition?.applies_to_account) return;

    const requestId = ++latestAccountRequestRef.current;
    apiFetch<CompanyOption[]>(`/customers/${companyId}/accounts/`)
      .then((accounts) => {
        if (latestAccountRequestRef.current === requestId) setAccountOptions(accounts);
      })
      .catch(() => {
        if (latestAccountRequestRef.current === requestId) setAccountOptions([]);
      });
  }

  function startAdding() {
    if (!definition) return;
    setIsAdding(true);
    setSelectedCompanyId('');
    setAccountOptions([]);
    setSelectedAccountId('');
    setAddValues(initialFormValues(definition.fields));
    setFormError(null);
  }

  function getParentPayload(): { customer_id: number } | { account_id: number } | null {
    if (!definition) return null;
    const accountOnly = !definition.applies_to_customer && definition.applies_to_account;
    if (accountOnly || selectedAccountId) {
      return selectedAccountId ? { account_id: Number(selectedAccountId) } : null;
    }
    return selectedCompanyId ? { customer_id: Number(selectedCompanyId) } : null;
  }

  async function handleAdd() {
    if (!definition) return;
    const parentPayload = getParentPayload();
    if (!parentPayload) {
      setFormError('Pick a real Organization (and Account, if this object needs one) first.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      const record = await createCustomObjectRecord({
        object_definition_id: definition.id,
        ...parentPayload,
        data: toPayload(definition.fields, addValues),
      });
      setRecords((current) => [record, ...current]);
      setIsAdding(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not add this record.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(record: CustomObjectRecord) {
    if (!definition) return;
    setEditingRecord(record);
    setEditValues(initialFormValues(definition.fields, record));
    setFormError(null);
  }

  async function handleSaveEdit() {
    if (!editingRecord || !definition) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const updated = await updateCustomObjectRecord(editingRecord.id, {
        data: toPayload(definition.fields, editValues),
      });
      setRecords((current) => current.map((r) => (r.id === updated.id ? updated : r)));
      setEditingRecord(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this record.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToParent(record: CustomObjectRecord) {
    if (record.parent_type === 'customer' && record.customer_id) {
      navigate(`/organizations/${record.customer_id}`);
    } else if (record.account_id) {
      navigate(`/accounts/${record.account_id}`);
    }
  }

  function handleFieldAdded(field: CustomFieldDefinition) {
    setDefinition((current) => (current ? { ...current, fields: [...current.fields, field] } : current));
  }

  function handleFieldDeleted(fieldId: number) {
    setDefinition((current) =>
      current ? { ...current, fields: current.fields.filter((f) => f.id !== fieldId) } : current
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-ink-faint">Loading…</div>
    );
  }

  if (error || !definition) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-danger">
        {error ?? 'Custom object not found.'}
      </div>
    );
  }

  const fields = definition.fields;
  const accountOnly = !definition.applies_to_customer && definition.applies_to_account;
  const both = definition.applies_to_customer && definition.applies_to_account;

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-6">
      <div>
        <h1 className="text-[20px] font-bold text-ink tracking-tight">{definition.name}</h1>
        <p className="text-[13px] text-ink-faint font-medium mt-0.5">
          Every real {definition.name} record across your organization.
        </p>
      </div>

      <ManageFieldsPanel
        definition={definition}
        isAdmin={isAdmin}
        onFieldAdded={handleFieldAdded}
        onFieldDeleted={handleFieldDeleted}
      />

      <div className="flex-1 bg-surface rounded-xl border border-line-subtle shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle">
          <h2 className="text-[12px] font-bold text-ink-faint uppercase tracking-wide">Records</h2>
          <button
            onClick={startAdding}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-[12px] font-bold shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add record
          </button>
        </div>

        {isAdding && (
          <div className="flex flex-col gap-2.5 p-4 bg-subtle/30 border-b border-line-subtle">
            <div className="flex flex-wrap gap-2.5">
              <div className="flex flex-col gap-1 min-w-[160px]">
                <label className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">Organization</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  aria-label="Organization"
                  className="w-full px-2.5 py-1.5 bg-surface border border-line rounded-lg text-[12.5px] text-ink focus:outline-none focus:border-accent"
                >
                  <option value="">Select…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {definition.applies_to_account && selectedCompanyId && (
                <div className="flex flex-col gap-1 min-w-[160px]">
                  <label className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">
                    Account{accountOnly && ' *'}
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    aria-label="Account"
                    className="w-full px-2.5 py-1.5 bg-surface border border-line rounded-lg text-[12.5px] text-ink focus:outline-none focus:border-accent"
                  >
                    {both && <option value="">No specific account</option>}
                    {!both && <option value="">Select…</option>}
                    {accountOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {fields.map((field) => (
                <div key={field.id} className="flex flex-col gap-1 min-w-[140px]">
                  <label className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">
                    {field.name}
                    {field.is_required && ' *'}
                  </label>
                  <FieldInput
                    field={field}
                    value={addValues[field.api_name] ?? ''}
                    onChange={(value) => setAddValues((v) => ({ ...v, [field.api_name]: value }))}
                  />
                </div>
              ))}
            </div>
            {formError && <p className="text-[12px] text-danger">{formError}</p>}
            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                disabled={isSubmitting}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-[12px] font-bold transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Adding…' : 'Add'}
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="text-[12px] font-semibold text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-1 text-center">
            <Boxes className="w-8 h-8 text-ink-faint mb-1" />
            <p className="text-[14px] font-semibold text-ink-muted">No records yet.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-subtle/40 border-b border-line-subtle">
                <th className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider">
                  Organization / Account
                </th>
                {fields.map((field) => (
                  <th
                    key={field.id}
                    className="px-5 py-2.5 text-[11px] font-bold text-ink-faint uppercase tracking-wider"
                  >
                    {field.name}
                  </th>
                ))}
                <th className="px-5 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {records.map((record) =>
                editingRecord?.id === record.id ? (
                  <tr key={record.id}>
                    <td colSpan={fields.length + 2} className="p-3 bg-subtle/30">
                      <div className="flex flex-wrap gap-2.5">
                        {fields.map((field) => (
                          <div key={field.id} className="flex flex-col gap-1 min-w-[140px]">
                            <label className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">
                              {field.name}
                            </label>
                            <FieldInput
                              field={field}
                              value={editValues[field.api_name] ?? ''}
                              onChange={(value) => setEditValues((v) => ({ ...v, [field.api_name]: value }))}
                            />
                          </div>
                        ))}
                      </div>
                      {formError && <p className="text-[12px] text-danger mt-2">{formError}</p>}
                      <div className="flex items-center gap-3 mt-2.5">
                        <button
                          onClick={handleSaveEdit}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-[12px] font-bold transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingRecord(null)}
                          className="text-[12px] font-semibold text-ink-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={record.id} className="hover:bg-subtle/40 transition-colors">
                    <td className="px-5 py-3 text-[13px] font-bold text-ink">
                      <button
                        onClick={() => goToParent(record)}
                        className="flex items-center gap-2 hover:text-accent transition-colors"
                      >
                        {record.parent_type === 'customer' ? (
                          <Network className="w-3.5 h-3.5 text-danger shrink-0" />
                        ) : (
                          <Layers className="w-3.5 h-3.5 text-info shrink-0" />
                        )}
                        {record.parent_name}
                      </button>
                    </td>
                    {fields.map((field) => (
                      <td key={field.id} className="px-5 py-3 text-[13px] text-ink-muted font-medium">
                        {displayValue(field, record)}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEditing(record)}
                        aria-label="Edit record"
                        className="p-1.5 hover:bg-subtle rounded-md text-ink-faint hover:text-accent transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(record)}
                        aria-label="Delete record"
                        className="p-1.5 hover:bg-subtle rounded-md text-ink-faint hover:text-danger transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this record?"
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteCustomObjectRecord(deleteTarget.id);
            setRecords((current) => current.filter((r) => r.id !== deleteTarget.id));
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
