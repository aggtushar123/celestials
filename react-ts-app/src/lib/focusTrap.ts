const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside `root` (a full-screen sheet). */
export function trapTab(event: KeyboardEvent, root: HTMLElement): void {
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  // A script-focused element outside the list (a tabindex=-1 heading): Shift+Tab
  // would walk out of the root, so wrap to the last control. Tab walks in naturally.
  const outsideList = !focusable.includes(active as HTMLElement);
  if (event.shiftKey && (active === first || outsideList)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
