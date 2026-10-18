import { useEffect, useRef } from 'react';

/** Marks a sideways-scrolling row with `data-overflow` while its content is
 *  wider than the row, so `.rv-scroll-fade` (index.css) fades its right
 *  edge (UI foundations spec §5.2). Attach the returned ref to the row. */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      if (element.scrollWidth > element.clientWidth + 1) element.setAttribute('data-overflow', '');
      else element.removeAttribute('data-overflow');
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  return ref;
}
