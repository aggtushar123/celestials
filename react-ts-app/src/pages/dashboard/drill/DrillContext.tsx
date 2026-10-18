import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import type { DrillRequest } from './types';
import { DrillContext } from './context';

/** Holds the one open drill for the whole dashboard. One panel, not one per
 *  view: opening another number replaces what is shown.
 *
 *  A drill describes the screen it was opened on, so it closes when the
 *  area or any filter in the query string changes. Outside a router (a few
 *  chart unit tests render a view on its own) there is no location to
 *  follow, so the panel only closes when asked. */
export function DrillProvider({ children }: { children: ReactNode }) {
  return useInRouterContext() ? (
    <RoutedDrillProvider>{children}</RoutedDrillProvider>
  ) : (
    <DrillStateProvider locationKey="">{children}</DrillStateProvider>
  );
}

function RoutedDrillProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  return <DrillStateProvider locationKey={pathname + search}>{children}</DrillStateProvider>;
}

function DrillStateProvider({ locationKey, children }: { locationKey: string; children: ReactNode }) {
  const [current, setCurrent] = useState<DrillRequest | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  // On a location change the header and list would describe the old screen,
  // so the panel goes away. Focus stays where the user put it (the control
  // that changed the filter), so the old trigger is not refocused. Adjusted
  // during render rather than in an effect so the stale panel never paints.
  const [openedAt, setOpenedAt] = useState(locationKey);
  if (openedAt !== locationKey) {
    setOpenedAt(locationKey);
    setCurrent(null);
  }

  const open = useCallback((request: DrillRequest, from?: HTMLElement | null) => {
    trigger.current = from ?? (document.activeElement as HTMLElement | null);
    setCurrent(request);
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    const back = trigger.current;
    trigger.current = null;
    // Synchronous, not requestAnimationFrame: the trigger is never part of
    // the dialog's own DOM, so it can be focused immediately, and jsdom
    // (unlike a real browser) never fires a queued rAF callback on its own.
    back?.focus();
  }, []);

  const value = useMemo(() => ({ current, open, close }), [current, open, close]);
  return <DrillContext.Provider value={value}>{children}</DrillContext.Provider>;
}
