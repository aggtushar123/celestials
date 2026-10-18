import type { ReactNode } from 'react';
import { useScrollFade } from './useScrollFade';

/** The row a wide table scrolls in: sideways scroll, and a fade on the right
 *  edge while the table is wider than the row (UI foundations spec §5.2), so
 *  a phone shows there is more to the right. */
export function ScrollTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useScrollFade<HTMLDivElement>();
  return (
    <div ref={ref} className={`overflow-x-auto rv-scroll-fade ${className}`.trim()}>
      {children}
    </div>
  );
}
