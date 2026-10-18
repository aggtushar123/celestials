import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { clearSendError, sendEmail } from '../../features/mail/mailSlice';

type Props = {
  customerId: number;
  accountId?: number;
  recordName: string;
  onClose: () => void;
  /** Called after a successful send, so the caller can refresh the list. */
  onSent: () => void;
};

/**
 * Write an email to an organisation or account. It goes out through the
 * writer's own connected mailbox (Settings › Integrations) and is filed on
 * the record as a sent email that only they (until they share it)
 * can read.
 */
export function ComposeEmailModal({ customerId, accountId, recordName, onClose, onSent }: Props) {
  const dispatch = useAppDispatch();
  const { sending, sendError, connection } = useAppSelector((s) => s.mail);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const recipients = to
      .split(/[,;\s]+/)
      .map((a) => a.trim())
      .filter(Boolean);
    if (recipients.length === 0 || !subject.trim() || !body.trim()) return;
    const result = await dispatch(sendEmail({ customerId, accountId, to: recipients, subject: subject.trim(), body }));
    if (sendEmail.fulfilled.match(result)) {
      onSent();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-label="Compose email">
      <form onSubmit={submit} className="w-full max-w-xl bg-surface rounded-xl border border-line shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle">
          <div>
            <div className="text-[14px] font-bold text-ink">Email {recordName}</div>
            <div className="text-[11.5px] text-ink-faint">
              {connection ? `From ${connection.address}` : 'Connect your mailbox in Settings › Integrations first'}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-subtle">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <input aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To — one or more addresses, comma separated" className="px-3 py-2 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
          <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="px-3 py-2 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
          <textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message" rows={8} className="px-3 py-2 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent resize-y" />
          {sendError && (
            <div className="text-[12px] text-danger" role="alert">
              {sendError}{' '}
              <button type="button" onClick={() => dispatch(clearSendError())} className="underline">dismiss</button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line-subtle">
          <button type="button" onClick={onClose} className="text-[12.5px] font-semibold text-ink-muted px-3 py-1.5">Cancel</button>
          <button type="submit" disabled={sending || !connection} className="px-4 py-1.5 bg-accent text-on-accent rounded-lg text-[12.5px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
