import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ScrollSentinel } from '../../components/ui';

/** Set inside the frame OrganizationsAskLayout draws, so a page's own frame
 *  inside it renders just its content rather than a second frame. */
const InFrame = createContext(false);

/** The Organizations frame (the list, the board and an organization's page): DashboardFrame's body, class for class
 *  (px-4 pb-4, gap-3, no top padding because the transparent top bar above
 *  gives it), with a content column that owns its scroll (a flex column, so
 *  the Board can fill its height; the List just stacks) and a slot for the
 *  Ask rail beside it.
 *
 *  OrganizationsAskLayout draws the frame once, with `AskRail` in the slot,
 *  above both views, as DashboardFrame does: the rail (and the pill it
 *  portals into the Navbar) is one element that survives the List/Board
 *  swap, so a conversation reopened on the other view never lands in a rail
 *  that is about to unmount. The List and the Board still wrap themselves
 *  in this frame, which inside the layout passes their content straight
 *  through, and on its own (a page rendered alone) draws the frame without
 *  a rail, the content taking the full width. */
export function OrganizationsFrame({
  rail = null,
  bleed = false,
  scrollKey = null,
  children,
}: {
  rail?: ReactNode;
  /** The organization page's variant. Below sm, the 16px side gutter sits
   *  inside the scroll column instead of around it, so a strip that bleeds
   *  with `-mx-4` (the organization page's tiles, filters and tabs) reaches
   *  the screen edge exactly and never makes the column scroll sideways.
   *  From sm up the gutter is 16px, the bar's own (UI foundations spec §6.1;
   *  owner, 2026-09-27: the page uses the full width, not a centred
   *  column). The List and the Board keep px-4. */
  bleed?: boolean;
  /** Which page the column shows (the layout's: an organisation's id, or
   *  the List or the Board). The column is shared across those routes, so
   *  when this changes it scrolls back to the top; a tab or query change
   *  within one page keeps the key, and its place. */
  scrollKey?: string | null;
  children: ReactNode;
}) {
  const inFrame = useContext(InFrame);
  const column = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (column.current) column.current.scrollTop = 0;
  }, [scrollKey]);
  if (inFrame) return <>{children}</>;
  return (
    <InFrame.Provider value={true}>
      <div className={`relative flex-1 min-h-0 w-full flex gap-3 pb-4 ${bleed ? 'px-0 sm:px-4' : 'px-4'}`}>
        <div ref={column} className={`flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col ${bleed ? 'px-4 sm:px-0' : ''}`}>
          <ScrollSentinel />
          {children}
        </div>
        {rail}
      </div>
    </InFrame.Provider>
  );
}
