import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelKey } from '../../../features/organizations/portfolioFields';

/** A tile jumps to its Details panel: `openDetails` switches the tab, then,
 *  once Details shows and the page's row has landed (`ready`), the panel
 *  (`[data-panel="<key>"]`) scrolls into view and takes focus. Each jump is
 *  numbered, so a second jump while already on Details still moves. */
export function usePanelJump(onDetails: boolean, ready: boolean, openDetails: () => void): (panel: PanelKey) => void {
  const [jump, setJump] = useState<{ panel: PanelKey; n: number } | null>(null);
  const handled = useRef(0);
  const jumpTo = useCallback(
    (panel: PanelKey) => {
      setJump((prev) => ({ panel, n: (prev?.n ?? 0) + 1 }));
      openDetails();
    },
    [openDetails],
  );
  useEffect(() => {
    if (!jump || jump.n === handled.current || !onDetails || !ready) return;
    handled.current = jump.n;
    const section = document.querySelector<HTMLElement>(`[data-panel="${jump.panel}"]`);
    if (!section) return;
    section.setAttribute('tabindex', '-1');
    section.scrollIntoView?.({ block: 'start' });
    section.focus();
  }, [jump, onDetails, ready]);
  return jumpTo;
}
