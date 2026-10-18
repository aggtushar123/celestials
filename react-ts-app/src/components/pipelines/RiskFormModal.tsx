import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { FUNCTION_LABELS, type UserFunction } from '../../features/auth/authSlice';
import { apiFetch, ApiError } from '../../lib/apiClient';
import {
  createRisk,
  createRiskForCustomer,
  createRiskForAccount,
  updateRisk,
} from '../../features/customers/customersSlice';
import type { Risk } from '../../features/customers/customersSlice';
import { companyLabel } from '../../features/customers/formatters';
import { RISK_STAGES } from '../../features/pipelines/pipelineKinds';

interface RiskFormModalProps {
  /** Present for Edit, omitted for Add. */
  risk?: Risk;
  /** Add-only default stage — the column "+" the user clicked, or the
   * first column when opened from the board's own "Add Risk" button.
   * Ignored for Edit. */
  defaultStage?: Risk['stage'];
  /** Every company to choose from — only used when `customerId` isn't
   * already fixed below, same reasoning as OpportunityFormModal's own
   * `companies` prop. */
  companies?: { id: number; name: string }[];
  /** Add-only: a fixed Customer to create the new risk under — set when
   * opened from the Organization/Account Details page's own Deals & risks
   * tab (see DealsTab.tsx), skipping the Company picker entirely,
   * same as OpportunityFormModal's own `customerId` prop. Ignored for
   * Edit. */
  customerId?: number;
  /** Add-only: set together with a fixed `customerId` when opened from
   * the standalone Account page's own Deals & risks tab — creates an
   * account-level Risk instead of an organisation-level one, and hides
   * the Account picker below (already inside one specific account's
   * own context). */
  accountId?: number;
  /** Add-only: replaces the Company select with the caller's own "where it
   * belongs" field (the Pipelines portfolio's — List and Board's —
   * server-searched picker), which sets `customerId` or `accountId`
   * above as the viewer picks. */
  parentField?: ReactNode;
  onClose: () => void;
  /** Edit-only: shows a "Delete" button that hands off to the caller,
   * same separation as OpportunityFormModal's own. */
  onDeleteRequest?: () => void;
  /** Called after every successful save (an add or an edit), so the caller
   * can read its own list again: the Deals & risks tab after a scoped add,
   * the Pipelines portfolio (List and Board) after any add or edit (plan
   * 2026-10-01 Decision 8). */
  onSaved?: () => void;
}

const DEPARTMENT_OPTIONS: { value: UserFunction | ''; label: string }[] = [
  ...(Object.entries(FUNCTION_LABELS) as [UserFunction, string][]).map(([value, label]) => ({ value, label })),
  { value: '', label: 'Whole company' },
];

