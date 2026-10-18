import { useId, useState } from 'react';
import { useAppDispatch } from '../../hooks';
import { saveSignature, type MailboxConnection } from '../../features/mail/mailSlice';
import { SIGNATURE, gmailSignatureText } from '../../features/mail/signature';
import { BUTTON, INPUT, SettingsRow, TYPE } from '../ui';

const AREA = `${INPUT} min-h-24 py-2`;

/** The mailbox's signature (round 2 D1 contract §4.3; Decisions 4, 5): an
 *  Outlook owner writes it; Gmail's is shown as Gmail has it; IMAP has none. */
export function MailboxSignature({ connection }: { connection: MailboxConnection }) {
  const dispatch = useAppDispatch();
  const id = useId();
  const signature = connection.signature;
  const [text, setText] = useState(signature?.text ?? '');
  const [saved, setSaved] = useState(signature?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  if (!signature) return null;

  if (!signature.editable) {
    return (
      <SettingsRow label={SIGNATURE.LABEL} hint={SIGNATURE.GMAIL_HINT} stacked>
        <p className={`whitespace-pre-line break-words ${TYPE.body}`}>{gmailSignatureText(signature.text)}</p>
      </SettingsRow>
    );
  }

  const changed = text !== saved;
  async function save() {
    if (busy || !changed) return;
    setBusy(true);
    setDone(false);
    setRefused(null);
    const result = await dispatch(saveSignature(text));
    setBusy(false);
    if (saveSignature.rejected.match(result)) return setRefused(result.payload ?? SIGNATURE.FAILED);
    const kept = result.payload.signature?.text ?? '';
    setText(kept);
    setSaved(kept);
    setDone(true);
  }

  return (
    <SettingsRow label={SIGNATURE.LABEL} htmlFor={id} hint={SIGNATURE.HINT} hintId={`${id}-hint`} error={refused} errorId={`${id}-error`} stacked>
      <textarea
        id={id}
        rows={4}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setDone(false);
          setRefused(null);
        }}
        aria-invalid={Boolean(refused)}
        aria-describedby={refused ? `${id}-error` : `${id}-hint`}
        className={AREA}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} aria-disabled={busy || !changed || undefined} className={BUTTON}>
          {busy ? SIGNATURE.SAVING : SIGNATURE.SAVE}
        </button>
        <p role="status" className={done ? TYPE.meta : 'sr-only'}>
          {done ? SIGNATURE.SAVED : ''}
        </p>
      </div>
    </SettingsRow>
  );
}
