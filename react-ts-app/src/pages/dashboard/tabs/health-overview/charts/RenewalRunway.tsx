import { RENEWAL_URGENT_DAYS } from '../triage';

/** Bar length is measured against a year out; anything further reads as full. */
const HORIZON_DAYS = 365;

export interface RenewalRunwayProps {
  /** Days until renewal, or null when the account's date didn't parse. */
  days: number | null;
}

/**
 * How much runway is left before this account renews.
 *
 * The bar measures time *remaining*, so a short bar means little time — the
 * urgent case is the small one. (Drawing it the other way round, with urgency
 * as a long bar, reads backwards: the most alarming row gets the fullest,
 * healthiest-looking track.)
 */
export function RenewalRunway({ days }: RenewalRunwayProps) {
  if (days === null) {
    return (
      <span className="text-[10.5px] text-ink-faint" title="No renewal date on this account">
        —
      </span>
    );
  }

  // A renewal date in the past is overdue, not "negative days away". Printing
  // the raw number reads as a countdown running backwards; real books have
  // plenty of these, so they get their own wording.
  const overdue = days < 0;
  const clamped = Math.max(0, Math.min(days, HORIZON_DAYS));
  // Floor the width so an imminent renewal still draws something visible.
  const pct = Math.max(5, Math.round((clamped / HORIZON_DAYS) * 100));
  const urgent = days <= RENEWAL_URGENT_DAYS;

  const label = overdue ? `${Math.abs(days)}d ago` : `${days}d`;
  const title = overdue
    ? `Renewal was due ${Math.abs(days)} days ago`
    : `Renews in ${days} days`;

  return (
    <div className="flex items-center gap-[7px]" title={title}>
      <div className="flex-1 h-[5px] rounded-[3px] bg-line overflow-hidden">
        <span
          className={`block h-full rounded-[3px] ${urgent ? 'bg-danger' : 'bg-ink-faint'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`w-[46px] text-right text-[10.5px] tabular-nums ${
          urgent ? 'text-danger font-bold' : 'text-ink-muted'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
