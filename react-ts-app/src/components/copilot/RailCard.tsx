import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TYPE } from '../ui';

/** A card above an Ask rail in the Next event template (owner, 2026-10-16):
 *  glass, a label with its icon on the right, then the content. */
export function RailCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="rv-card-glass p-3" aria-labelledby={headingId}>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h2 id={headingId} className={TYPE.label}>
          {title}
        </h2>
        <Icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}
