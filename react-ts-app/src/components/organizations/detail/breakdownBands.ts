/** A share of the scale (0–1), in the rubric's own bands and in words. The
 *  organisation's components and the account pulse's readings both use it. */
export function band(ratio: number): { word: string; bar: string } {
  if (ratio >= 0.7) return { word: 'Good', bar: 'bg-success' };
  if (ratio >= 0.4) return { word: 'Average', bar: 'bg-warning' };
  return { word: 'Poor', bar: 'bg-danger' };
}

export const BREAKDOWN_ROW = 'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]';
