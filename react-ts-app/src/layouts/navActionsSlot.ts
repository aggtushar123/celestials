import { createContext } from 'react';

/** Places in the Navbar that a page portals into. `slot`: the right-hand
 *  actions (the Ask pill, a scope switch). `titleSlot`: the left-hand title,
 *  where a page's PageHeader draws its h1 or Back link and its tabs (UI
 *  foundations spec §6.1); the Navbar renders it only on routes whose pages
 *  title themselves. DashboardLayout owns both elements; each is null
 *  anywhere else. Inside DashboardLayout `titleSlot` is undefined until the
 *  Navbar has resolved it (and on routes without one), so a PageHeader
 *  waits for the bar instead of drawing in place first and remounting. */
export interface NavActionsSlot {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  titleSlot?: HTMLElement | null;
  setTitleSlot?: (element: HTMLElement | undefined) => void;
}

export const NavActionsSlotContext = createContext<NavActionsSlot>({ slot: null, setSlot: () => {}, titleSlot: null, setTitleSlot: () => {} });
