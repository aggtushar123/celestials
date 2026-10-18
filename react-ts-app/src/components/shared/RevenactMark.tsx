// The brand mark, in one place. The sidebar renders the same two pieces
// inline (rose square + italic wordmark); auth and onboarding are the
// surfaces where a stranger meets the product, so they get the shared
// component rather than a third and fourth copy of the markup.

interface RevenactMarkProps {
  /** Show the wordmark beside the square. */
  withWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SQUARE = {
  sm: 'w-7 h-7 rounded-[7px] text-[15px]',
  md: 'w-10 h-10 rounded-[10px] text-[20px]',
  lg: 'w-12 h-12 rounded-xl text-[24px]',
} as const;

const WORDMARK = {
  sm: 'text-[18px]',
  md: 'text-[24px]',
  lg: 'text-[28px]',
} as const;

export function RevenactMark({ withWordmark = false, size = 'md', className = '' }: RevenactMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className={`${SQUARE[size]} shrink-0 bg-brand text-on-brand font-extrabold tracking-tighter flex items-center justify-center shadow-sm`}
      >
        R
      </span>
      {withWordmark && (
        <span className={`font-display italic text-ink tracking-tight leading-none ${WORDMARK[size]}`}>
          Revenact
        </span>
      )}
      {!withWordmark && <span className="sr-only">Revenact</span>}
    </span>
  );
}

export default RevenactMark;