export function RiskFormModal({
  risk,
  defaultStage,
  companies,
  customerId,
  accountId,
  parentField,
  onClose,
  onDeleteRequest,
  onSaved,
}: RiskFormModalProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!risk;

  const [title, setTitle] = useState(risk?.title ?? '');
  const [mrr, setMrr] = useState(risk?.mrr ?? '');
  const [stage, setStage] = useState<Risk['stage']>(risk?.stage ?? defaultStage ?? 'open');
  const [priority, setPriority] = useState<Risk['priority']>(risk?.priority ?? 'medium');
  const [dueBy, setDueBy] = useState(risk?.due_by ?? '');
  const myFunction = useAppSelector((s) => s.auth.user?.function ?? '');
  const [department, setDepartment] = useState<UserFunction | ''>(risk?.department ?? myFunction);
  const [selectedCompanyId, setSelectedCompanyId] = useState(customerId ? String(customerId) : '');

  // Same self-fetching Account picker as OpportunityFormModal — every
  // account under whichever company is currently in play (fixed via
  // `customerId`, or picked from the dropdown below), so a new Risk
  // can be organisation-level (left on "Organization") or tied to one
  // specific Account, same two-tier model.
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
        if (!cancelled) setAccountOptions(Array.isArray(accounts) ? accounts : []);
      })
      .catch(() => {
        if (!cancelled) setAccountOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, accountId, effectiveCompanyId]);

  useEffect(() => {
    setSelectedAccountId('');
  }, [effectiveCompanyId]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && customerId === undefined && accountId === undefined && !selectedCompanyId) {
      setError(parentField ? 'Pick where it belongs.' : 'Pick a company.');
      return;
    }

    setIsSaving(true);
    const data = { title: title.trim(), mrr: mrr.trim() || '0', stage, priority, department, due_by: dueBy || null };
    try {
      if (isEdit) {
        // updateRisk's own extraReducers patch every list this Risk could be
        // showing in; onSaved() below reloads a page's own book.
        await dispatch(updateRisk({ id: risk.id, ...data })).unwrap();
      } else if (customerId !== undefined) {
        // Scoped to a fixed Customer/Account (the Details page's own
        // Deals & risks tab) — createRiskForCustomer/createRiskForAccount
        // don't patch Redux themselves, so the caller refetches via
        // onSaved() below.
        if (accountId !== undefined) {
          await dispatch(createRiskForAccount({ customerId, accountId, ...data })).unwrap();
        } else if (selectedAccountId) {
          await dispatch(
            createRiskForAccount({ customerId, accountId: Number(selectedAccountId), ...data })
          ).unwrap();
        } else {
          await dispatch(createRiskForCustomer({ customerId, ...data })).unwrap();
        }
      } else if (customerId === undefined && accountId !== undefined) {
        // The account page: no organisation id, the flat account route.
        await dispatch(createRiskForAccount({ accountId, ...data })).unwrap();
      } else if (selectedAccountId) {
        // The standalone board's own Add — createRisk's own
        // extraReducers already unshift straight into `risks`, no
        // refetch needed.
        await dispatch(createRisk({ accountId: Number(selectedAccountId), ...data })).unwrap();
      } else {
        await dispatch(createRisk({ customerId: Number(selectedCompanyId), ...data })).unwrap();
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(
        typeof err === 'string'
          ? err
          : err instanceof ApiError
            ? err.message
            : `Could not ${isEdit ? 'save changes to' : 'add'} the risk.`
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
          <h2 className="text-[15px] font-bold text-ink">{isEdit ? `Edit ${risk.title}` : 'Add Risk'}</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField label="Title" value={title} onChange={setTitle} required autoFocus />

          {isEdit ? (
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1">Company</label>
              <p className="text-[13px] text-ink-faint px-3 py-2 bg-subtle/50 border border-line-subtle rounded-lg">
                {companyLabel(risk.companies)}
                {risk.account_name ? ` • ${risk.account_name}` : ''}
              </p>
            </div>
          ) : parentField ? (
            parentField
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

          {/* A Risk can be organisation-level or belong to one
              specific Account — hidden for Edit (can't move between
              parents) and when `accountId` is already fixed (the
              standalone Account page's own Deals & risks tab — already
              inside one specific account, nothing to pick). */}
          {!isEdit && accountId === undefined && effectiveCompanyId !== undefined && (
            <SelectField label="Account (optional)" value={selectedAccountId} onChange={setSelectedAccountId}>
              <option value="">Organization risk (no specific account)</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <TextField label="MRR" value={mrr} onChange={setMrr} placeholder="0.00" />
            <SelectField label="Priority" value={priority} onChange={(v) => setPriority(v as Risk['priority'])}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </SelectField>
          </div>

          <SelectField label="Department" value={department} onChange={(v) => setDepartment(v as UserFunction | '')}>
            {DEPARTMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectField>

          <SelectField label="Stage" value={stage} onChange={(v) => setStage(v as Risk['stage'])}>
            {RISK_STAGES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectField>

          <DateField label="Due by" value={dueBy} onChange={setDueBy} />

          {error && (
            <div className="flex items-center gap-2 text-[12px] text-danger">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {isEdit && onDeleteRequest ? (
              <button
                type="button"
                onClick={onDeleteRequest}
                className="px-3.5 py-2 text-[12px] font-semibold text-danger hover:bg-danger-dim rounded-lg transition-all"
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-[12px] font-semibold text-ink-muted hover:bg-subtle rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !title.trim()}
                className="px-3.5 py-2 bg-accent text-on-accent rounded-lg text-[12px] font-bold hover:bg-accent-hover transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add Risk'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Same field components as OpportunityFormModal.tsx, kept local here
// rather than shared since neither is exported from there.
function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        type="text"
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

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-semibold text-ink-muted mb-1">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
      />
    </div>
  );
}
