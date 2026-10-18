import { useState } from 'react';
import { FUNCTION_LABELS, type User, type UserFunction } from '../../features/auth/authSlice';
import { INPUT, PRIMARY, QUIET, Select, TYPE } from '../ui';

export type OwnerSummary = { id: number; name: string; function: UserFunction | null };

type Props = {
  title?: string;
  owner: OwnerSummary | null;
  members: User[];
  /** Whether the viewer may assign or hand over (the backend decides for real). */
  mayChange: boolean;
  /** Save the new owner (null clears) with a handover note; resolve null on
   *  success, or the rejection's message to show inline. */
  onSave: (userId: number | null, note: string) => Promise<string | null>;
  /** A row inside a card. Both variants are flat now (no tinted box in a
   *  card); this only marks the data attribute the page tests read. */
  plain?: boolean;
};

/**
 * One accountable person, from any function, for an organisation or an
 * account: who it is, and "Assign" / "Hand over" with a note that is written
 * down for the record. The same tile on both pages so ownership reads and
 * behaves the same wherever it appears. A divided row, never a tinted box.
 */
export function OwnerTile({ title = 'Account owner', owner, members, mayChange, onSave, plain = false }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (pending === null) return;
    const rejection = await onSave(pending ? Number(pending) : null, note);
    if (rejection === null) {
      setPending(null);
      setNote('');
      setError(null);
    } else {
      setError(rejection);
    }
  }

  const options = [{ value: '', label: 'Nobody' }, ...members.map((m) => ({ value: String(m.id), label: `${m.name}${m.function ? ` · ${FUNCTION_LABELS[m.function]}` : ''}` }))];
  return (
    <div data-owner-tile={plain ? 'row' : 'tile'} className="flex flex-col gap-2 border-t border-line-subtle pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={TYPE.label}>{title}</div>
          <div className={`${TYPE.body} font-semibold`}>{owner ? `${owner.name}${owner.function ? ` · ${FUNCTION_LABELS[owner.function]}` : ''}` : 'Nobody yet'}</div>
        </div>
        {mayChange && pending === null && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPending(owner ? String(owner.id) : '');
            }}
            className={QUIET}
          >
            {owner ? 'Hand over' : 'Assign'}
          </button>
        )}
      </div>
      {pending !== null && (
        <div className="flex flex-col gap-2">
          <Select label="New account owner" labelPosition="hidden" value={pending} onChange={setPending} options={options} />
          <input
            aria-label="Handover note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is it moving? (written down for the record)"
            className={INPUT}
          />
          {error ? (
            <p role="alert" className="text-[13px] text-danger-ink">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" onClick={save} className={PRIMARY}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPending(null);
              }}
              className={QUIET}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
