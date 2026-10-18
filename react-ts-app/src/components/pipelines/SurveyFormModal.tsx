import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { createSurvey, updateSurvey } from '../../features/customers/customersSlice';
import type { Survey } from '../../features/customers/customersSlice';
import { companyLabel } from '../../features/customers/formatters';

const TYPE_LABELS: Record<Survey['survey_type'], string> = { nps: 'NPS', csat: 'CSAT', ces: 'CES' };

// "Log Survey" from the standalone Surveys page — creates when no
// `survey` is given, edits in place otherwise (a Survey's parent isn't
// reassignable, so Edit hides the company/account picker entirely and
// just corrects type/sent date, plus its score once responded).
// Company/optional-Account picker duality for Add mirrors
// OpportunityFormModal.tsx's own standalone-Add mode exactly; the
// isEdit/onDeleteRequest shape mirrors that same modal's own Edit mode.
interface SurveyFormModalProps {
  /** Present for Edit, omitted for Add. */
  survey?: Survey;
  /** Every company to choose from — this modal has no fixed parent the
   * way SurveysTab.tsx's own embedded "Log Survey" does. Add-only. */
  companies?: { id: number; name: string }[];
  onClose: () => void;
  /** Edit-only: shows a "Delete" button that hands off to the caller
   * (SurveysPage.tsx opens its own ConfirmDialog for it) rather than
   * this modal deleting directly — same separation as
   * OpportunityFormModal.tsx's own. */
  onDeleteRequest?: () => void;
  /** Called after a successful create — createSurvey's own
   * extraReducers already unshift into `surveys` directly, so this is
   * just for the caller to close/reset anything of its own; SurveysPage
   * doesn't need it today but it matches the "onSaved after create"
   * convention other form modals use. */
  onSaved?: () => void;
}

export function SurveyFormModal({ survey, companies, onClose, onDeleteRequest, onSaved }: SurveyFormModalProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!survey;
  const showsScore = isEdit && survey.status === 'responded';

  const [surveyType, setSurveyType] = useState<Survey['survey_type']>(survey?.survey_type ?? 'nps');
  const [sentAt, setSentAt] = useState(() => survey?.sent_at ?? new Date().toISOString().slice(0, 10));
  const [score, setScore] = useState(survey?.score != null ? String(survey.score) : '');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const [accountOptions, setAccountOptions] = useState<{ id: number; name: string }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  useEffect(() => {
    if (isEdit || !selectedCompanyId) {
      setAccountOptions([]);
      return;
    }
    let cancelled = false;
    apiFetch<{ id: number; name: string }[]>(`/customers/${selectedCompanyId}/accounts/`)
      .then((accounts) => {
        if (!cancelled) setAccountOptions(Array.isArray(accounts) ? accounts : []);
      })
      .catch(() => {
        if (!cancelled) setAccountOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, selectedCompanyId]);

  useEffect(() => {
    setSelectedAccountId('');
  }, [selectedCompanyId]);

  // CES has nowhere to sync a response on an Account (see Survey
  // model's own backend docstring) — the backend rejects it outright,
  // so this just doesn't offer the combination in the first place.
  // Edit mode never shows this picker at all, so it can't apply there.
  useEffect(() => {
    if (!isEdit && selectedAccountId && surveyType === 'ces') setSurveyType('nps');
  }, [isEdit, selectedAccountId, surveyType]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && !selectedCompanyId) {
      setError('Pick a company.');
      return;
    }

    setIsSaving(true);
    try {
      if (isEdit) {
        // No onSaved() — updateSurvey's own extraReducers already patch
        // both `surveys` and `entitySurveys`, same as updateOpportunity.
        await dispatch(
          updateSurvey({
            id: survey.id,
            survey_type: surveyType,
            sent_at: sentAt,
            ...(showsScore && { score: Number(score) }),
          })
        ).unwrap();
      } else if (selectedAccountId) {
        await dispatch(
          createSurvey({ accountId: Number(selectedAccountId), survey_type: surveyType, sent_at: sentAt })
        ).unwrap();
      } else {
        await dispatch(
          createSurvey({ customerId: Number(selectedCompanyId), survey_type: surveyType, sent_at: sentAt })
        ).unwrap();
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(
        typeof err === 'string'
          ? err
          : err instanceof ApiError
            ? err.message
            : `Could not ${isEdit ? 'save changes to' : 'log'} that survey.`
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
            {isEdit ? `Edit ${TYPE_LABELS[surveyType]} Survey` : 'Log Survey'}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isEdit ? (
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1">Company</label>
              <p className="text-[13px] text-ink-faint px-3 py-2 bg-subtle/50 border border-line-subtle rounded-lg">
                {companyLabel(survey.companies)}
                {survey.account_name ? ` • ${survey.account_name}` : ''}
              </p>
            </div>
          ) : (
            <>
              <SelectField label="Company" value={selectedCompanyId} onChange={setSelectedCompanyId} required>
                <option value="">Select a company…</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>

              {selectedCompanyId && (
                <SelectField label="Account (optional)" value={selectedAccountId} onChange={setSelectedAccountId}>
                  <option value="">Organization survey (no specific account)</option>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectField>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Type"
              value={surveyType}
              onChange={(v) => setSurveyType(v as Survey['survey_type'])}
            >
              <option value="nps">NPS</option>
              <option value="csat">CSAT</option>
              {/* CES is Customer-only — see the effect above. Edit mode
                  already has a fixed account (or none) baked into the
                  existing Survey, so this just always offers it there;
                  the backend still rejects CES for an account-level
                  Survey if one somehow reaches it this way. */}
              {(isEdit || !selectedAccountId) && <option value="ces">CES</option>}
            </SelectField>
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1">Sent</label>
              <input
                type="date"
                value={sentAt}
                onChange={(e) => setSentAt(e.target.value)}
                className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
              />
            </div>
          </div>

          {showsScore && (
            <div>
              <label className="block text-[12px] font-semibold text-ink-muted mb-1">Score</label>
              <input
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
              />
            </div>
          )}

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
                disabled={isSaving || (!isEdit && !selectedCompanyId)}
                className="px-3.5 py-2 bg-accent text-on-accent rounded-lg text-[12px] font-bold hover:bg-accent-hover transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (isEdit ? 'Saving…' : 'Logging…') : isEdit ? 'Save changes' : 'Log Survey'}
              </button>
            </div>
          </div>
        </form>
      </div>
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
