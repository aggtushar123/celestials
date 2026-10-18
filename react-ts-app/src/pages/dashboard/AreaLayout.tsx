import { Outlet } from 'react-router-dom';
import { AREAS } from './areas';
import type { AreaKey } from './areas';

/** Hands the area's sub-view list to whichever container is mounted, so each
 *  container's toolbar can render the switch without knowing its area.
 *
 *  Each view's `path` is made absolute (`/dashboard/<area>/<view>`) here,
 *  where the area is known for certain, rather than left for the toolbar to
 *  guess from the URL. The toolbar sits two route levels below this one (a
 *  pathless container, then the view itself), and a pathless route
 *  contributes nothing to the matched URL — so a `../` from the view does
 *  not land back on the area the way it would with only one level of
 *  nesting. An absolute path has no ancestor to resolve against, so it is
 *  right regardless of how many pathless layers sit in between. */
export function AreaLayout({ area }: { area: AreaKey }) {
  const subViews = AREAS.find((a) => a.key === area)!.views.map((view) => ({
    label: view.label,
    path: `/dashboard/${area}/${view.path}`,
  }));
  return (
    <div className="h-full w-full">
      <Outlet context={{ subViews }} />
    </div>
  );
}
