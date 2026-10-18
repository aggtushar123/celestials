// The compose editor (two-way Gmail D3, Decision 1): one editable region
// with a toolbar for bold, italic, the two lists and a link. It is
// uncontrolled: `html` seeds it once, and the composer re-keys it when the
// draft is replaced (Use the Gmail version). Every input hands back the
// cleaned HTML. A paste or a drop keeps the text only, and dropped files are
// refused, so no pasted or dropped image or style gets in. Ctrl or Cmd with
// B or I is the browser's own. While `disabled` (a send in flight) nothing
// can be typed or formatted.

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, type LucideIcon } from 'lucide-react';
import { cleanEditable, escapeHtml, runCommand, safeHref, type EditCommand } from '../../features/mail/mailEditor';
import { ADD_LINK, BAD_LINK, BOLD, BULLETS, CANCEL_LINK, FORMATTING, ITALIC, LINK, LINK_ADDRESS, NUMBERS } from '../../features/mail/mailText';
import { SIGNATURE as SIGNATURE_WORDS } from '../../features/mail/signature';
import { BUTTON, FOCUS, ICON_BUTTON, INPUT, INVALID, QUIET, TYPE } from '../../components/ui';

const TOOLS: { command: EditCommand; label: string; icon: LucideIcon; keys?: string }[] = [
  { command: 'bold', label: BOLD, icon: Bold, keys: 'Control+B' },
  { command: 'italic', label: ITALIC, icon: Italic, keys: 'Control+I' },
  { command: 'insertUnorderedList', label: BULLETS, icon: List },
  { command: 'insertOrderedList', label: NUMBERS, icon: ListOrdered },
];

const EDITABLE = `min-h-48 px-3 py-2 outline-none ${TYPE.body} [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_[data-revenact-signature]]:text-ink-muted [&_[data-revenact-signature]]:mt-3 [&_[data-revenact-signature]]:border-t [&_[data-revenact-signature]]:border-line-subtle [&_[data-revenact-signature]]:pt-2 ${FOCUS}`;

export function MailEditor({
  label,
  html,
  onChange,
  editorRef,
  disabled = false,
}: {
  label: string;
  html: string;
  onChange: (html: string) => void;
  editorRef?: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}) {
  const labelId = useId();
  const own = useRef<HTMLDivElement>(null);
  const ref = editorRef ?? own;
  const saved = useRef<Range | null>(null);
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [signed, setSigned] = useState(() => html.includes('data-revenact-signature'));

  // Seeded once per mount; the composer re-keys the editor to replace it.
  // Cleaned first: a live element runs an image's onerror the moment its
  // HTML is set, so only the editor's own tags may reach it.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = cleanEditable(html);
    // Round 2 D1 R2D1-16: the server puts Gmail's signature back whole on
    // save, so nothing is typed into it here; deleting it still works.
    ref.current?.querySelector('[data-revenact-signature]')?.setAttribute('contenteditable', 'false');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds on mount only
  }, []);

  function changed() {
    if (!ref.current) return;
    onChange(cleanEditable(ref.current.innerHTML));
    setSigned(Boolean(ref.current.querySelector('[data-revenact-signature]')));
  }

  function apply(command: EditCommand, value?: string) {
    ref.current?.focus();
    runCommand(command, value);
    changed();
  }

  /** Text only, at the caret: the same path a paste takes. */
  function insertPlain(text: string) {
    if (!text) return;
    runCommand('insertText', text);
    changed();
  }

  function cancelLink() {
    setLinking(false);
    ref.current?.focus();
  }

  function startLink() {
    // A second press closes the row (the phone has no Escape).
    if (linking) {
      cancelLink();
      return;
    }
    const selection = window.getSelection();
    const inside = selection && selection.rangeCount > 0 && ref.current?.contains(selection.anchorNode);
    saved.current = inside ? selection.getRangeAt(0).cloneRange() : null;
    setHref('');
    setLinkError(null);
    setLinking(true);
  }

  function addLink() {
    const target = safeHref(href);
    if (!target) {
      setLinkError(BAD_LINK);
      return;
    }
    ref.current?.focus();
    const selection = window.getSelection();
    if (saved.current && selection) {
      selection.removeAllRanges();
      selection.addRange(saved.current);
    }
    // With nothing selected, the address itself is written as the link.
    if (saved.current && !saved.current.collapsed) runCommand('createLink', target);
    else runCommand('insertHTML', `<a href="${escapeHtml(target)}">${escapeHtml(target)}</a>`);
    setLinking(false);
    changed();
  }

  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface focus-within:border-line-strong">
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <div role="toolbar" aria-label={FORMATTING} className="flex flex-wrap items-center gap-1 border-b border-line-subtle p-1">
        {TOOLS.map(({ command, label: name, icon: Icon, keys }) => (
          <button key={command} type="button" aria-label={name} title={name} aria-keyshortcuts={keys} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(command)} className={ICON_BUTTON}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <button type="button" aria-label={LINK} title={LINK} aria-expanded={linking} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={startLink} className={ICON_BUTTON}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {linking && !disabled ? (
        <div className="flex flex-wrap items-end gap-2 border-b border-line-subtle px-3 py-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={TYPE.label}>{LINK_ADDRESS}</span>
            <input
              type="url"
              value={href}
              autoFocus
              onChange={(event) => {
                setHref(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addLink();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelLink();
                }
              }}
              aria-invalid={linkError ? true : undefined}
              className={`${INPUT} ${INVALID}`}
            />
          </label>
          <button type="button" onClick={addLink} className={BUTTON}>
            {ADD_LINK}
          </button>
          <button type="button" onClick={cancelLink} className={QUIET}>
            {CANCEL_LINK}
          </button>
          {linkError ? (
            <p role="alert" className="w-full text-[11px] leading-4 text-danger-ink">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        contentEditable={!disabled}
        aria-disabled={disabled ? true : undefined}
        suppressContentEditableWarning
        onInput={changed}
        onPaste={(event) => {
          event.preventDefault();
          if (!disabled) insertPlain(event.clipboardData.getData('text/plain'));
        }}
        onDrop={(event) => {
          // Never the browser's drop: it would put the dragged html, styles
          // and images in the live editor uncleaned. Files are refused.
          event.preventDefault();
          if (disabled || event.dataTransfer.files.length > 0) return;
          // The caret goes where the text was dropped, where the browser can say.
          const at = document.caretRangeFromPoint?.(event.clientX, event.clientY);
          const selection = window.getSelection();
          if (at && selection && ref.current?.contains(at.startContainer)) {
            selection.removeAllRanges();
            selection.addRange(at);
          }
          insertPlain(event.dataTransfer.getData('text/plain'));
        }}
        className={EDITABLE}
      />
      {signed ? <p className={`${TYPE.meta} px-3 pb-2`}>{SIGNATURE_WORDS.EDITOR_HINT}</p> : null}
    </div>
  );
}
