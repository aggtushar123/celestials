import { useEffect, useId, useState, type FormEvent } from 'react';
import type { RecordRef } from '../../features/plans/planTypes';
import { RecordStep } from '../../components/plans/RecordStep';
import { FIELD_ERROR, FOCUS, PRIMARY, QUIET, TYPE } from '../../components/ui';

const ANY = 'Any customer the message names';
const ONE = 'Always this customer:';
const PICK = 'Choose a customer or account first.';
const RADIO = `size-4 accent-accent ${FOCUS}`;
const OPTION = `flex min-h-11 items-center gap-2 sm:min-h-9 ${TYPE.body}`;

/** "Its customer" (Slack escalations D1 Decision 5; D3 per channel): its
 *  messages go under the customer each one names, or always under one
 *  record. `onSave` answers a refusal sentence, or null once saved. */
export function ChannelCustomerForm({
  subject,
  current,
  onSave,
  onDone,
}: {
  subject: string;
  current: RecordRef | null;
  onSave: (record: RecordRef | null) => Promise<string | null>;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'any' | 'one'>(current ? 'one' : 'any');
  const [record, setRecord] = useState<RecordRef | null>(current);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const name = useId();
  const anyId = `${name}-any`;
  const oneId = `${name}-one`;

  useEffect(() => {
    document.getElementById(mode === 'one' ? oneId : anyId)?.focus();
    // Only on open: the checked option at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === 'one' && !record) return setRefused(PICK);
    setBusy(true);
    setRefused(null);
    const answer = await onSave(mode === 'any' ? null : record);
    setBusy(false);
    if (answer) setRefused(answer);
    else onDone();
  }

  return (
    <form onSubmit={save} aria-label={`Choose the customer of ${subject}`} className="flex flex-col gap-3">
      <fieldset className="flex flex-col">
        <legend className={`${TYPE.body} font-semibold`}>Which customer its messages go under</legend>
        <label className={OPTION}>
          <input id={anyId} type="radio" name={name} checked={mode === 'any'} onChange={() => setMode('any')} className={RADIO} />
          {ANY}
        </label>
        <label className={OPTION}>
          <input id={oneId} type="radio" name={name} checked={mode === 'one'} onChange={() => setMode('one')} className={RADIO} />
          {ONE}
        </label>
      </fieldset>
      {mode === 'one' ? (
        <RecordStep
          heading="Customer or account"
          record={record}
          locked={false}
          loading={false}
          onPick={(next) => {
            setRecord(next);
            setRefused(null);
          }}
          onClear={() => setRecord(null)}
        />
      ) : null}
      {refused ? (
        <p role="alert" className={FIELD_ERROR}>
          {refused}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onDone} className={QUIET}>
          Cancel
        </button>
        <button type="submit" aria-disabled={busy || undefined} className={PRIMARY}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
