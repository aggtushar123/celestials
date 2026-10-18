import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import { formatCompactMoney, formatMoney } from '../../../../../features/customers/formatters';
import type { OwnerLoad } from '../renewal';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';
import { ChartLegend } from '../../../shared/ChartLegend';
import { ROLE } from '../../../shared/chartPalette';

export interface OwnerLoadChartProps {
  load: OwnerLoad[];
  currency: CurrencyCode;
  /** The window `load` was built over, for the subtitle. */
  horizonDays: number;
  /** False when `load` was built from a truncated book — a drill from it
   *  would only ever show some of an owner's accounts. Defaults to `true` so
   *  every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}

/**
 * Who is carrying the renewal book, and how much of theirs is at risk.
 *
 * A capacity question, not a leaderboard: one CSM holding two thirds of next
 * half's renewals is a staffing decision, and it is invisible on every other
 * tab. The red portion is expected loss (ARR × risk), so six shaky small
 * accounts and one shaky large one don't look the same — they aren't.
 *
 * Hand-drawn bars rather than Recharts. Each row is one number against one
 * scale with a label on either side; a charting library would add an axis, a
 * tooltip and a container height for a layout that is two divs and a
 * percentage.
 *
 * Each row is a real `<button>` rather than a chart segment behind a hidden
 * `DrillTargets` list — unlike the Recharts bars elsewhere on this tab, a
 * plain HTML bar is already reachable by mouse and keyboard alike once it is
 * an interactive element.
 */
export function OwnerLoadChart({
  load,
  currency,
  horizonDays,
  drillable = true,
}: OwnerLoadChartProps) {
  const { open } = useDrill();
  const widest = Math.max(1, ...load.map((entry) => entry.arr));

  // Two owners can share a display name (two CSMs both called "Sam Rivera"
  // is an ordinary thing), and `load` is now keyed on `ownerKey`, not the
  // name — so the accessible label has to disambiguate them too, or a
  // keyboard/screen-reader user can't tell which bar is which.
  const duplicateNames = new Set(
    [...new Set(load.map((entry) => entry.owner))].filter(
      (name) => load.filter((entry) => entry.owner === name).length > 1,
    ),
  );
  const labelFor = (entry: OwnerLoad) =>
    duplicateNames.has(entry.owner) ? `${entry.owner} (${entry.ownerKey})` : entry.owner;

  const openOwner = (entry: OwnerLoad, trigger: HTMLElement) => {
    open(
      {
        title: labelFor(entry),
        figure: formatCompactMoney(entry.arr, currency),
        source: { kind: 'rows', rows: fromHealthRows(entry.rows) },
      },
      trigger,
    );
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Renewal load by owner</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          ARR renewing in the next {horizonDays} days · the shaded part is expected loss
        </p>
        <ChartLegend
          className="mt-2"
          items={[
            { label: 'ARR renewing', color: ROLE.faint },
            { label: 'Expected loss', color: ROLE.loss },
          ]}
        />
      </div>

      {load.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">
          Nothing renews in this window.
        </p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-[10px]">
          {load.map((entry) => {
            const width = (entry.arr / widest) * 100;
            // Of the bar, not of the row — so the shaded part reads as "this
            // much of that owner's book", which is the comparison being made.
            const atRisk = entry.arr > 0 ? (entry.exposure / entry.arr) * 100 : 0;

            const body = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-medium text-ink truncate">{entry.owner}</span>
                  <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                    {formatCompactMoney(entry.arr, currency)} · {entry.count}{' '}
                    {entry.count === 1 ? 'renewal' : 'renewals'}
                  </span>
                </div>
                <div
                  className="mt-[3px] h-[10px] rounded-[3px] bg-subtle overflow-hidden"
                  aria-hidden="true"
                  title={`${formatMoney(entry.arr, currency)} renewing, ${formatMoney(entry.exposure, currency)} expected loss`}
                >
                  <div
                    className="h-full rounded-[3px] bg-ink-faint flex"
                    style={{ width: `${width}%` }}
                  >
                    <div className="h-full bg-danger/80" style={{ width: `${atRisk}%` }} />
                  </div>
                </div>
              </>
            );

            return (
              <li key={entry.ownerKey}>
                {drillable ? (
                  <button
                    type="button"
                    onClick={(event) => openOwner(entry, event.currentTarget)}
                    aria-label={`${labelFor(entry)} ${formatCompactMoney(entry.arr, currency)}, show accounts`}
                    className="w-full text-left rounded-md -m-1 p-1 cursor-pointer hover:bg-subtle transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {body}
                  </button>
                ) : (
                  // A plain row, not a dead button — the book behind this
                  // chart is truncated, so there is nothing a click here
                  // could honestly open.
                  <div className="w-full -m-1 p-1">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
