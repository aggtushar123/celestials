import { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/apiClient';

interface Member {
  id: number;
  name: string;
  email: string;
}

interface HandoffModalProps {
  onHandOff: (toUserId: number, toUserName: string, note: string) => void;
  onClose: () => void;
}

// Real recipient list — the same `GET /auth/members/` call already used
// by OrganizationFormModal.tsx's own owner picker, not a new endpoint.
// Same modal shape as ConfirmDialog.tsx's own, with a member select +
// note in place of a single yes/no.
export function HandoffModal({ onHandOff, onClose }: HandoffModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Member[]>('/auth/members/')
      .then(setMembers)
      .catch(() => setError('Could not load your team — try again.'));
  }, []);

  function handSubmit() {
    const member = members.find((m) => m.id === selectedId);
    if (!member) {
      setError('Pick who this goes to.');
      return;
    }
    onHandOff(member.id, member.name, note.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div
        className="bg-surface border border-line rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">Hand off this session</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-muted mb-1" htmlFor="handoff-member">
            Hand off to
          </label>
          <select
            id="handoff-member"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
          >
            <option value="">Select a teammate…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-muted mb-1" htmlFor="handoff-note">
            Next action
          </label>
          <textarea
            id="handoff-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Own the recovery call. Loop in the AE if pricing comes up."
            className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all resize-none"
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
            type="button"
            onClick={handSubmit}
            className="px-3.5 py-2 rounded-lg text-[12px] font-bold transition-all shadow-sm bg-accent text-on-accent hover:bg-accent-hover"
          >
            Hand off
          </button>
        </div>
      </div>
    </div>
  );
}
