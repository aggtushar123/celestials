import { Outlet } from 'react-router-dom';
import { DrillProvider } from './drill/DrillContext';
import { DrillPanel } from './drill/DrillPanel';
import { FilterNamesProvider } from './ask/FilterNamesProvider';
import { DashboardAskProvider } from './ask/DashboardAskProvider';
import { AskRail } from './ask/AskRail';

/** The dashboard's own scroll container and page padding, with the Ask
 *  rail beside it: Communications' body, class for class (px-4 pb-4, a
 *  gap-3, no top padding because the transparent top bar above gives it),
 *  so the content column and the rail start at the same top and run the
 *  full remaining height.
 *
 *  `DashboardLayout`'s `<main>` is `overflow-hidden`, so every page under it
 *  owns its scroll; one element here does it for Overview and every area.
 *  `min-h-0` lets this flex child shrink so the overflow lands here.
 *
 *  The Ask rail (and its conversation) lives above the areas, so it survives
 *  tab and filter changes. From `lg` the drill panel takes the rail's box:
 *  absolute over the rail when it shows, or a 320px flex item in the rail's
 *  place when it is hidden or collapsed, so the content column narrows
 *  instead of the panel covering the figures (and widens again on close).
 *  `relative` is what the absolute form is placed against. */
export function DashboardFrame() {
  return (
    <FilterNamesProvider>
      <DashboardAskProvider>
        <DrillProvider>
          <div className="relative flex-1 min-h-0 w-full flex gap-3 px-4 pb-4">
            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
              <Outlet />
            </div>
            <AskRail />
            <DrillPanel />
          </div>
        </DrillProvider>
      </DashboardAskProvider>
    </FilterNamesProvider>
  );
}
