import type { LucideIcon } from 'lucide-react';

/** A person's or record's initials (UI foundations spec §3: the body font,
 *  never DM Mono): 32px in rows, 44px beside a page's name. Decorative; the
 *  name beside it carries the meaning. */
export function Initials({ text, size = 'md' }: { text: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-subtle font-semibold text-ink ${size === 'lg' ? 'h-11 w-11 text-[13px]' : 'h-8 w-8 text-[11px]'}`}
    >
      {text}
    </span>
  );
}

/** A row's leading icon (spec §7: icon chips are neutral, never tinted by
 *  type or department). */
export function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-muted">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
