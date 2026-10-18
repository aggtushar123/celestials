import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { ForecastScenarios } from '../../../../../features/forecast/forecastSlice';
import { formatCompactMoney, formatMoney } from '../../../../../features/customers/formatters';
import { zeroMoney } from '../../../shared/chartAxis';

export interface ScenarioRangeProps {
  scenarios: ForecastScenarios;
  opening: number;
  currency: CurrencyCode;
}

/**
 * Worst, likely and best on one scale, because a forecast is a range.
 *
 * A single number invites a precision nobody has. The three are built from the
 * same book: worst loses every renewal that falls inside the window and every
 * open risk, and closes nothing; best loses nothing and closes the whole
 * pipeline; likely is the weighted bridge beside it.
 *
 * Opening ARR is marked on the same scale, so "are we forecasting growth or
 * shrinkage" is one glance rather than two subtractions.
 *
 * Hand-drawn rather than a chart library: it is one axis, three points and a
 * marker, and a charting component would need a container height and an axis
 * config to draw less.
 */
export function ScenarioRange({ scenarios, opening, currency }: ScenarioRangeProps) {
  const top = Math.max(scenarios.best, opening) || 1;

  const position = (value: number) => Math.max(0, Math.min(100, (value / top) * 100));
  const pct = (value: number) => `${position(value)}%`;
  /** A caption centred on its marker, but held inside the track at either
   *  end so "Worst" near zero or "Best" at the far right never clips. */
  const anchor = (value: number) => {
    const at = position(value);
    return at < 8 ? 'translate-x-0' : at > 92 ? '-translate-x-full' : '-translate-x-1/2';
  };

  const points = [
    { key: 'worst', label: 'Worst', value: scenarios.worst, tone: 'bg-danger' },
    { key: 'likely', label: 'Likely', value: scenarios.likely, tone: 'bg-ink' },
    { key: 'best', label: 'Best', value: scenarios.best, tone: 'bg-success' },
  ];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Forecast range</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          Worst loses every renewal in the window and closes nothing · best loses nothing and
          closes all open pipeline
        </p>
      </div>

      <div className="px-4 pt-4 pb-3">
        <div
          role="img"
          aria-label={`Forecast range from ${formatMoney(scenarios.worst, currency)} to ${formatMoney(
            scenarios.best,
            currency,
          )}, likely ${formatMoney(scenarios.likely, currency)}, today ${formatMoney(opening, currency)}`}
        >
          {/* Today sits above the track so its caption never meets the
              scenario captions below it. */}
          <div className="relative h-4">
            <span
              className={`absolute bottom-0.5 text-[11px] font-semibold text-ink-muted whitespace-nowrap ${anchor(opening)}`}
              style={{ left: pct(opening) }}
            >
              Today
            </span>
          </div>
          <div className="relative h-[26px] rounded-[4px] bg-subtle">
            <div
              className="absolute inset-y-0 bg-ink/10"
              style={{ left: pct(scenarios.worst), right: `calc(100% - ${pct(scenarios.best)})` }}
            />
            {points.map((point) => (
              <div
                key={point.key}
                className={`absolute inset-y-0 -translate-x-1/2 ${point.key === 'likely' ? 'w-[3px]' : 'w-0.5'} ${point.tone}`}
                style={{ left: pct(point.value) }}
              />
            ))}
            {/* Where the book stands today, on the same scale, dashed so it
                is never read as the likely marker beside it. */}
            <div
              data-testid="range-today"
              className="absolute -inset-y-1 -translate-x-1/2 border-l border-dashed border-ink"
              style={{ left: pct(opening) }}
            />
          </div>
          <div className="relative h-4 mt-0.5">
            {points.map((point) => (
              <span
                key={point.key}
                className={`absolute top-0 text-[11px] font-semibold text-ink-muted whitespace-nowrap ${anchor(point.value)}`}
                style={{ left: pct(point.value) }}
              >
                {point.label}
              </span>
            ))}
          </div>
        </div>

        <div
          data-testid="range-scale"
          className="flex items-baseline justify-between mt-1 text-[11px] text-ink-faint tabular-nums"
        >
          <span>{zeroMoney(currency)}</span>
          <span>{formatCompactMoney(top, currency)}</span>
        </div>

        <dl aria-label="Scenarios" className="grid grid-cols-3 gap-2 mt-3">
          {points.map((point) => (
            <div key={point.key}>
              <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                <span className={`w-2 h-2 rounded-[2px] ${point.tone}`} aria-hidden />
                {point.label}
              </dt>
              <dd className="text-[15px] font-semibold text-ink tabular-nums mt-[2px]">
                {formatCompactMoney(point.value, currency)}
              </dd>
              <dd className="text-[11px] text-ink-muted tabular-nums">
                {opening > 0 ? `${Math.round((point.value / opening) * 100)}% of today` : '—'}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
