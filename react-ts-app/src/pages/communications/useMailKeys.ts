// The mailbox's keyboard (spec §4, D2 Decision 8, D3 Decision 13): e done,
// # delete, j and k next and previous, r reply, a reply all, f forward, c
// compose. Off while the person types or reads elsewhere: inputs, text
// areas, selects, editable text, dialogs and menus (the label menu, the
// viewer), the mail frame, the composer, and anything outside the mailbox.

import { useEffect, type RefObject } from 'react';

export type MailKey = 'archive' | 'delete' | 'reply' | 'replyAll' | 'forward' | 'compose' | 'next' | 'previous';

const KEYS: Record<string, MailKey> = { e: 'archive', '#': 'delete', r: 'reply', a: 'replyAll', f: 'forward', c: 'compose', j: 'next', k: 'previous' };

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME', 'OBJECT']);

/** Whether a key press belongs to what has focus rather than to the mailbox. */
export function typingIn(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  // A ticked row's checkbox is not typing: j, k and e keep working after it.
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return false;
  if (FIELDS.has(element.tagName)) return true;
  return element.closest('[contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], [data-mail-composer]') !== null;
}

export function useMailKeys(scope: RefObject<HTMLElement | null>, onKey: (key: MailKey) => void): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const key = Object.hasOwn(KEYS, event.key) ? KEYS[event.key] : undefined;
      if (!key) return;
      const focused = document.activeElement;
      if (typingIn(focused) || (event.target instanceof Element && typingIn(event.target))) return;
      if (focused && focused !== document.body && !scope.current?.contains(focused)) return;
      event.preventDefault();
      onKey(key);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [scope, onKey]);
}
