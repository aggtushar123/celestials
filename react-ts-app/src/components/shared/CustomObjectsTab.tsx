import { useEffect, useId, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import {
  createCustomObjectRecord,
  deleteCustomObjectRecord,
  fetchCustomObjectDefinitions,
  fetchCustomObjectRecords,
  updateCustomObjectRecord,
} from '../../features/customObjects/customObjectsApi';
import { displayValue } from '../../features/customObjects/displayValue';
import { FieldInput } from '../../features/customObjects/FieldInput';
import { initialFormValues, toPayload } from '../../features/customObjects/recordForm';
import type { FormValues } from '../../features/customObjects/recordForm';
import type { CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord } from '../../features/customObjects/types';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { SummaryLine } from '../organizations/detail/ListParts';
import { BUTTON, CardHeader, CardSection, EmptyState, ErrorState, ICON_BUTTON, ListCard, LoadingState, NUM, PRIMARY, QUIET, TYPE } from '../ui';

export interface CustomObjectsTabProps {
  /** Set on an organization's page. */
  customerId?: number;
  /** Set on an account's page. */
  accountId?: number;
  /** Reports the total record count across every applicable object once
   *  loaded; the tab shows it itself as its summary line. */
  onCountChange?: (count: number) => void;
}

/** An item's title: its first field's value, else the object's name and the record's id. */
function titleOf(definition: CustomObjectDefinition, record: CustomObjectRecord): string {
  const first = definition.fields[0];
  const value = first ? displayValue(first, record) : '—';
  return value === '—' ? `${definition.name} ${record.id}` : value;
}

/** House rule: DM Mono is for numbers (and the digits in a formatted date),
 *  never for plain or picklist text. */
function isNumericFieldType(fieldType: CustomFieldDefinition['field_type']): boolean {
  return fieldType === 'number' || fieldType === 'currency' || fieldType === 'date';
}

/** The add and edit forms: a label above each input (the input carries it too). */
function RecordFields({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDefinition[];
  values: FormValues;
  onChange: (apiName: string, value: string | boolean) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1">
          <span aria-hidden="true" className={TYPE.label}>
            {field.name}
            {field.is_required ? ' (required)' : ''}
          </span>
          <FieldInput field={field} value={values[field.api_name] ?? ''} onChange={(value) => onChange(field.api_name, value)} />
        </div>
      ))}
    </div>
  );
}

/** Custom objects (account spec 2026-09-29 §2.9a): each object that applies
 *  to this parent, its records as list items (never a table): the first
 *  field as the title, the others by name. Add, edit and delete in place.
 *  Reads its own data (definitions, then each object's records), since
 *  custom objects are admin-defined and dynamic. */
