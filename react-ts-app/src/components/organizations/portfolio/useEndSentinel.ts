import { useEffect, useRef, useState } from 'react';

/** A callback ref for the element at the end of a paged list. `onEnd` runs
 *  whenever that element scrolls into view (200px early) while `active`
 *  (there is a next page and none is loading). Turning `active` off and on
 *  again (a page landed) re-observes, and a browser observer fires at once
 *  if the end is still in view, so a short column keeps filling. Without
 *  IntersectionObserver (jsdom, very old browsers) it does nothing and the
 *  visible "Show more" button does the job. The observer's root is the
 *  nearest `[data-scroll-root]` ancestor (a desktop Board column's own
 *  scroller), since a margin on the viewport can't reach past an ancestor's
 *  clip; without one it is the viewport (phones, where the page scrolls). */
export function useEndSentinel(onEnd: () => void, active: boolean): (element: Element | null) => void {
  const [element, setElement] = useState<Element | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!active || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onEndRef.current();
      },
      { root: element.closest('[data-scroll-root]'), rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, element]);

  return setElement;
}
