import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { BUTTON } from './styles';
import { TYPE } from './type';

// Loading, empty and error, each drawn inside the card that would hold the
// content (UI foundations spec §4.4): none brings its own card or fill.

const BAR = 'rounded bg-subtle motion-safe:animate-pulse';

/** A `role="status"` region with a screen-reader label and skeletons
 *  shaped like what is loading: `rows` (divided like the list), `tiles`, or
 *  one `block`. */
export function LoadingState({ label, variant = 'rows', count = 3 }: { label: string; variant?: 'rows' | 'tiles' | 'block'; count?: number }) {
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {variant === 'rows' ? (
        <div aria-hidden="true" className="divide-y divide-line-subtle">
          {items.map((index) => (
            <div key={index} data-part="skeleton-row" className="flex h-14 flex-col justify-center gap-2 px-4">
              <div className={`h-3 w-1/3 ${BAR}`} />
              <div className={`h-2.5 w-1/2 ${BAR}`} />
            </div>
          ))}
        </div>
      ) : variant === 'tiles' ? (
        <div aria-hidden="true" className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
          {items.map((index) => (
            <div key={index} data-part="skeleton-tile" className="h-24 rounded-xl bg-subtle motion-safe:animate-pulse" />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="p-4">
          <div data-part="skeleton-block" className={`h-32 ${BAR}`} />
        </div>
      )}
    </div>
  );
}

/** Nothing to show. `section` centres a title, a detail, an optional icon
 *  and one action; `inline` is one muted line for a blank section inside a
 *  populated page ("No open plans."). Always neutral. */
export function EmptyState({
  title,
  detail,
  action,
  icon: Icon,
  size = 'section',
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  size?: 'section' | 'inline';
}) {
  if (size === 'inline') return <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>{title}</p>;
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {Icon ? <Icon className="h-5 w-5 text-ink-faint" aria-hidden="true" /> : null}
      <p className={TYPE.title}>{title}</p>
      {detail ? <p className={`${TYPE.bodyMuted} max-w-[48ch]`}>{detail}</p> : null}
      {action}
    </div>
  );
}

export const DEFAULT_ERROR_DETAIL = 'Nothing is shown rather than a partial list.';

/** A failed load: an alert with the message, a detail line and Try again. */
export function ErrorState({ message, detail = DEFAULT_ERROR_DETAIL, onRetry }: { message: string; detail?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-[13px] font-semibold text-danger-ink">{message}</p>
      <p className={TYPE.meta}>{detail}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={BUTTON}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
