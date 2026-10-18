import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAppDispatch, useOrgCurrency } from '../../hooks';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { createCustomer, updateCustomer } from '../../features/customers/customersSlice';
import { CURRENCY_OPTIONS } from '../../features/customers/formatters';
import type { Customer } from '../../features/customers/customersSlice';
import type { User, CurrencyCode } from '../../features/auth/authSlice';

interface OrganizationFormModalProps {
  /** Present for Edit, omitted for Add. */
  customer?: Customer;
  /** Add-only default lifecycle stage — the Organizations board's own
   * column "+" the user clicked (see pages/organizations/Board.tsx),
   * same convention as OpportunityFormModal/RiskFormModal's own
   * `defaultStage`. Never 'churn' — see LIFECYCLE_OPTIONS' own
   * docstring on why that isn't a selectable option here. */
  defaultLifecycleStage?: Customer['lifecycle_stage'];
  onClose: () => void;
  /** Called after a successful save, before `onClose`, so a caller can
   *  reload only when something changed (a cancel calls `onClose` alone). */
  onSaved?: () => void;
}

// Deliberately not the full ~30-field schema: only what's editable while
// an organisation is being onboarded and as the relationship evolves —
// identity, ownership, lifecycle stage, currency, and contract dates.
// Financials, product usage, and NPS/CSAT/health are meant to eventually
// sync from other systems (billing, usage tracking, surveys), not be
// hand-typed here — currency is the exception among "money-adjacent"
// fields: it's the denomination those financials sync in as, not a
// financial figure itself, so it's set the same real, hand-set way as
// lifecycle stage (see Customer.currency's own backend docstring).
// Churn has its own dedicated action/modal (captures churn_date/
// reason/comment together) — "Churn" is deliberately not a selectable
// option in this form's own lifecycle dropdown.
const LIFECYCLE_OPTIONS: { value: Customer['lifecycle_stage']; label: string }[] = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'kickoff', label: 'Kickoff' },
  { value: 'adoption', label: 'Adoption' },
  { value: 'live', label: 'Live' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'other', label: 'Other' },
];

export function OrganizationFormModal({ customer, defaultLifecycleStage, onClose, onSaved }: OrganizationFormModalProps) {
  const dispatch = useAppDispatch();
  const orgCurrency = useOrgCurrency();
  const isEdit = !!customer;

  const [name, setName] = useState(customer?.name ?? '');
  const [domain, setDomain] = useState(customer?.domain ?? '');
  const [industry, setIndustry] = useState(customer?.industry ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [ownerId, setOwnerId] = useState<string>(customer?.owner ? String(customer.owner.id) : '');
  const [lifecycleStage, setLifecycleStage] = useState<Customer['lifecycle_stage']>(
    customer?.lifecycle_stage ?? defaultLifecycleStage ?? 'onboarding'
  );
  // A new organization defaults to the org's own currency (same as the
  // backend's own CustomerSerializer.create() default) — editable here
  // for the US-HQ-org-billing-one-customer-in-EUR case (see
  // Customer.currency's own docstring).
  const [currency, setCurrency] = useState<CurrencyCode>(customer?.currency ?? orgCurrency);
  const [joinedDate, setJoinedDate] = useState(customer?.joined_date ?? '');
  const [renewalDate, setRenewalDate] = useState(customer?.renewal_date ?? '');
  const [contractStartDate, setContractStartDate] = useState(customer?.contract_start_date ?? '');
  const [contractEndDate, setContractEndDate] = useState(customer?.contract_end_date ?? '');

  const [members, setMembers] = useState<User[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Non-admin-gated (unlike /auth/csms/) — any org member, including
    // admins, is a valid owner, matching the backend's own validation.
    apiFetch<User[]>('/auth/members/')
      .then(setMembers)
      .catch(() => {
        // A failed member list just means the owner dropdown falls back
        // to "Unassigned" only — not worth blocking the whole form over.
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const data = {
      name: name.trim(),
      domain: domain.trim(),
      industry: industry.trim(),
      address: address.trim(),
      owner_id: ownerId ? Number(ownerId) : null,
      lifecycle_stage: lifecycleStage,
      currency,
      joined_date: joinedDate || null,
      renewal_date: renewalDate || null,
      contract_start_date: contractStartDate || null,
      contract_end_date: contractEndDate || null,
    };
    try {
      if (isEdit) {
        await dispatch(updateCustomer({ id: customer.id, ...data })).unwrap();
      } else {
        await dispatch(createCustomer(data)).unwrap();
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(
        typeof err === 'string'
          ? err
          : err instanceof ApiError
            ? err.message
            : `Could not ${isEdit ? 'save changes to' : 'add'} the organization.`
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div
        className="bg-surface border border-line rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">
            {isEdit ? `Edit ${customer.name}` : 'Add Organization'}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField label="Name" value={name} onChange={setName} required autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Domain" value={domain} onChange={setDomain} placeholder="acme.com" />
            <TextField label="Name / Address" value={address} onChange={setAddress} placeholder="City, ST" />
          </div>
          <div>
            <TextField
              label="Industry"
              value={industry}
              onChange={setIndustry}
              placeholder="e.g. Video conferencing software"
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Helps Copilot recognize this account when a question describes it without naming it.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Owner" value={ownerId} onChange={setOwnerId}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Lifecycle Stage"
              value={lifecycleStage}
              onChange={(v) => setLifecycleStage(v as Customer['lifecycle_stage'])}
            >
              {LIFECYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField
            label="Currency"
            value={currency}
            onChange={(v) => setCurrency(v as CurrencyCode)}
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code} — {opt.label} ({opt.symbol})
              </option>
            ))}
          </SelectField>
          <TextField label="Joined Date" value={joinedDate} onChange={setJoinedDate} type="date" />
          <div className="grid grid-cols-3 gap-3">
            <TextField label="Renewal Date" value={renewalDate} onChange={setRenewalDate} type="date" />
            <TextField
              label="Contract Start"
              value={contractStartDate}
              onChange={setContractStartDate}
              type="date"
            />
            <TextField label="Contract End" value={contractEndDate} onChange={setContractEndDate} type="date" />
          </div>

          <p className="text-[11px] text-ink-faint">
            Health, ARR/financials, NPS/CSAT, and seat usage aren't set here — those are meant to sync in from
            billing/usage/survey data once that's built.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-[12px] text-danger">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-[12px] font-semibold text-ink-muted hover:bg-subtle rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-3.5 py-2 bg-accent text-on-accent rounded-lg text-[12px] font-bold hover:bg-accent-hover transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-semibold text-ink-muted mb-1">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-semibold text-ink-muted mb-1">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
      >
        {children}
      </select>
    </div>
  );
}
