import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { updateOrganisation } from '../../features/auth/authSlice';
import { formatMoney, CURRENCY_OPTIONS } from '../../features/customers/formatters';
import { fetchFxRates, createFxRate, updateFxRate, deleteFxRate } from './fxRatesApi';
import type { FxRate } from './fxRatesApi';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { ApiError } from '../../lib/apiClient';
import type { CurrencyCode } from '../../features/auth/authSlice';
import { BUTTON, EmptyState, ErrorState, FIELD_ERROR, ICON_BUTTON, INPUT, INVALID, LoadingState, NUM, OverflowMenu, PRIMARY, QUIET, ROW_ACTIONS, Select, SettingsNote, SettingsRow, SettingsSection, TYPE, useSettingsDraft } from '../../components/ui';

// Settings › Data › Defaults › Currency (DefaultsPage.tsx). Real, admin-gated
// persistence via Organisation.currency; the preview uses the same
// currency-aware formatMoney() that backs every money value. Exchange rates
// are Tier 1's admin-maintained FX table (fxRatesApi.ts, the backend's
// services.fx_rates).
export function CurrencySection() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const isAdmin = useCapability('manage_org_settings');
  const [selected, setSelected] = useState<CurrencyCode>(user?.organisation.currency ?? 'USD');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedCurrency = user?.organisation.currency ?? 'USD';
  const isDirty = selected !== savedCurrency;

  // Exchange rates: admin-only both ways server-side (IsOrgAdmin on GET too,
  // see FxRateListCreateView's own docstring), so a CSM can't even fetch this
  // list. Same "no fetch attempted at all" pattern as WebhooksPage.tsx.
  const [rates, setRates] = useState<FxRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(isAdmin);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [showAddRate, setShowAddRate] = useState(false);
  const [newRateCurrency, setNewRateCurrency] = useState<CurrencyCode | ''>('');
  const [newRateValue, setNewRateValue] = useState('');
  const [isAddingRate, setIsAddingRate] = useState(false);
  const [addRateError, setAddRateError] = useState<string | null>(null);

  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [editRateValue, setEditRateValue] = useState('');
  const [editRateError, setEditRateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FxRate | null>(null);

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (the Add rate opener, an edit row's Save, a deleted row).
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  const deleted = useRef(false);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });

  function focusEditButton(currency: string) {
    pendingFocus.current = () => listRef.current?.querySelector<HTMLElement>(`button[aria-label="Edit rate for ${currency}"]`)?.focus();
  }
  function focusAddRate() {
    // Add rate is hidden once every currency has a rate: the list instead.
    pendingFocus.current = () => (addButtonRef.current ?? listRef.current)?.focus();
  }

  useEffect(() => {
    if (!isAdmin) return;
    async function load() {
      try {
        setRates(await fetchFxRates());
      } catch (err) {
        setRatesError(err instanceof ApiError ? err.message : 'Could not load exchange rates.');
      } finally {
        setRatesLoading(false);
      }
    }
    load();
  }, [isAdmin]);

  // Currencies with no rate yet, excluding whatever the org's own
  // currency currently is: that one needs no rate (it's implicitly 1),
  // and the backend rejects trying to add one for it anyway.
  const availableCurrencies = CURRENCY_OPTIONS.filter(
    (c) => c.code !== savedCurrency && !rates.some((r) => r.currency === c.code)
  );

  async function handleSave(): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      await dispatch(updateOrganisation({ currency: selected })).unwrap();
      // Every existing rate is now stale ("X -> the *old* currency"):
      // the backend already cleared them (see OrganisationSettingsView),
      // this just keeps the list on screen from lying about it.
      setRates([]);
      return true;
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof ApiError ? err.message : 'Could not save.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  // Held in the page's save bar, not saved on change: saving a new currency
  // clears every exchange rate, so it must be a deliberate act.
  useSettingsDraft({
    dirty: isAdmin && isDirty,
    saving: isSaving,
    save: handleSave,
    discard: () => {
      setSelected(savedCurrency);
      setError(null);
    },
  });

  const cannotAddRate = !newRateCurrency || !newRateValue.trim() || isAddingRate;

  async function handleAddRate() {
    // aria-disabled keeps focus on the submit, so an incomplete or second press returns here.
    if (cannotAddRate) return;
    setAddRateError(null);
    setIsAddingRate(true);
    try {
      const created = await createFxRate({
        currency: newRateCurrency,
        rate_to_org_currency: newRateValue.trim(),
      });
      setRates((current) => [...current, created]);
      setNewRateCurrency('');
      setNewRateValue('');
      setShowAddRate(false);
      focusAddRate();
    } catch (err) {
      setAddRateError(err instanceof ApiError ? err.message : 'Could not add that rate.');
    } finally {
      setIsAddingRate(false);
    }
  }

  function startEditing(rate: FxRate) {
    setEditingRateId(rate.id);
    setEditRateValue(rate.rate_to_org_currency);
    setEditRateError(null);
  }

  async function handleSaveEdit(id: number, currency: string) {
    if (!editRateValue.trim()) return;
    setEditRateError(null);
    try {
      const updated = await updateFxRate(id, { rate_to_org_currency: editRateValue.trim() });
      setRates((current) => current.map((r) => (r.id === id ? updated : r)));
      setEditingRateId(null);
      focusEditButton(currency);
    } catch (err) {
      setEditRateError(err instanceof ApiError ? err.message : 'Could not save that rate.');
    }
  }

  function cancelAdd() {
    setShowAddRate(false);
    setAddRateError(null);
    focusAddRate();
  }

  function openAddRate() {
    pendingFocus.current = () => formRef.current?.querySelector<HTMLElement>('select')?.focus();
    setShowAddRate(true);
  }

  const rateCount = rates.length;
  return (
    <>
      <SettingsSection title="Currency" description="The billing currency this organisation operates in.">
        <SettingsRow label="Currency" htmlFor="currency-select" error={error ?? undefined} errorId="currency-error">
          <Select
            id="currency-select"
            label="Currency"
            labelPosition="external"
            value={selected}
            disabled={!isAdmin}
            invalid={Boolean(error)}
            describedBy={error ? 'currency-error' : undefined}
            onChange={(code) => {
              setSelected(code);
              setError(null);
            }}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c.code, label: `${c.code}: ${c.label} (${c.symbol})` }))}
            className="sm:max-w-xs"
          />
        </SettingsRow>
        <SettingsRow label="Preview">
          <p className={`${TYPE.body} ${NUM}`}>{formatMoney(12345, selected)}</p>
        </SettingsRow>
        {isDirty && rateCount > 0 ? (
          <div className="px-4 py-3">
            <SettingsNote icon="warning">
              Saving clears your {rateCount} exchange rate{rateCount === 1 ? '' : 's'}: they are no longer valid for a different base currency.
            </SettingsNote>
          </div>
        ) : null}
      </SettingsSection>

      {isAdmin ? (
        <SettingsSection
          title="Exchange rates"
          description={`A customer can bill in its own currency; these rates convert those amounts into ${savedCurrency} for the totals.`}
          action={
            availableCurrencies.length > 0 && !showAddRate ? (
              <button ref={addButtonRef} type="button" onClick={openAddRate} className={BUTTON}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add rate
              </button>
            ) : undefined
          }
          list="Exchange rates"
          listRef={listRef}
          state={
            ratesLoading ? (
              <LoadingState label="Loading exchange rates" count={2} />
            ) : ratesError ? (
              <ErrorState message={ratesError} />
            ) : rates.length === 0 && !showAddRate ? (
              <EmptyState size="inline" title={`No exchange rates yet: every customer is assumed to bill in ${savedCurrency}.`} />
            ) : undefined
          }
        >
          {showAddRate ? (
            <li className="px-4 py-3">
              <form
                ref={formRef}
                aria-label="New exchange rate"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleAddRate();
                }}
                className="flex flex-wrap items-end gap-3"
              >
                <Select
                  label="Currency"
                  value={newRateCurrency}
                  onChange={setNewRateCurrency}
                  options={[{ value: '', label: 'Choose…' }, ...availableCurrencies.map((c) => ({ value: c.code, label: c.code }))]}
                  className="w-32"
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-rate-value" className={TYPE.label}>
                    1 {newRateCurrency || 'unit'} in {savedCurrency}
                  </label>
                  <input
                    id="new-rate-value"
                    type="number"
                    step="any"
                    value={newRateValue}
                    onChange={(event) => setNewRateValue(event.target.value)}
                    aria-invalid={Boolean(addRateError)}
                    aria-describedby={addRateError ? 'new-rate-error' : undefined}
                    className={`${INPUT} ${INVALID} ${NUM} w-32`}
                  />
                </div>
                <button type="button" onClick={cancelAdd} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" aria-disabled={cannotAddRate || undefined} className={PRIMARY}>
                  {isAddingRate ? 'Adding…' : 'Add rate'}
                </button>
              </form>
              {addRateError ? (
                <p id="new-rate-error" role="alert" className={FIELD_ERROR}>
                  {addRateError}
                </p>
              ) : null}
            </li>
          ) : null}
          {rates.map((rate) => (
            <li key={rate.id} className="group relative flex min-h-14 flex-wrap items-center gap-3 px-4 py-3">
              {editingRateId === rate.id ? (
                <>
                  <label htmlFor={`rate-${rate.id}`} className={TYPE.body}>
                    1 {rate.currency} =
                  </label>
                  <input
                    id={`rate-${rate.id}`}
                    type="number"
                    step="any"
                    value={editRateValue}
                    onChange={(event) => setEditRateValue(event.target.value)}
                    autoFocus
                    aria-invalid={Boolean(editRateError)}
                    aria-describedby={editRateError ? `rate-${rate.id}-error` : undefined}
                    className={`${INPUT} ${INVALID} ${NUM} w-28`}
                  />
                  <span className={TYPE.bodyMuted}>{savedCurrency}</span>
                  <button type="button" onClick={() => void handleSaveEdit(rate.id, rate.currency)} aria-label="Save rate" className={ICON_BUTTON}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => {
                      setEditingRateId(null);
                      focusEditButton(rate.currency);
                    }}
                    aria-label="Cancel editing" className={ICON_BUTTON}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {editRateError ? (
                    <p id={`rate-${rate.id}-error`} role="alert" className={`w-full ${FIELD_ERROR}`}>
                      {editRateError}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className={`min-w-0 flex-1 ${TYPE.body}`}>
                    1 {rate.currency} = <span className={NUM}>{rate.rate_to_org_currency}</span> {savedCurrency}
                  </p>
                  <div className={ROW_ACTIONS}>
                    <button type="button" onClick={() => startEditing(rate)} aria-label={`Edit rate for ${rate.currency}`} className={ICON_BUTTON}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <OverflowMenu label={`More actions for ${rate.currency}`} items={[{ key: 'delete', label: 'Delete', onSelect: () => setDeleteTarget(rate), danger: true }]} />
                  </div>
                </>
              )}
            </li>
          ))}
        </SettingsSection>
      ) : null}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this exchange rate?"
          message={`Customers billing in ${deleteTarget.currency} are left out of MRR and ARR totals until a new rate is added.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteFxRate(deleteTarget.id);
            setRates((current) => current.filter((r) => r.id !== deleteTarget.id));
            deleted.current = true;
          }}
          onClose={() => {
            if (deleted.current) {
              deleted.current = false;
              // The row's menu is gone: the list takes focus, or Add rate when none are left
              // (the list stays while the add form is open, as Add rate is hidden then).
              pendingFocus.current = () => (listRef.current ?? addButtonRef.current)?.focus();
            }
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}
