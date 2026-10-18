import type { ReactNode } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { TYPE } from './type';

/** One sentence the whole page needs to know (settings production spec
 *  §5.5): an icon, the sentence, an optional link or button. Warning text
 *  stays in ink; the amber is the tint and the icon. */
export function Banner({ tone = 'info', action, children }: { tone?: 'info' | 'warning'; action?: ReactNode; children: ReactNode }) {
  const Icon = tone === 'warning' ? TriangleAlert : Info;
  return (
    <div role="note" className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone === 'warning' ? 'border-warning/30 bg-warning-dim' : 'border-line bg-subtle'}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'warning' ? 'text-warning' : 'text-ink-faint'}`} aria-hidden="true" />
      <p className={`min-w-0 flex-1 ${TYPE.body}`}>{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
