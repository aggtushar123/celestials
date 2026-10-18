// Wires a rail item to its HoverLabel: the handlers to spread on the item
// and the pill to render beside it. Takes the item's ref rather than
// owning one, so the caller keeps a plain ref and nothing reads it during
// render; the item's box is measured the moment the pill opens.

import { useState, type RefObject } from 'react';
import { HoverLabel } from './HoverLabel';

const GAP = 12;

export function useHoverLabel<T extends HTMLElement>(ref: RefObject<T | null>, label: string) {
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setBox({ left: rect.right + GAP, top: rect.top + rect.height / 2 });
  }
  const hide = () => setBox(null);

  return {
    handlers: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide },
    node: box ? <HoverLabel label={label} left={box.left} top={box.top} /> : null,
  };
}
