import { useEffect, useRef, useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCapability } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { createAttribute, deleteAttribute, fetchAttributes, fillAttribute } from '../../features/attributes/attributesApi';
import { REFRESH_LABELS, VALUE_TYPE_LABELS } from '../../features/attributes/types';
import type { AIAttribute, AttributeRefresh, AttributeValueType } from '../../features/attributes/types';

import { BUTTON, CHECKBOX, CHOICE, EmptyState, ErrorState, FORM_ALERT, ICON_BUTTON, INPUT, INVALID, LoadingState, MetaParts, PRIMARY, QUIET, ROW_ACTIONS, Select, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';

// Backs Settings > AI attributes. Same admin-only write and list, add form and
// ConfirmDialog shape as Custom objects: an AI attribute is workspace-wide
// schema. The answers live on each company page (AIAttributesPanel).

export function AIAttributesPage() {
  const isAdmin = useCapability('manage_custom_objects');
  const [attributes, setAttributes] = useState<AIAttribute[]>([]);
  const [isLoading, setIsLoading] = useState(isAdmin);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AIAttribute | null>(null);
  const [fillNote, setFillNote] = useState<Record<number, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [filling, setFilling] = useState<number | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [valueType, setValueType] = useState<AttributeValueType>('text');
  const [options, setOptions] = useState('');
  const [toCustomer, setToCustomer] = useState(true);
  const [toAccount, setToAccount] = useState(false);
  const [refresh, setRefresh] = useState<AttributeRefresh>('manual');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (the New attribute opener, the form, a deleted row).
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
    if (!isAdmin) return;
    async function load() {
      try {
        setAttributes(await fetchAttributes());
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load AI attributes.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [isAdmin]);

  function resetForm() {
    setShowAddForm(false);
    setName('');
    setPrompt('');
    setValueType('text');
    setOptions('');
    setToCustomer(true);
    setToAccount(false);
    setRefresh('manual');
    setAddError(null);
    pendingFocus.current = () => addButtonRef.current?.focus();
  }

  const optionList = options.split(',').map((o) => o.trim()).filter(Boolean);
  const canCreate = name.trim() && prompt.trim() && (toCustomer || toAccount) && (valueType !== 'picklist' || optionList.length > 0) && !isSubmitting;

  async function handleCreate() {
    setAddError(null);
    setIsSubmitting(true);
    try {
      const created = await createAttribute({
        name: name.trim(),
        prompt: prompt.trim(),
        value_type: valueType,
        picklist_options: valueType === 'picklist' ? optionList : [],
        applies_to_customer: toCustomer,
        applies_to_account: toAccount,
        refresh,
      });
      setAttributes((current) => [...current, created]);
      resetForm();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not create the attribute.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setActionError(null);
    try {
      await deleteAttribute(target.id);
      setAttributes((current) => current.filter((a) => a.id !== target.id));
      deleted.current = true;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not delete the attribute.');
    }
  }

  async function handleFillAll(attribute: AIAttribute) {
    setFilling(attribute.id);
    setActionError(null);
    setFillNote((current) => ({ ...current, [attribute.id]: '' }));
    try {
      const result = await fillAttribute(attribute.id);
      const note = result.remaining > 0 ? `${result.filled} filled, ${result.remaining} left for tonight` : `${result.filled} filled`;
      setFillNote((current) => ({ ...current, [attribute.id]: note }));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Could not fill ${attribute.name}.`);
    } finally {
      setFilling(null);
    }
  }

  const title = settingsTitle('/settings/ai/attributes');
  const intro = 'Ask a question of every company in plain English. The Copilot answers it from the records, with its reasoning and sources, and keeps every answer.';
  if (!isAdmin) {
    return (
      <SettingsFrame
        title={title}
        intro={intro}
        note={<SettingsNote icon="lock">You don't have permission to define AI attributes. Ask an admin to add one; the answers show on every organization and account page.</SettingsNote>}
      >
        {null}
      </SettingsFrame>
    );
  }

  return (
    <SettingsFrame
      title={title}
      intro={intro}
      action={
        showAddForm ? undefined : (
          <button ref={addButtonRef} type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New attribute
          </button>
        )
      }
    >
      {showAddForm ? (
        <form
          aria-label="New attribute"
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) void handleCreate();
          }}
        >
          <SettingsSection
            title="New attribute"
            footer={
              <>
                <button type="button" onClick={resetForm} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" aria-disabled={!canCreate || undefined} className={PRIMARY}>
                  {isSubmitting ? 'Creating…' : 'Create'}
                </button>
              </>
            }
          >
            <SettingsRow label="Name" htmlFor="attr-name">
              <input id="attr-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Product tier" autoFocus className={INPUT} />
            </SettingsRow>
            <SettingsRow
              label="Question"
              htmlFor="attr-prompt"
              hint="Written as you would ask a colleague. The Copilot reads the company's notes, emails, tickets and calls to answer it."
              hintId="attr-prompt-hint"
              stacked
            >
              <textarea
                id="attr-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={2}
                placeholder="Which tier of our product does this company use?"
                aria-describedby="attr-prompt-hint"
                className={`${INPUT} ${INVALID} min-h-20 resize-y py-2`}
              />
            </SettingsRow>
            <SettingsRow label="Answer type" htmlFor="attr-type">
              <Select
                id="attr-type"
                label="Answer type"
                labelPosition="external"
                value={valueType}
                onChange={setValueType}
                options={(Object.keys(VALUE_TYPE_LABELS) as AttributeValueType[]).map((type) => ({ value: type, label: VALUE_TYPE_LABELS[type] }))}
                className="sm:max-w-xs"
              />
            </SettingsRow>
            <SettingsRow label="Refresh" htmlFor="attr-refresh">
              <Select
                id="attr-refresh"
                label="Refresh"
                labelPosition="external"
                value={refresh}
                onChange={setRefresh}
                options={[
                  { value: 'manual', label: 'When someone asks' },
                  { value: 'nightly', label: 'Nightly, when there is new activity' },
                ]}
                className="sm:max-w-xs"
              />
            </SettingsRow>
            {valueType === 'picklist' ? (
              <SettingsRow label="Options" htmlFor="attr-options" hint="Comma separated. The answer must be one of these." hintId="attr-options-hint">
                <input
                  id="attr-options"
                  type="text"
                  value={options}
                  onChange={(event) => setOptions(event.target.value)}
                  placeholder="SMB, Mid-market, Enterprise"
                  aria-describedby="attr-options-hint"
                  className={INPUT}
                />
              </SettingsRow>
            ) : null}
            <SettingsRow label="Applies to" group>
              <div className="flex flex-wrap gap-x-5">
                <label className={CHOICE}>
                  <input type="checkbox" checked={toCustomer} onChange={(event) => setToCustomer(event.target.checked)} className={CHECKBOX} />
                  Applies to Organizations
                </label>
                <label className={CHOICE}>
                  <input type="checkbox" checked={toAccount} onChange={(event) => setToAccount(event.target.checked)} className={CHECKBOX} />
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

      {actionError ? (
        <p role="alert" className={FORM_ALERT}>
          {actionError}
        </p>
      ) : null}

      <SettingsSection
        title="Questions"
        list="AI attributes"
        listRef={listRef}
        state={
          isLoading ? (
            <LoadingState label="Loading AI attributes" count={2} />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : attributes.length === 0 ? (
            <EmptyState icon={Sparkles} title="No AI attributes yet." detail="Add one and the Copilot answers it on every organization or account page." />
          ) : undefined
        }
      >
        {attributes.map((attribute) => (
          <li key={attribute.id} className="group relative flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className={`${TYPE.body} font-semibold`}>{attribute.name}</p>
              <p className={`${TYPE.bodyMuted} line-clamp-2`}>{attribute.prompt}</p>
              <p className={TYPE.meta}>
                <MetaParts
                  parts={[
                    VALUE_TYPE_LABELS[attribute.value_type],
                    [attribute.applies_to_customer && 'Organizations', attribute.applies_to_account && 'Accounts'].filter(Boolean).join(' & '),
                    attribute.value_type === 'picklist' ? attribute.picklist_options.join(', ') : null,
                    REFRESH_LABELS[attribute.refresh],
                  ]}
                />
              </p>
              {/* Always mounted: each Fill all result is announced in its own row. */}
              <p role="status" className={`${TYPE.meta} empty:sr-only`}>
                {fillNote[attribute.id] ?? ''}
              </p>
            </div>
            <div className={ROW_ACTIONS}>
              <button
                type="button"
                onClick={() => {
                  if (filling !== attribute.id) void handleFillAll(attribute);
                }}
                aria-disabled={filling === attribute.id || undefined}
                aria-label={`Fill all for ${attribute.name}`}
                className={QUIET}
              >
                {filling === attribute.id ? 'Filling…' : 'Fill all'}
              </button>
              <button type="button" onClick={() => setDeleteTarget(attribute)} aria-label={`Delete ${attribute.name}`} className={ICON_BUTTON}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          message="Every answer the Copilot or a colleague recorded for it goes with it."
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onClose={() => {
            if (deleted.current) {
              deleted.current = false;
              // The row is gone: the list takes focus, or New attribute when none are left.
              pendingFocus.current = () => (listRef.current ?? addButtonRef.current)?.focus();
            }
            setDeleteTarget(null);
          }}
        />
      )}
    </SettingsFrame>
  );
}
