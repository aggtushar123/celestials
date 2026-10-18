import { useEffect, useRef, type RefObject } from 'react';

export type DismissReason = 'outside' | 'escape';

/** Closes a popup (a menu, a popover) on a pointer press outside it or on
 *  Escape. `refs` are the popup and anything else that must not count as
 *  outside, such as its trigger. The press is `mousedown`, so a trigger that
 *  stops its click's propagation still closes every other open popup.
 *  Focus is the caller's call: by convention an outside press leaves focus
 *  where the user put it, and Escape hands it back to the trigger. */
export function useDismiss(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  onDismiss: (reason: DismissReason) => void,
  active = true,
): void {
  const latest = useRef({ refs, onDismiss });
  useEffect(() => {
    latest.current = { refs, onDismiss };
  });

  useEffect(() => {
    if (!active) return;
    const inside = (target: Node) => {
      const { refs: current } = latest.current;
      return (Array.isArray(current) ? current : [current]).some((ref) => ref.current?.contains(target));
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!inside(event.target as Node)) latest.current.onDismiss('outside');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current.onDismiss('escape');
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);
}
