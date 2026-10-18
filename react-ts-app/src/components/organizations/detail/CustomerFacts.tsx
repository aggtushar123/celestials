import { useId, type ReactNode } from 'react';
import type { CsatBreakdown, Customer } from '../../../features/customers/customersSlice';
import { mailtoHref } from '../../../lib/contactLinks';
import { BUTTON, FOCUS, LoadingState, NUM, TYPE } from '../../ui';

/** Bands run best to worst; the tone follows the band, not the customer. */
const BAND_TONE: Record<string, string> = {
  very_satisfied: 'bg-success',
  satisfied: 'bg-success',
  neutral: 'bg-warning',
  dissatisfied: 'bg-danger',
  very_dissatisfied: 'bg-danger',
};

/** Label, bar, then count · share in a fixed, right-aligned column. */
const BAND_ROW = 'grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_7rem]';

const LINK = `flex min-h-11 min-w-0 max-w-full items-center truncate rounded-sm text-ink underline sm:min-h-0 ${FOCUS}`;

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{term}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </>
  );
}

export function CsatSpread({ breakdown }: { breakdown: CsatBreakdown }) {
  const { responses, bands } = breakdown;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-ink">
        <span className={NUM}>{responses}</span> <span>CSAT responses</span>
      </p>
      {responses === 0 ? (
        <p className="text-[13px] text-ink-muted">No CSAT survey has been answered yet.</p>
      ) : (
        <ul aria-label="CSAT responses by band" className="flex flex-col gap-1.5">
          {bands.map((band) => (
            // One template for every row, the count column a fixed width, so
            // every bar starts and ends at the same x whatever the counts say.
            <li key={band.key} className={`${BAND_ROW} items-center gap-3 text-[13px]`}>
              <span className="truncate text-ink-muted">{band.label}</span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
                <span data-share="" className={`block h-full ${BAND_TONE[band.key] ?? 'bg-line-strong'}`} style={{ width: `${band.share}%` }} />
              </span>
              <span data-count="" className={`text-right ${NUM} text-ink`}>
                {band.count} · {band.share}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What GET /customers/{id}/ adds to the List's row (spec §2) that none of
 *  the six panels shows: how to reach the organization, its industry, and
 *  how its answered CSAT surveys spread (the Voice panel has the score
 *  only). Under the panels, divided like them, in the same surface. */
export function CustomerFacts({
  customer,
  error,
  stacked,
  onRetry,
}: {
  customer: Customer | null;
  error: string | null;
  /** One column at every width (phones). */
  stacked: boolean;
  onRetry: () => void;
}) {
  const headingId = useId();
  const phoneHref = customer?.phone ? `tel:${customer.phone.replace(/[^\d+]/g, '')}` : '';
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-line-subtle px-4 py-4">
      <h3 id={headingId} className={TYPE.label}>
        Contact and CSAT
      </h3>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-danger-ink">{error}</p>
          <button type="button" onClick={onRetry} className={BUTTON}>
            Try again
          </button>
        </div>
      ) : !customer ? (
        <LoadingState label="Loading contact details and CSAT" variant="block" />
      ) : (
        // The panels' grid above (AccountDetails): halves at md, thirds at xl,
        // where contact takes the first third and CSAT the other two.
        <div data-facts="" className={`grid gap-x-8 gap-y-4 ${stacked ? '' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] content-start gap-x-3 gap-y-1.5 text-[13px]">
            <Fact term="Email">
              {customer.email && !mailtoHref(customer.email) ? (
                customer.email
              ) : customer.email ? (
                <a href={mailtoHref(customer.email) ?? undefined} className={LINK}>
                  {customer.email}
                </a>
              ) : (
                '—'
              )}
            </Fact>
            <Fact term="Phone">
              {customer.phone ? (
                <a href={phoneHref} className={LINK}>
                  {customer.phone}
                </a>
              ) : (
                '—'
              )}
            </Fact>
            <Fact term="Industry">{customer.industry || '—'}</Fact>
          </dl>
          <div data-csat="" className={`min-w-0 ${stacked ? '' : 'xl:col-span-2'}`}>
            <CsatSpread breakdown={customer.csat_breakdown} />
          </div>
        </div>
      )}
    </section>
  );
}
