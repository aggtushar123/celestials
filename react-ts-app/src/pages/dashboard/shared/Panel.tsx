import type { ReactNode } from 'react';
import { Card } from '../../../components/ui/Card';
import { TYPE } from '../../../components/ui/type';

/** The one container on the dashboard, drawn by the shared Card (UI
 *  foundations spec §9.1; Panel itself goes in the Dashboard PR). Never
 *  nest one inside another: group inside a panel with `divide-y` or
 *  whitespace instead. */
export function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      {(title || action) && (
        <header className="flex items-baseline justify-between gap-3 mb-3">
          {title && <h2 className={TYPE.title}>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </Card>
  );
}
