import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useCapability } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { createCustomObjectDefinition, deleteCustomObjectDefinition, fetchCustomObjectDefinitions } from '../../features/customObjects/customObjectsApi';
import type { CustomObjectDefinition } from '../../features/customObjects/types';
import { BUTTON, CHECKBOX, CHOICE, EmptyState, ErrorState, FORM_ALERT, ICON_BUTTON, INPUT, ListHeaderRow, ListRow, LoadingState, MetaParts, NUM, PRIMARY, QUIET, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';
import { OBJECT_GRID } from './objectGrid';

// Backs the Custom objects tab of Settings > Data > Attributes (SettingsPage.tsx).
// Admin-only write, the same list / add form / ConfirmDialog shape as
// WebhooksPage.tsx, since defining a new object is tenant-wide config just like
// a webhook. Unlike Webhooks, reading the list is open to any org member
// (IsAuthenticated on GET, see the backend's CustomObjectDefinitionListCreateView),
// since every CSM needs to know what object types exist to use them on an
// Organization or Account page (CustomObjectsTab.tsx).
//
// This page only creates and deletes object types. Managing an existing one's
// fields and records lives on that object's own page (each row's name links
// there: pages/customObjects/CustomObjectRecordsPage.tsx), reached the same
// way from the sidebar's Custom objects section. It renders sections only: it
// is a tab's content, so the page's heading belongs to SettingsPage.
export function CustomObjectsPage() {
  const isAdmin = useCapability('manage_custom_objects');

  const [definitions, setDefinitions] = useState<CustomObjectDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(isAdmin);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomObjectDefinition | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAppliesToCustomer, setNewAppliesToCustomer] = useState(true);
  const [newAppliesToAccount, setNewAppliesToAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (the New object opener, the form, a deleted row).
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  const deleted = useRef(false);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });

  useEffect(() => {
    // A member only sees the "ask an admin" note below and works with records
    // on the Organization or Account page's own tab, so there is nothing to
    // fetch for them (same gate as WebhooksPage).
    if (!isAdmin) return;

    async function load() {
      try {
        setDefinitions(await fetchCustomObjectDefinitions());
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load custom objects.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [isAdmin]);

  function resetAddForm() {
    setShowAddForm(false);
    setNewName('');
    setNewAppliesToCustomer(true);
    setNewAppliesToAccount(false);
    setAddError(null);
  }

  function cancelAdd() {
    resetAddForm();
    pendingFocus.current = () => addButtonRef.current?.focus();
  }

  async function handleAdd() {
    setAddError(null);
    setIsSubmitting(true);
    try {
      const created = await createCustomObjectDefinition({
        name: newName,
        applies_to_customer: newAppliesToCustomer,
        applies_to_account: newAppliesToAccount,
      });
      setDefinitions((current) => [...current, created]);
      resetAddForm();
      pendingFocus.current = () => addButtonRef.current?.focus();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not create this custom object.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isAdmin) {
    return <SettingsNote icon="lock">You don't have permission to define custom objects: ask an admin to add one, or open an organization or account page to use what is already there.</SettingsNote>;
  }

  const appliesTo = (definition: CustomObjectDefinition) =>
    [definition.applies_to_customer && 'Organizations', definition.applies_to_account && 'Accounts'].filter(Boolean).join(' & ');
  return (
    <>
      {showAddForm ? (
        <form
          aria-label="New object"
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim() && (newAppliesToCustomer || newAppliesToAccount) && !isSubmitting) void handleAdd();
          }}
        >
          <SettingsSection
            title="New object"
            footer={
              <>
                <button type="button" onClick={cancelAdd} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" aria-disabled={!newName.trim() || (!newAppliesToCustomer && !newAppliesToAccount) || isSubmitting || undefined} className={PRIMARY}>
                  {isSubmitting ? 'Creating…' : 'Create'}
                </button>
              </>
            }
          >
            <SettingsRow label="Name" htmlFor="object-name">
              <input id="object-name" type="text" autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Opportunity line item" className={INPUT} />
            </SettingsRow>
            <SettingsRow label="Applies to" group>
              <div className="flex flex-wrap gap-x-5">
                <label className={CHOICE}>
                  <input type="checkbox" checked={newAppliesToCustomer} onChange={(event) => setNewAppliesToCustomer(event.target.checked)} className={CHECKBOX} />
                  Applies to Organizations
                </label>
                <label className={CHOICE}>
                  <input type="checkbox" checked={newAppliesToAccount} onChange={(event) => setNewAppliesToAccount(event.target.checked)} className={CHECKBOX} />
                  Applies to Accounts
                </label>
              </div>
            </SettingsRow>
            {addError ? (
              <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
                {addError}
              </p>
            ) : null}
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection
        title="Custom objects"
        description="Your own object types for organizations and accounts. Open one to manage its fields and records."
        action={
          showAddForm ? undefined : (
            <button ref={addButtonRef} type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New object
            </button>
          )
        }
        list="Custom objects"
        listRef={listRef}
        header={<ListHeaderRow columns={OBJECT_GRID.columns} labels={OBJECT_GRID.labels} align={OBJECT_GRID.aligns} show={OBJECT_GRID.headerShow} />}
        state={
          isLoading ? (
            <LoadingState label="Loading custom objects" count={2} />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : definitions.length === 0 ? (
            <EmptyState title="No custom objects yet." detail="Create one to start tracking your own data on organizations and accounts." />
          ) : undefined
        }
      >
        {definitions.map((definition) => (
          <ListRow
            key={definition.id}
            title={definition.name}
            href={`/custom-objects/${definition.id}`}
            columns={OBJECT_GRID.columns}
            gridAt={OBJECT_GRID.gridAt}
            meta={
              <span className={OBJECT_GRID.narrowOnly}>
                <MetaParts
                  parts={[
                    appliesTo(definition),
                    <>
                      <span className={NUM}>{definition.fields.length}</span> fields
                    </>,
                    <>
                      <span className={NUM}>{definition.records_count}</span> records
                    </>,
                  ]}
                />
              </span>
            }
            cells={[
              <span key="applies" className={TYPE.body}>
                {appliesTo(definition)}
              </span>,
              <span key="fields" className={`block text-right ${TYPE.body} ${NUM}`}>
                {definition.fields.length}
              </span>,
              <span key="records" className={`block text-right ${TYPE.body} ${NUM}`}>
                {definition.records_count}
              </span>,
            ]}
            actions={
              <button type="button" onClick={() => setDeleteTarget(definition)} aria-label={`Delete ${definition.name}`} className={ICON_BUTTON}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            }
          />
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.name}"?`}
          message="This deletes every field and every record of this object type. It can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteCustomObjectDefinition(deleteTarget.id);
            setDefinitions((current) => current.filter((d) => d.id !== deleteTarget.id));
            deleted.current = true;
          }}
          onClose={() => {
            if (deleted.current) {
              deleted.current = false;
              // The row is gone: the list takes focus, or New object when none are left.
              pendingFocus.current = () => (listRef.current ?? addButtonRef.current)?.focus();
            }
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}
