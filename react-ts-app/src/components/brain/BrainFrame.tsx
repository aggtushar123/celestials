import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Set inside the frame BrainAskLayout draws, so a page's own BrainFrame
 *  inside it renders just its content rather than a second frame (the
 *  OrganizationsFrame rule). */
const InFrame = createContext(false);

/** From sm the rail, the frame's only child besides the column, keeps the
 *  16px gutter on its right and below, as OrganizationsFrame's px-4 pb-4
 *  gives it. Below sm the rail is a fixed full-screen sheet, which a margin
 *  would shrink, so none applies there. */
const RAIL_GUTTER = 'sm:[&>:not([data-brain-frame])]:mr-4 sm:[&>:not([data-brain-frame])]:mb-4';

/** Every Brain route's body (brain UI spec 2026-10-06 §1.4): one full-width
 *  column under the transparent Brain bar that owns its scroll, a 16px
 *  gutter, no centred column and no max width, as OrganizationsFrame lays
 *  out the Organizations list. BrainAskLayout draws it once above every
 *  Brain route, with Ask Revenact in `rail` beside the column and outside
 *  its scroll (brain ask spec §2.2), so a tab change never remounts the
 *  rail. A page's own frame inside passes its content through; on its own
 *  (a page rendered alone) it draws the frame without a rail. `scrollKey`
 *  is the page in the shared column: when it changes the column starts at
 *  the top, and a scope or section change within one page keeps its place. */
export function BrainFrame({ rail = null, scrollKey = null, children }: { rail?: ReactNode; scrollKey?: string | null; children: ReactNode }) {
  const inFrame = useContext(InFrame);
  const column = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (column.current) column.current.scrollTop = 0;
  }, [scrollKey]);
  if (inFrame) return <>{children}</>;
  return (
    <InFrame.Provider value={true}>
      <div className={`relative flex min-h-0 w-full flex-1 gap-3 ${RAIL_GUTTER}`}>
        <div ref={column} data-brain-frame="" className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="@container flex flex-col gap-4 px-4 pb-6">{children}</div>
        </div>
        {rail}
      </div>
    </InFrame.Provider>
  );
}