export function CustomObjectsTab({ customerId, accountId, onCountChange }: CustomObjectsTabProps) {
  const baseId = useId();
  const [definitions, setDefinitions] = useState<CustomObjectDefinition[]>([]);
  const [recordsByDefinition, setRecordsByDefinition] = useState<Record<number, CustomObjectRecord[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [addingForId, setAddingForId] = useState<number | null>(null);
  const [addValues, setAddValues] = useState<FormValues>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingRecord, setEditingRecord] = useState<CustomObjectRecord | null>(null);
  const [editValues, setEditValues] = useState<FormValues>({});

  const [deleteTarget, setDeleteTarget] = useState<{ record: CustomObjectRecord; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const allDefinitions = await fetchCustomObjectDefinitions();
        const applicable = allDefinitions.filter((d) => (customerId !== undefined ? d.applies_to_customer : d.applies_to_account));
        const parent = customerId !== undefined ? { customerId } : { accountId: accountId! };
        const recordLists = await Promise.all(applicable.map((definition) => fetchCustomObjectRecords(definition.id, parent)));
        if (cancelled) return;

        setDefinitions(applicable);
        const byDefinition: Record<number, CustomObjectRecord[]> = {};
        applicable.forEach((definition, i) => {
          byDefinition[definition.id] = recordLists[i];
        });
        setRecordsByDefinition(byDefinition);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load custom objects.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (customerId !== undefined || accountId !== undefined) load();
    return () => {
      cancelled = true;
    };
  }, [customerId, accountId, attempt]);

  // Derived from the state the list renders: one source for "how many records exist now".
  const total = Object.values(recordsByDefinition).reduce((sum, records) => sum + records.length, 0);
  useEffect(() => {
    onCountChange?.(total);
  }, [total, onCountChange]);

  function retry() {
    setLoadError(null);
    setIsLoading(true);
    setAttempt((n) => n + 1);
  }

  function startAdding(definition: CustomObjectDefinition) {
    setAddingForId(definition.id);
    setAddValues(initialFormValues(definition.fields));
    setFormError(null);
  }

  async function handleAdd(definition: CustomObjectDefinition) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const record = await createCustomObjectRecord({
        object_definition_id: definition.id,
        ...(customerId !== undefined ? { customer_id: customerId } : { account_id: accountId! }),
        data: toPayload(definition.fields, addValues),
      });
      setRecordsByDefinition((current) => ({
        ...current,
        [definition.id]: [record, ...(current[definition.id] ?? [])],
      }));
      setAddingForId(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not add this record.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(record: CustomObjectRecord, definition: CustomObjectDefinition) {
    setEditingRecord(record);
    setEditValues(initialFormValues(definition.fields, record));
    setFormError(null);
  }

  async function handleSaveEdit(definition: CustomObjectDefinition) {
    if (!editingRecord) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const updated = await updateCustomObjectRecord(editingRecord.id, {
        data: toPayload(definition.fields, editValues),
      });
      setRecordsByDefinition((current) => ({
        ...current,
        [definition.id]: current[definition.id].map((r) => (r.id === updated.id ? updated : r)),
      }));
      setEditingRecord(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this record.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <ListCard label="Custom objects" state={<LoadingState label="Loading custom objects" />} />;
  if (loadError) return <ListCard label="Custom objects" state={<ErrorState message={loadError} onRetry={retry} />} />;
  if (definitions.length === 0) {
    return (
      <ListCard
        label="Custom objects"
        state={<EmptyState title="No custom objects yet" detail="An organization admin can add one in Settings, under Custom objects." />}
      />
    );
  }

  const formErrorLine = formError ? (
    <p role="alert" className="text-[13px] text-danger-ink">
      {formError}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {definitions.map((definition) => {
        const records = recordsByDefinition[definition.id] ?? [];
        const headingId = `${baseId}-${definition.id}`;
        const rest = definition.fields.slice(1);
        const adding = addingForId === definition.id;
        return (
          <ListCard
            key={definition.id}
            label={definition.name}
            header={
              <>
                <CardHeader
                  id={headingId}
                  title={definition.name}
                  meta={<SummaryLine as="span" parts={[{ value: String(records.length), label: records.length === 1 ? 'record' : 'records' }]} />}
                  action={
                    <button type="button" onClick={() => startAdding(definition)} className={BUTTON}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add record
                    </button>
                  }
                />
                {adding ? (
                  <CardSection>
                    <div className="flex flex-col gap-3">
                      <RecordFields
                        fields={definition.fields}
                        values={addValues}
                        onChange={(apiName, value) => setAddValues((v) => ({ ...v, [apiName]: value }))}
                      />
                      {formErrorLine}
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleAdd(definition)} disabled={isSubmitting} className={PRIMARY}>
                          {isSubmitting ? 'Adding…' : 'Add'}
                        </button>
                        <button type="button" onClick={() => setAddingForId(null)} className={QUIET}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </CardSection>
                ) : null}
              </>
            }
            state={records.length === 0 && !adding ? <EmptyState title={`No ${definition.name} records yet.`} /> : records.length === 0 ? <></> : undefined}
          >
            {records.map((record) => {
              const title = titleOf(definition, record);
              if (editingRecord?.id === record.id) {
                return (
                  <li key={record.id} data-record={record.id} className="flex flex-col gap-3 px-4 py-3">
                    <RecordFields
                      fields={definition.fields}
                      values={editValues}
                      onChange={(apiName, value) => setEditValues((v) => ({ ...v, [apiName]: value }))}
                    />
                    {formErrorLine}
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => handleSaveEdit(definition)} disabled={isSubmitting} className={PRIMARY}>
                        {isSubmitting ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => setEditingRecord(null)} className={QUIET}>
                        Cancel
                      </button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={record.id} data-record={record.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className={`${TYPE.body} truncate font-semibold`}>{title}</h3>
                    {rest.length ? (
                      <dl className={`${TYPE.meta} mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1`}>
                        {rest.map((field) => (
                          <div key={field.id} className="inline-flex min-w-0 gap-1">
                            <dt>{field.name}</dt>
                            <dd className={isNumericFieldType(field.field_type) ? `${NUM} text-ink` : 'text-ink'}>{displayValue(field, record)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => startEditing(record, definition)} aria-label={`Edit ${title}`} className={ICON_BUTTON}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget({ record, title })} aria-label={`Delete ${title}`} className={ICON_BUTTON}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ListCard>
        );
      })}

      {deleteTarget ? (
        <ConfirmDialog
          title={`Delete ${deleteTarget.title}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteCustomObjectRecord(deleteTarget.record.id);
            setRecordsByDefinition((current) => ({
              ...current,
              [deleteTarget.record.object_definition_id]: current[deleteTarget.record.object_definition_id].filter(
                (r) => r.id !== deleteTarget.record.id
              ),
            }));
          }}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
