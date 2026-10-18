// To, Cc or Bcc as address chips (two-way Gmail D3): type or paste
// addresses, split by commas, semicolons or Enter; each valid one becomes a
// chip with its own Remove button, anything that is not an address stays in
// the field with a line saying which, and leaving the field commits what is
// in it. Backspace in an empty field takes the last chip back to edit.

import { useId, useState, type RefObject } from 'react';
import { X } from 'lucide-react';
import { addRecipients, parseRecipients, recipientName, type Recipient } from '../../features/mail/mailDrafts';
import { badAddress, chipsLabel, removeRecipient } from '../../features/mail/mailText';
import { FOCUS, TYPE } from '../../components/ui';

export function RecipientField({
  label,
  value,
  onChange,
  error = null,
  inputRef,
  disabled = false,
}: {
  label: string;
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
  /** The server's field error (contract §3), shown under the field. */
  error?: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Held while a send is in flight. */
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [bad, setBad] = useState<string | null>(null);
  const shown = bad ?? error;

  function commit(raw: string) {
    const { valid, invalid } = parseRecipients(raw);
    if (valid.length > 0) onChange(addRecipients(value, valid));
    setText(invalid.join(', '));
    setBad(invalid.length > 0 ? badAddress(invalid[0]) : null);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      <div className={`flex min-h-11 flex-wrap items-center gap-1 rounded-lg border px-2 py-1 focus-within:border-line-strong sm:min-h-9 ${shown ? 'border-danger' : 'border-line'}`}>
        {value.length > 0 ? (
          <ul aria-label={chipsLabel(label)} className="contents">
            {value.map((recipient) => (
              <li key={recipient[1]} title={recipient[1]} className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-1 rounded-full bg-subtle pl-3 pr-1 text-[13px] leading-5 text-ink">
                <span className="truncate">{recipientName(recipient)}</span>
                <button
                  type="button"
                  aria-label={removeRecipient(recipient[1])}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((other) => other[1] !== recipient[1]))}
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-muted hover:bg-line-subtle hover:text-ink disabled:text-ink-faint disabled:hover:bg-transparent sm:min-h-6 sm:min-w-6 ${FOCUS}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          disabled={disabled}
          value={text}
          onChange={(event) => {
            setBad(null);
            const next = event.target.value;
            if (/[,;]\s*$/.test(next)) commit(next);
            else setText(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim()) {
              event.preventDefault();
              commit(text);
            } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
              event.preventDefault();
              const last = value[value.length - 1];
              onChange(value.slice(0, -1));
              setText(last[1]);
            }
          }}
          onBlur={() => {
            if (text.trim()) commit(text);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text/plain');
            if (!/[,;\n]/.test(pasted)) return;
            event.preventDefault();
            commit(`${text}${pasted}`);
          }}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? `${id}-error` : undefined}
          className="min-h-9 min-w-32 flex-1 bg-transparent px-1 text-[13px] leading-5 text-ink outline-none disabled:text-ink-faint"
        />
      </div>
      {shown ? (
        <p id={`${id}-error`} className="text-[11px] leading-4 text-danger-ink">
          {shown}
        </p>
      ) : null}
    </div>
  );
}
