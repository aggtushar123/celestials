import { useId, useState } from 'react';
import type { RecordRef } from '../../features/plans/planTypes';
import { addContactText, goneText, isGone, matchUnmatched, UNMATCHED, type MatchAnswer, type UnmatchedItem } from '../../features/work/unmatched';
import { readRefusal } from '../../features/work/workApi';
import { FOCUS } from '../organizations/portfolio/styles';
import { RecordStep } from '../plans/RecordStep';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BuilderDialog } from '../segments/BuilderDialog';
import { FIELD_ERROR, FilterChip, FORM_ALERT, PRIMARY, QUIET, TYPE } from '../ui';

/** Match to a customer (round 2 D3 frontend Decision 3): pick the record the
 *  message belongs to and, when the sender's email is new, ask to add them as
 *  a contact. Match is the one primary; it stays focusable and aria-disabled
 *  while it sends. NOT_COVERED and GONE show as the dialog's alert; GONE also
 *  tells the list to drop the row behind the dialog (the dialog stays open).
 *  A Slack message's mentioned customers are chips that pick the record
 *  (Slack escalations D1 Decision 3). */
export function MatchDialog({ item, onMatched, onGone, onClose }: { item: UnmatchedItem; onMatched: (answer: MatchAnswer) => void; onGone: (id: number) => void; onClose: () => void }) {
  const [record, setRecord] = useState<RecordRef | null>(null);
  const [addContact, setAddContact] = useState(false);
  const [recordError, setRecordError] = useState<string | undefined>();
  const [contactError, setContactError] = useState<string | undefined>();
  const [alert, setAlert] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const { busy, run } = useSubmitOnce();
  const contactId = useId();
  const mentionedId = useId();

  async function submit() {
    if (busy || gone) return;
    if (!record) {
      setRecordError(UNMATCHED.PICK_RECORD);
      return;
    }
    setRecordError(undefined);
    setContactError(undefined);
    setAlert(null);
    const target = record.kind === 'organization' ? { customer_id: record.id } : { account_id: record.id };
    const outcome = await run(() => matchUnmatched(item.id, { ...target, ...(item.can_add_contact ? { add_contact: addContact } : {}) }));
    if (!outcome) return;
    if (outcome.ok) {
      onMatched(outcome.value);
      return;
    }
    if (isGone(outcome.error)) {
      setGone(true);
      setAlert(goneText(outcome.error));
      onGone(item.id);
      return;
    }
    const refusal = readRefusal(outcome.error, UNMATCHED.MATCH_FAILED);
    setRecordError(refusal.field.record);
    setContactError(refusal.field.add_contact);
    setAlert(refusal.field.record || refusal.field.add_contact ? null : (refusal.form ?? UNMATCHED.MATCH_FAILED));
  }

  return (
    <BuilderDialog title={UNMATCHED.MATCH_TITLE} onClose={onClose} size="narrow">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <p className={TYPE.bodyMuted}>{item.title}</p>
        {item.mentioned.length ? (
          <div className="flex flex-col gap-1.5">
            <p id={mentionedId} className={TYPE.meta}>
              {UNMATCHED.MENTIONED}
            </p>
            <div role="group" aria-labelledby={mentionedId} className="flex flex-wrap gap-2">
              {item.mentioned.map((m) => {
                const kind = m.type === 'customer' ? 'organization' : 'account';
                const pressed = record?.kind === kind && record.id === m.id;
                return (
                  <FilterChip
                    key={`${m.type}:${m.id}`}
                    label={m.name}
                    pressed={pressed}
                    onToggle={() => {
                      setRecord(pressed ? null : { kind, id: m.id, name: m.name });
                      setRecordError(undefined);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
        <RecordStep heading={UNMATCHED.RECORD} record={record} locked={false} loading={false} error={recordError} onPick={(next) => { setRecord(next); setRecordError(undefined); }} onClear={() => { setRecord(null); setRecordError(undefined); }} />
        {item.can_add_contact ? (
          <div className="flex flex-col">
            <label htmlFor={contactId} className={`flex min-h-11 items-start gap-2 py-2 sm:min-h-9 ${TYPE.body}`}>
              <input id={contactId} type="checkbox" checked={addContact} onChange={(event) => setAddContact(event.target.checked)} aria-invalid={Boolean(contactError)} className={`mt-0.5 h-4 w-4 shrink-0 ${FOCUS}`} />
              <span>{addContactText(item.from.email)}</span>
            </label>
            {contactError ? (
              <p role="alert" className={FIELD_ERROR}>
                {contactError}
              </p>
            ) : null}
          </div>
        ) : null}
        {alert ? (
          <p role="alert" className={FORM_ALERT}>
            {alert}
          </p>
        ) : null}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
        <button type="button" onClick={onClose} className={QUIET}>
          {UNMATCHED.CANCEL}
        </button>
        <button type="button" onClick={() => void submit()} aria-disabled={busy || gone || undefined} aria-busy={busy || undefined} className={PRIMARY}>
          {busy ? UNMATCHED.MATCHING : UNMATCHED.MATCH_CONFIRM}
        </button>
      </footer>
    </BuilderDialog>
  );
}
