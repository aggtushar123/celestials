import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { apiFetch, ApiError } from '../../lib/apiClient';
import {
  createContactForCustomer,
  createContactForAccount,
  updateContact,
} from '../../features/customers/customersSlice';
import type { Contact } from '../../features/customers/customersSlice';
import { companyLabel } from '../../features/customers/formatters';
import { CONTACT_ROLES } from '../../features/contacts/contactsParams';

// Contact.Role on the backend, shared with the Contacts page's role filter.
const ROLE_OPTIONS = CONTACT_ROLES;

interface ContactFormModalProps {
  /** Present for Edit, omitted for Add. */
  contact?: Contact;
  /** Add-only: the Company (Customer) to create the new contact under
   * — a fixed id when opened from a page that already has one (the
   * Organization Details page's own Contacts tab, or the standalone
   * Account page's — see `accountId` below), or picked from
   * `companies` on the Contacts page (/contacts), which has no
   * single Customer of its own. Ignored for Edit — a Contact can't be
   * moved between parents (see ContactDetailView's own docstring on
   * the backend), so Company is shown read-only there instead. */
  customerId?: number;
  /** Add-only: the account to create the contact on. With a fixed
   * `customerId` it saves through the nested route (the organisation
   * page's chosen account); alone it saves through
   * /accounts/<id>/contacts/ (the account page). Either way no Company
   * or Account picker shows. */
  accountId?: number;
  /** Add-only, and only when `customerId` isn't already fixed: every
   * company to choose from. */
  companies?: { id: number; name: string }[];
  onClose: () => void;
  /** Called after a successful save. A create doesn't know which slot
   * (the global list's `allContacts`, or a scoped page's `contacts`) to
   * land in, so the caller refetches its own list — see
   * createContactForCustomer's own docstring. An edit already patches
   * every Redux list a Contact could appear in (updateContact's own
   * extraReducers); a caller that shows server-derived reads of the
   * person (the Contacts page's profile, history and summary) re-reads
   * them here, and the others pass a no-op. */
  onSaved: () => void;
}

