// Test-only: DashboardLayout's Navbar actions slot, where an Ask pill
// portals. Shared by every page's test render (organization, Contacts, …)
// so a rail's pill has somewhere real to land.
import { useMemo, useState, type ReactNode } from 'react';
import { NavActionsSlotContext } from '../layouts/navActionsSlot';

/** With the real Navbar (`nav`) the Navbar renders the slot element; without
 *  it a bare one stands in (`data-testid="nav-actions"`). */
export function SlotHost({ bare, children }: { bare: boolean; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // With the real Navbar, as DashboardLayout: undefined until the Navbar
  // resolves its title slot, so a PageHeader mounts once, in the bar.
  // Bare (no Navbar): null, so a PageHeader draws in place.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null | undefined>(bare ? null : undefined);
  const value = useMemo(() => ({ slot, setSlot, titleSlot, setTitleSlot }), [slot, titleSlot]);
  return (
    <NavActionsSlotContext.Provider value={value}>
      {bare ? <div ref={setSlot} data-testid="nav-actions" /> : null}
      {children}
    </NavActionsSlotContext.Provider>
  );
}
