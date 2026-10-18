import type { ReactNode } from 'react';
import type { Customer, HealthComponent } from '../../../features/customers/customersSlice';
import { Card, LoadingState, NUM } from '../../ui';
import { BREAKDOWN_ROW, band } from './breakdownBands';

function Row({ component }: { component: HealthComponent }) {
  if (!component.available || component.ratio == null) {
    return (
      <li className={`${BREAKDOWN_ROW} text-ink-muted`}>
        <span className="truncate">{component.label}</span>
        <span aria-hidden="true" className="h-1.5 rounded-full bg-line" />
        <span>No data</span>
      </li>
    );
  }
  const tone = band(component.ratio);
  return (
    <li className={BREAKDOWN_ROW}>
      <span className="truncate text-ink">{component.label}</span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
        <span className={`block h-full ${tone.bar}`} style={{ width: `${component.ratio * 100}%` }} />
      </span>
      <span className="text-ink-muted">
        <span className={`${NUM} text-ink`}>
          {component.points}/{component.weight}
        </span>{' '}
        · {tone.word}
      </span>
    </li>
  );
}

/** The panel the Health tile opens, on either detail page: its failure, a
 *  skeleton while the record reads, or what it breaks health into. */
export function BreakdownPanel({
  id,
  label,
  error,
  children,
}: {
  id: string;
  /** "Health breakdown", "Account pulse": the region's name. */
  label: string;
  error: string | null;
  /** What it shows; null while the record reads. */
  children: ReactNode | null;
}) {
  return (
    <Card as="section" id={id} aria-label={label}>
      {error ? (
        <p role="alert" className="text-[13px] text-danger-ink">
          {error}
        </p>
      ) : children === null ? (
        <LoadingState label={`Loading the ${label.toLowerCase()}`} variant="block" />
      ) : (
        children
      )}
    </Card>
  );
}

/** What the health score is made of: the five rubric components from
 *  `/customers/{id}/`'s `health_breakdown`, each as points of its weight. */
export function HealthBreakdown({ id, customer, error }: { id: string; customer: Customer | null; error: string | null }) {
  return (
    <BreakdownPanel id={id} label="Health breakdown" error={error}>
      {customer ? <Components customer={customer} /> : null}
    </BreakdownPanel>
  );
}

function Components({ customer }: { customer: Customer }) {
  const rows = customer.health_breakdown;
  const measured = rows.filter((c) => c.available).length;
  const unmeasured = rows.length - measured;
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {rows.map((component) => (
          <Row key={component.key} component={component} />
        ))}
      </ul>
      {customer.health_score_is_overridden ? (
        <p className="mt-2 text-[11px] text-ink-muted">
          This score was set by hand. The components are what the calculation would have given.
        </p>
      ) : unmeasured > 0 ? (
        <p className="mt-2 text-[11px] text-ink-muted">
          Scored on the {measured} components with data; {unmeasured === 1 ? 'the other is' : `the other ${unmeasured} are`} left
          out rather than counted as zero.
        </p>
      ) : null}
    </>
  );
}
