import type { ReactNode } from 'react';
import { PageBody } from '../ui';

/** The inbox's body: a reading column (UI foundations spec §6.2) under
 *  the Work bar, capped at max-w-5xl and kept at the bar's left edge. Work
 *  home's brief (Mine, 2026-10-17) takes the `full` width up to the right
 *  pane; its rows cap their own line length. The outer div owns the scroll. */
export function WorkFrame({ width = 'reading', children }: { width?: 'reading' | 'full'; children: ReactNode }) {
  return (
    <div data-work-frame="" className="h-full min-h-0 w-full flex-1 overflow-y-auto">
      <PageBody width={width}>{children}</PageBody>
    </div>
  );
}