export function ContactFormModal({
  contact,
  customerId,
  accountId,
  companies,
  onClose,
  onSaved,
}: ContactFormModalProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!contact;

  const [name, setName] = useState(contact?.name ?? '');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    customerId ? String(customerId) : ''
  );
  const [role, setRole] = useState<Contact['role']>(contact?.role ?? 'other');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [status, setStatus] = useState<Contact['status']>(contact?.status ?? 'active');
  const [sentiment, setSentiment] = useState<Contact['sentiment']>(contact?.sentiment ?? 'neutral');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Account picker below — every account under whichever company
  // is currently in play (fixed via `customerId`, or picked from the
  // dropdown above), refetched whenever that changes. Skipped entirely
  // for Edit (Company/Account are both read-only there — see the JSX
  // below) and when `accountId` is already fixed (the standalone
  // Account page's own Add Contact — already inside one specific
  // account's context, no picker needed).
  const effectiveCompanyId = customerId ?? (selectedCompanyId ? Number(selectedCompanyId) : undefined);
  const [accountOptions, setAccountOptions] = useState<{ id: number; name: string }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  useEffect(() => {
    if (isEdit || accountId !== undefined || effectiveCompanyId === undefined) {
      setAccountOptions([]);
      return;
    }
    let cancelled = false;
    apiFetch<{ id: number; name: string }[]>(`/customers/${effectiveCompanyId}/accounts/`)
      .then((accounts) => {
        // Defensive: AccountListCreateView really does return a plain
        // array (pagination_class = None), but guard anyway rather
        // than crash the whole modal on anything unexpected.
        if (!cancelled) setAccountOptions(Array.isArray(accounts) ? accounts : []);
      })
      .catch(() => {
        // A failed accounts fetch just means the picker shows no
        // options beyond "Organization contact" — not worth blocking
        // the whole form over, same reasoning as AccountFormModal's
        // own owner-picker fetch.
        if (!cancelled) setAccountOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, accountId, effectiveCompanyId]);

  // The previously-picked account may not exist under a newly-picked
  // company (on the Contacts page (/contacts), where Company
  // itself is a dropdown) — reset rather than silently keep a stale id.
  useEffect(() => {
    setSelectedAccountId('');
  }, [effectiveCompanyId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && accountId === undefined && !selectedCompanyId) {
      setError('Pick a company.');
      return;
    }

    setIsSaving(true);
    const data = {
      name: name.trim(),
      role,
      email: email.trim(),
      phone: phone.trim(),
      status,
    };
    // The backend treats a sent sentiment as a hand-set one and drops the
    // evidence behind a computed one, so an edit sends it only when it was
    // changed (a name change must not wipe what their calls said). A new
    // person has no evidence yet: the chosen sentiment is their start.
    const sentimentChanged = !isEdit || sentiment !== contact.sentiment;
    const payload = sentimentChanged ? { ...data, sentiment } : data;
    try {
      if (isEdit) {
        // updateContact's own extraReducers patch every list this Contact
        // could be showing in; onSaved lets a page read what the edit
        // changed on the server (the Contacts page's profile and summary).
        await dispatch(updateContact({ id: contact.id, ...payload })).unwrap();
        onSaved();
      } else if (accountId !== undefined) {
        // The account page (no organisation id: the flat route) or the
        // organisation page's chosen account (the nested one) — either
        // way the only account it could be.
        await dispatch(createContactForAccount({ customerId, accountId, ...payload })).unwrap();
        onSaved();
      } else if (selectedAccountId) {
        // The caller left Account on "Organization contact" or picked
        // one from the dropdown above — a specific account was chosen.
        await dispatch(
          createContactForAccount({
            customerId: Number(selectedCompanyId),
            accountId: Number(selectedAccountId),
            ...payload,
          })
        ).unwrap();
        onSaved();
      } else {
        await dispatch(
          createContactForCustomer({ customerId: Number(selectedCompanyId), ...payload })
        ).unwrap();
        onSaved();
      }
      onClose();
    } catch (err) {
      setError(
        typeof err === 'string'
          ? err
          : err instanceof ApiError
            ? err.message
            : `Could not ${isEdit ? 'save changes to' : 'add'} the contact.`
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
            {isEdit ? `Edit ${contact.name}` : 'Add Contact'}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField label="Name" value={name} onChange={setName} required autoFocus />

          {isEdit ? (
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1">Company</label>
              <p className="text-[13px] text-ink-faint px-3 py-2 bg-subtle/50 border border-line-subtle rounded-lg">
                {companyLabel(contact.companies)}
                {contact.account_name ? ` • ${contact.account_name}` : ''}
              </p>
            </div>
          ) : customerId === undefined && accountId === undefined ? (
            <SelectField label="Company" value={selectedCompanyId} onChange={setSelectedCompanyId} required>
              <option value="">Select a company…</option>
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          ) : null}

          {/* A Contact can be organisation-level or belong to one
              specific Account (see the Contact model's own docstring
              on the backend) — hidden for Edit (can't move between
              parents) and when `accountId` is already fixed (the
              standalone Account page's own Add Contact — already
              inside one specific account, nothing to pick). */}
          {!isEdit && accountId === undefined && effectiveCompanyId !== undefined && (
            <SelectField label="Account (optional)" value={selectedAccountId} onChange={setSelectedAccountId}>
              <option value="">Organization contact (no specific account)</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Role" value={role} onChange={(v) => setRole(v as Contact['role'])}>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Status" value={status} onChange={(v) => setStatus(v as Contact['status'])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="Email" value={email} onChange={setEmail} type="email" required />
            <TextField label="Phone" value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" />
          </div>

          <SelectField
            label={contact?.sentiment_source === 'computed' ? 'Sentiment (read from their calls, emails and tickets — a hand-set value is replaced once new evidence arrives)' : 'Sentiment (used until their calls, emails and tickets are analysed)'}
            value={sentiment}
            onChange={(v) => setSentiment(v as Contact['sentiment'])}
          >
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </SelectField>

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
              disabled={isSaving || !name.trim() || !email.trim()}
              className="px-3.5 py-2 bg-accent text-on-accent rounded-lg text-[12px] font-bold hover:bg-accent-hover transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Same field components as AccountFormModal.tsx (organizations/), kept
// local here rather than shared since neither is exported from there.
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
