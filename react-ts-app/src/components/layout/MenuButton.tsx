import { Menu } from 'lucide-react';

/** The nav rail's own id (defined here, not in Sidebar.tsx, so this button
 *  keeps working where a test mocks the whole Sidebar module — as
 *  DashboardLayout.test.tsx's frame tests do — and still needs its slim
 *  bar's real menu button to render on Copilot/Communications/the canvas
 *  builder). Sidebar.tsx imports it from here for its own `id`. */
export const DRAWER_ID = 'phone-nav-drawer';

/** The phone-only button that opens the navigation drawer (phone shell spec
 *  2026-10-06, option A). Rendered twice: at the Navbar's left edge on every
 *  page that has a Navbar, and in DashboardLayout's own slim bar on Copilot,
 *  Communications and the canvas builder, which render no Navbar at all.
 *  Hidden from `md` up, where the rail is always in flow and never a drawer. */
export function MenuButton({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open navigation"
      aria-expanded={isOpen}
      aria-controls={DRAWER_ID}
      className="md:hidden inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Menu className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
