/**
 * The line under each AI-taxonomy chart saying how much of the book it covers.
 *
 * The three taxonomy charts count only interactions something has classified
 * (see the backend's `classify_interactions`). Without this note, a dashboard on
 * a database where classification hasn't run yet shows three convincing,
 * nearly-empty charts and no hint why — the same class of lie as a chart with a
 * silently clipped axis.
 *
 * Silent when everything in scope is classified, which is the normal state.
 */
export function UnclassifiedNote({ classified, total }: { classified: number; total: number }) {
  const unclassified = total - classified;
  if (unclassified <= 0) return null;

  return (
    <p className="mt-2 text-[11px] text-ink-faint shrink-0">
      {classified.toLocaleString()} of {total.toLocaleString()} classified —{' '}
      {unclassified.toLocaleString()} not yet counted here.
    </p>
  );
}
