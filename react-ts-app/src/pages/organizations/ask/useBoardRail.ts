import { useState } from 'react';
import { SM, XL, useMediaQuery } from '../../../lib/useMediaQuery';
import { useAsk } from '../../dashboard/ask/useAsk';

/** The Ask rail beside a portfolio board (Organizations and Accounts, spec
 *  2026-09-25 §3, plan pre-flight 12) wins the room: open from sm, it narrows
 *  the columns (`railOpen`, the board's `narrow`), and below xl, where a
 *  320px rail and the 26rem side panel don't both fit, an opened card is the
 *  bottom sheet instead (`sidePanel` false). Opening the rail below xl closes
 *  the open card rather than turning it into a sheet over the rail:
 *  `closeCard` runs then, adjusted during the board's render, not in an
 *  effect. */
export function useBoardRail(closeCard: () => void): { railOpen: boolean; sidePanel: boolean } {
  const isSm = useMediaQuery(SM);
  const isXl = useMediaQuery(XL);
  const ask = useAsk();
  const railOpen = isSm && Boolean(ask?.open);
  const [railWas, setRailWas] = useState(railOpen);
  if (railWas !== railOpen) {
    setRailWas(railOpen);
    if (railOpen && !isXl) closeCard();
  }
  return { railOpen, sidePanel: isSm && (!railOpen || isXl) };
}
