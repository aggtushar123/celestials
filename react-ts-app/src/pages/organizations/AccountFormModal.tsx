import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { createAccount, updateAccount } from '../../features/customers/customersSlice';
import type { Account } from '../../features/customers/customersSlice';
import { companyLabel } from '../../features/customers/formatters';
import type { User } from '../../features/auth/authSlice';

interface AccountFormModalProps {
  /** The organization this account belongs to — fixed when opened from
   * the Organization Details page's own Accounts tab (already inside
   * one specific organisation's context), addressing the nested
   * /customers/<id>/accounts/ URL directly. Omitted on the standalone
   * Accounts page, which shows a Company picker instead (built from
   * `companies`) — same `customerId?`/`companies?` duality as
   * ContactFormModal. Never sent as part of the write payload itself;
   * the backend takes it from the URL, same as Customer takes
   * `organisation` from the caller rather than the request body. */
  customerId?: number;
  /** Present for Edit, omitted for Add. */
  account?: Account;
  /** Add-only, and only when `customerId` isn't already fixed: every
   * company to choose from. */
  companies?: { id: number; name: string }[];
  /** Add-only default lifecycle stage — the standalone Accounts
   * board's own column "+" the user clicked (see pages/accounts/
   * Board.tsx), same convention as OpportunityFormModal/RiskFormModal/
   * OrganizationFormModal's own `defaultStage`/`defaultLifecycleStage`.
   * Unlike OrganizationFormModal's own dropdown, 'churn' is a valid
   * value here too — Account has no dedicated churn-with-reason modal
   * of its own (see AccountWritePayload's own docstring), so churning
   * one is just this same plain lifecycle edit. */
  defaultLifecycleStage?: Account['lifecycle_stage'];
  onClose: () => void;
  /** Called after a successful *create* only — createAccount doesn't
   * know which list (the Accounts tab's own `accountsForCustomer`, or
   * the standalone Accounts page's own `allAccounts`) to land in, so
   * the caller refetches its own list instead, same "caller refetches"
   * reasoning as ContactFormModal's own `onSaved`. Edit never calls
   * this — updateAccount's own extraReducers already patch both lists
   * directly. */
  onSaved?: () => void;
}

// Same product decision as OrganizationFormModal: only what's editable
// while an account is being onboarded — identity, ownership, lifecycle
// stage, and renewal date. Health, pulse, AI pulse, NPS/CSAT, and ARR
// are meant to eventually sync from other systems, not be hand-typed
// here — see AccountWritePayload's own docstring.
const LIFECYCLE_OPTIONS: { value: Account['lifecycle_stage']; label: string }[] = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'kickoff', label: 'Kickoff' },
  { value: 'adoption', label: 'Adoption' },
  { value: 'live', label: 'Live' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'churn', label: 'Churn' },
  { value: 'other', label: 'Other' },
];

export function AccountFormModal({
  customerId,
  account,
  companies,
  defaultLifecycleStage,
  onClose,
  onSaved,
}: AccountFormModalProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!account;

  const [selectedCompanyId, setSelectedCompanyId] = useState(customerId ? String(customerId) : '');
  const [name, setName] = useState(account?.name ?? '');
  const [domain, setDomain] = useState(account?.domain ?? '');
  const [industry, setIndustry] = useState(account?.industry ?? '');
  const [ownerId, setOwnerId] = useState<string>(account?.owner ? String(account.owner.id) : '');
  const [lifecycleStage, setLifecycleStage] = useState<Account['lifecycle_stage']>(
    account?.lifecycle_stage ?? defaultLifecycleStage ?? 'onboarding'
  );
  const [renewalDate, setRenewalDate] = useState(account?.renewal_date ?? '');

  const [members, setMembers] = useState<User[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Same owner-picker source as OrganizationFormModal — any org member
    // is a valid account owner, matching the backend's own validation.
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

    if (!isEdit && customerId === undefined && !selectedCompanyId) {
      setError('Pick a company.');
      return;
    }

    setIsSaving(true);
    const data = {
      name: name.trim(),
      domain: domain.trim(),
      industry: industry.trim(),
      owner_id: ownerId ? Number(ownerId) : null,
      lifecycle_stage: lifecycleStage,
      renewal_date: renewalDate || null,
    };
    try {
      if (isEdit) {
        // No onSaved() — updateAccount's own extraReducers already
        // patch every list this Account could be showing in. The
        // nested update URL just needs *a* Customer this Account is
        // linked to (AccountDetailView's own get_queryset accepts any
        // one of them) — `customerId` when this modal already knows
        // it (opened from the Organization Details page's own Accounts
        // tab), else the account's own first linked Customer (opened
        // from the standalone Accounts page, which doesn't fix one).
        await dispatch(
          updateAccount({
            // No openable organisation: the flat /accounts/<id>/ (backend #75).
            customerId: customerId ?? account.customers[0]?.id,
            id: account.id,
            ...data,
          })
        ).unwrap();
      } else {
        const effectiveCustomerId = customerId ?? Number(selectedCompanyId);
        await dispatch(createAccount({ customerId: effectiveCustomerId, ...data })).unwrap();
        onSaved?.();
      }
      onClose();
    } catch (err) {
      setError(
        typeof err === 'string'
          ? err
          : err instanceof ApiError
            ? err.message
            : `Could not ${isEdit ? 'save changes to' : 'add'} the account.`
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
            {isEdit ? `Edit ${account.name}` : 'Add Account'}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isEdit ? (
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1">Organization</label>
              <p className="text-[13px] text-ink-faint px-3 py-2 bg-subtle/50 border border-line-subtle rounded-lg">
                {companyLabel(account.customers)}
              </p>
            </div>
          ) : customerId === undefined ? (
            <SelectField label="Organization" value={selectedCompanyId} onChange={setSelectedCompanyId} required>
              <option value="">Select an organization…</option>
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          ) : null}

          <TextField label="Name" value={name} onChange={setName} required autoFocus />
          <TextField label="Domain" value={domain} onChange={setDomain} placeholder="na.acme.com" />
          <TextField
            label="Industry"
            value={industry}
            onChange={setIndustry}
            placeholder="Leave blank to use the parent organization's"
          />
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
              onChange={(v) => setLifecycleStage(v as Account['lifecycle_stage'])}
            >
              {LIFECYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          </div>
          <TextField label="Renewal Date" value={renewalDate} onChange={setRenewalDate} type="date" />

          <p className="text-[11px] text-ink-faint">
            Health, pulse, AI pulse, NPS/CSAT, and ARR aren't set here — those are meant to sync in from
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
              {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create Account'}
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
  required,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-semibold text-ink-muted mb-1">
        {label}
        {required && <span className="text-danger"> *</span>}
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
