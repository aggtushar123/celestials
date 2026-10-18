import { useEffect, useState } from 'react';

export const SM = '(min-width: 640px)';
export const MD = '(min-width: 768px)';
export const LG = '(min-width: 1024px)';
export const XL = '(min-width: 1280px)';

/** Whether `query` matches. jsdom has no matchMedia, which reads as false:
 *  the mobile-first default the CSS assumes too. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
