import type { CSSProperties, ReactNode } from 'react';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** A table that scrolls inside its card instead of growing the page, with the
 *  header pinned on the surface colour. `ActivityDetailedTable` is the pattern
 *  this generalises. The region is focusable so a keyboard can scroll it, and
 *  `caption` is its accessible name. */
export function ScrollTable({
  caption,
  maxHeight = 420,
  minWidth,
  className = '',
  children,
}: {
  caption: string;
  maxHeight?: number;
  /** Below this width the table scrolls sideways instead of squashing. */
  minWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  const style = { maxHeight, ...(minWidth ? { '--scroll-min-w': `${minWidth}px` } : {}) } as CSSProperties;
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      style={style}
      className={`overflow-auto [&>table]:min-w-(--scroll-min-w) [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-surface ${FOCUS} ${className}`}
    >
      {children}
    </div>
  );
}

/** The same cap for a list (`<ul>`/`<ol>`), such as a ranked attention list. */
export function ScrollArea({
  label,
  maxHeight = 420,
  className = '',
  children,
}: {
  label: string;
  maxHeight?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{ maxHeight }}
      className={`overflow-y-auto ${FOCUS} ${className}`}
    >
      {children}
    </div>
  );
}
