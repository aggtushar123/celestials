import { useId, useLayoutEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { insertMergeField } from '../../features/campaigns/campaignDraft';
import { BODY_MAX, MERGE_FIELDS, SUBJECT_MAX, type MergeField } from '../../features/campaigns/campaignOptions';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { CODE } from '../ui/styles';
import { Field } from '../rules/Field';

const CHIP = `inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[13px] text-ink hover:bg-subtle active:bg-line-subtle ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');

function Count({ n, max }: { n: number; max: number }) {
  return (
    <>
      <span className={MONO}>{n}</span> of <span className={MONO}>{max}</span>
    </>
  );
}

/** Subject and body (spec §2.2), plain text, with the three merge fields as
 *  chips that insert into the body at its caret (Decision 10). */
export function MessageFields({ subject, body, errors, onSubject, onBody }: {
  subject: string;
  body: string;
  errors: { subject?: string; body?: string };
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
}) {
  const subjectId = useId();
  const bodyId = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /** The body's last selection; null until it is touched (then a chip appends). */
  const selection = useRef<{ start: number; end: number } | null>(null);
  /** Where the caret goes once the inserted text has rendered. */
  const pending = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pending.current === null) return;
    const caret = pending.current;
    pending.current = null;
    bodyRef.current?.focus();
    bodyRef.current?.setSelectionRange(caret, caret);
  }, [body]);

  const remember = () => {
    const box = bodyRef.current;
    if (box) selection.current = { start: box.selectionStart, end: box.selectionEnd };
  };
  const insert = (field: MergeField) => {
    const at = selection.current ?? { start: body.length, end: body.length };
    const next = insertMergeField(body, at.start, at.end, field);
    selection.current = { start: next.caret, end: next.caret };
    pending.current = next.caret;
    onBody(next.text);
  };

  return (
    <section aria-label="Message" className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold text-ink">Message</h3>
      <Field id={subjectId} label="Subject" hint={<Count n={subject.length} max={SUBJECT_MAX} />} error={errors.subject}>
        {(aria) => (
          <input
            id={subjectId}
            {...aria}
            value={subject}
            maxLength={SUBJECT_MAX}
            placeholder="Checking in, {first_name}"
            onChange={(event) => onSubject(event.target.value)}
            className={`${INPUT} ${border(errors.subject)}`}
          />
        )}
      </Field>
      <Field id={bodyId} label="Body" hint={<Count n={body.length} max={BODY_MAX} />} error={errors.body}>
        {(aria) => (
          <textarea
            id={bodyId}
            ref={bodyRef}
            {...aria}
            rows={8}
            value={body}
            maxLength={BODY_MAX}
            onChange={(event) => {
              onBody(event.target.value);
              selection.current = { start: event.target.selectionStart, end: event.target.selectionEnd };
            }}
            onSelect={remember}
            onKeyUp={remember}
            onClick={remember}
            className={`${INPUT} resize-y py-2 ${border(errors.body)}`}
          />
        )}
      </Field>
      <div role="group" aria-label="Merge fields" className="flex flex-wrap items-center gap-1.5">
        {MERGE_FIELDS.map((field) => (
          <button key={field} type="button" aria-label={`Insert {${field}}`} onClick={() => insert(field)} className={CHIP}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={CODE}>{`{${field}}`}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-muted">Plain text. Every email ends with your name, the workspace and a line to unsubscribe.</p>
    </section>
  );
}
