// The name of a rail item, shown in a pill to its right while the pointer
// rests on it or it has keyboard focus. The rail never widens; this is how
// it says what an icon is.
//
// Rendered through a portal: the rail scrolls, and a pill inside it would
// be clipped at the rail's edge.

import { createPortal } from 'react-dom';

export function HoverLabel({ label, left, top }: { label: string; left: number; top: number }) {
  return createPortal(
    <div
      role="tooltip"
      className="fixed z-[60] pointer-events-none -translate-y-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink shadow-md"
      style={{ left, top }}
    >
      {label}
    </div>,
    document.body,
  );
}
