import type { ReactNode } from 'react';

/** Loading, error, empty and truncated, worded once for every dashboard view.
 *  Generalised from Health's own set so eight views stop describing the same
 *  outage eight ways. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="px-2 py-10 text-center text-[13px] text-ink-muted">
      {label}
    </p>
  );
}

export function ErrorState({
  message,
  detail = 'Nothing is shown rather than a partial picture.',
}: {
  message: string;
  detail?: string;
}) {
  return (
    <div role="alert" className="px-2 py-10 text-center">
      <p className="text-[13px] font-semibold text-danger">{message}</p>
      <p className="text-[11px] text-ink-muted mt-1">{detail}</p>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <p className="px-2 py-10 text-center text-[13px] text-ink-muted">{label}</p>;
}

export function TruncatedNotice({ children }: { children: ReactNode }) {
  return <p className="px-2 text-[11px] text-warning font-semibold">{children}</p>;
}
