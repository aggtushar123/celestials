import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { OwnerCoverage } from '../../../../../features/activity/activitySlice';
import { formatCompactMoney } from '../../../../../features/customers/formatters';

export interface OwnerCoverageListProps {
  owners: OwnerCoverage[];
  currency: CurrencyCode;
  windowDays: number;
  threshold: number;
}

/**
 * Coverage per book, worst first.
 *
 * **This is "is this book being worked", not "who did the work".** Records
 * carry free-text names (`sender_name`, `author_name`), never a user, so the
 * backend attributes by account owner — a real relationship. Reading it as a
 * productivity score would be reading it wrong, and the subtitle says so.
 *
 * Sorted by accounts gone quiet rather than by coverage percentage: three
 * silent accounts out of forty is a worse problem than one out of two, and
 * percentages invert that.
 */
export function OwnerCoverageList({
  owners,
  currency,
  windowDays,
  threshold,
}: OwnerCoverageListProps) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Coverage by book</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          Accounts touched in {windowDays} days, by who owns them — not by who logged the work
        </p>
      </div>

      {owners.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">No accounts in this selection.</p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-[11px]">
          {owners.map((owner) => {
            const share = owner.accounts > 0 ? (owner.touched / owner.accounts) * 100 : 0;
            return (
              <li key={owner.owner}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-medium text-ink truncate">{owner.owner}</span>
                  <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                    {owner.touched}/{owner.accounts} touched
                  </span>
                </div>
                <div
                  className="mt-[3px] h-[10px] rounded-[3px] bg-subtle overflow-hidden"
                  role="img"
                  aria-label={`${owner.owner}: ${owner.touched} of ${owner.accounts} accounts touched, ${owner.dark} gone quiet`}
                >
                  <div
                    // Ink, not green: a touched account is coverage, not a gain.
                    className="h-full rounded-[3px] bg-ink"
                    style={{ width: `${share}%` }}
                  />
                </div>
                {owner.dark > 0 && (
                  <p className="text-[10.5px] text-danger mt-[2px]">
                    {owner.dark} past {threshold} days
                    {owner.arr_dark > 0 && ` · ${formatCompactMoney(owner.arr_dark, currency)}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
