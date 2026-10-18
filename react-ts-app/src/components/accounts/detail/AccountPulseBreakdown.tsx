import type { AccountPulse, AccountPulseReading } from '../../../features/customers/customersSlice';
import { BREAKDOWN_ROW, band } from '../../organizations/detail/breakdownBands';
import { NUM } from '../../ui';
import { BreakdownPanel } from '../../organizations/detail/HealthBreakdown';

function Reading({ reading }: { reading: AccountPulseReading }) {
  const parsed = reading.reading == null ? NaN : Number(reading.reading);
  // Number.isFinite, not a null check: a non-numeric reading (bad data, not
  // "nothing to measure") must read as no reading too, never a "Poor" band
  // with a NaN-width bar.
  const value = Number.isFinite(parsed) ? parsed : null;
  // A 1–5 reading's share of the scale, in the rubric's own bands.
  const ratio = value == null ? null : (value - 1) / 4;
  const tone = ratio == null ? null : band(ratio);
  return (
    <li className="flex flex-col gap-0.5">
      <div className={`${BREAKDOWN_ROW} ${tone ? '' : 'text-ink-muted'}`}>
        <span className={`truncate ${tone ? 'text-ink' : ''}`}>{reading.label}</span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
          {tone && ratio != null ? <span className={`block h-full ${tone.bar}`} style={{ width: `${ratio * 100}%` }} /> : null}
        </span>
        {tone ? (
          <span className="text-ink-muted">
            <span className={`${NUM} text-ink`}>{reading.reading}</span>/5 · {tone.word}
          </span>
        ) : (
          <span>No data</span>
        )}
      </div>
      <p className="text-[11px] text-ink-muted">{reading.note}</p>
    </li>
  );
}

/** What the Health tile opens on an account (decision 3): an account's
 *  health is set on the account with no component rubric, so the per-signal
 *  view it has is its pulse (`account_pulse` from GET /accounts/<id>/: AI
 *  pulse, CSM pulse, recent sentiment, last contact, open tickets). */
export function AccountPulseBreakdown({ id, pulse, error }: { id: string; pulse: AccountPulse | null; error: string | null }) {
  return (
    <BreakdownPanel id={id} label="Account pulse" error={error}>
      {pulse ? (
        <>
          <p className="mb-2 text-[13px] text-ink">
            Account pulse: <span className="font-semibold">{pulse.label}</span>
            {pulse.value ? (
              <>
                {' · '}
                <span className={NUM}>{pulse.value}</span> / 5
              </>
            ) : null}
          </p>
          {pulse.breakdown.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No signals measured yet.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {pulse.breakdown.map((reading) => (
                  <Reading key={reading.key} reading={reading} />
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-muted">
                An account has no health rubric: its score is set on the account. These are the signals behind how the relationship feels
                now.
              </p>
            </>
          )}
        </>
      ) : null}
    </BreakdownPanel>
  );
}
