import { useId, useState, type FormEvent } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import { updateCustomer, CHURN_REASONS } from '../../features/customers/customersSlice';
import type { ChurnReason } from '../../features/customers/customersSlice';

interface ChurnOrganizationModalProps {
  /** One id for a single row's "..." menu; several for a bulk churn from
   * the checkbox-selection + ActionBar's settings gear. Every selected
   * organization gets the same date/reason/comment. */
  customerIds: number[];
  customerNames: string[];
  onClose: () => void;
  /** Called once the churn has saved, before `onClose`. Cancelling or
   * dismissing never calls it. */
  onChurned?: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sets lifecycle_stage='churn' plus the churn_date/reason/comment fields
 * together — a deliberately separate action from the general Edit form,
 * since "Churn" isn't one of that form's own lifecycle dropdown options. */
export function ChurnOrganizationModal({ customerIds, customerNames, onClose, onChurned }: ChurnOrganizationModalProps) {
  const dispatch = useAppDispatch();
  const [churnDate, setChurnDate] = useState(today());
  const [churnReason, setChurnReason] = useState<ChurnReason | ''>('');
  const [churnComment, setChurnComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonId = useId();
  const dateId = useId();
  const commentId = useId();

  const title = customerIds.length === 1 ? `Churn ${customerNames[0]}?` : `Churn ${customerIds.length} organizations?`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await Promise.all(
        customerIds.map((id) =>
          dispatch(
            updateCustomer({
              id,
              lifecycle_stage: 'churn',
              churn_date: churnDate || null,
              churn_reason: churnReason,
              churn_comment: churnComment.trim(),
            })
          ).unwrap()
        )
      );
      onChurned?.();
      onClose();
    } catch (err) {
      const noun = customerIds.length === 1 ? 'this organization' : 'these organizations';
      setError(typeof err === 'string' ? err : err instanceof ApiError ? err.message : `Could not churn ${noun}.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div
        className="bg-surface border border-line rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[12px] text-ink-muted">
          Marks this organization as churned. It stays visible in the list — this isn't the same as archiving.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={dateId} className="block text-[12px] font-semibold text-ink-muted mb-1">
              Churn Date
            </label>
            <input
              id={dateId}
              type="date"
              value={churnDate}
              onChange={(e) => setChurnDate(e.target.value)}
              className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-danger/10 focus:border-danger transition-all"
            />
          </div>
          <div>
            <label htmlFor={reasonId} className="block text-[12px] font-semibold text-ink-muted mb-1">
              Reason
            </label>
            {/* A list, not a text box. It used to be free text, and the
                Customer Overview's "why they left" chart spent its life
                apologising for it: "Budget cuts" and "Budget Cut" were two
                rows, and no amount of folding could merge them. Anything
                worth writing down beyond the reason goes in the comment
                below — which is what it was always for. */}
            <select
              id={reasonId}
              value={churnReason}
              onChange={(e) => setChurnReason(e.target.value as ChurnReason | '')}
              autoFocus
              className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-danger/10 focus:border-danger transition-all"
            >
              <option value="">Not recorded</option>
              {CHURN_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={commentId} className="block text-[12px] font-semibold text-ink-muted mb-1">
              Comment (optional)
            </label>
            <textarea
              id={commentId}
              value={churnComment}
              onChange={(e) => setChurnComment(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-danger/10 focus:border-danger transition-all resize-none"
            />
          </div>

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
              disabled={isSaving}
              className="px-3.5 py-2 bg-danger text-white rounded-lg text-[12px] font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Churning…' : 'Confirm Churn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
