import { useMediaQuery } from '../../lib/useMediaQuery';

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** A new line fades up once (200ms, ease-out); never under reduced motion. */
export function useEnter(fresh: boolean): string {
  const reduced = useMediaQuery(REDUCED_MOTION);
  return fresh && !reduced ? 'animate-fade-up' : '';
}
