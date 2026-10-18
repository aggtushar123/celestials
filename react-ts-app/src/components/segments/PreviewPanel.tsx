import { useId } from 'react';
import { KIND_NOUN } from '../../features/segments/segmentFields';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { summaryFigures } from '../../features/segments/summaryFigures';
import { LoadingState, NUM, TYPE } from '../ui';
import type { PreviewState } from './usePreview';

/** Beside the rules (stacked on phones): "41 organisations match", the
 *  first ten, and the totals (spec §3). */
export function PreviewPanel({ kind, state }: { kind: SegmentKind; state: PreviewState }) {
  const headingId = useId();
  const noun = KIND_NOUN[kind];
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? state.last : null;
  let body;
  if (state.status === 'incomplete') {
    body = <p className={TYPE.bodyMuted}>Finish each condition to see who matches.</p>;
  } else if (state.status === 'error') {
    body = <p className={TYPE.bodyMuted}>Fix the rules to see who matches.</p>;
  } else if (!data) {
    body = <LoadingState label="Loading preview" />;
  } else {
    // The count above already says how many: no Members figure under it.
    const figures = summaryFigures(data.summary, kind).filter((figure) => figure.key !== 'members');
    body = (
      <div className={`flex flex-col gap-3 ${state.status === 'loading' ? 'opacity-60' : ''}`}>
        <p data-part="match-count" className={`flex items-baseline gap-1.5 ${TYPE.bodyMuted}`}>
          <span className={`${TYPE.display} ${NUM}`}>{data.count}</span> {data.count === 1 ? noun.one : noun.many} match
        </p>
        {figures.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            {figures.map((figure) => (
              <div key={figure.key}>
                <dt className={TYPE.meta}>{figure.label}</dt>
                <dd className={`${TYPE.body} ${NUM}`}>{figure.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {data.results.length > 0 ? (
          <ul aria-label="First matches" className="flex flex-col divide-y divide-line-subtle border-t border-line-subtle">
            {data.results.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-2 py-1.5">
                <span className={`truncate ${TYPE.body}`}>{row.name}</span>
                <span className={`shrink-0 truncate ${TYPE.meta}`}>
                  {'role' in row ? `${row.role} · ${row.parent.name}` : (row.owner?.name ?? 'Unassigned')}
                </span>
              </li>
            ))}
          </ul>
        ) : data.count === 0 ? (
          <p className={`border-t border-line-subtle pt-2 ${TYPE.bodyMuted}`}>Nothing matches these rules yet.</p>
        ) : null}
        {data.count > data.results.length ? (
          <p className={TYPE.meta}>
            and <span className={NUM}>{data.count - data.results.length}</span> more
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <section aria-labelledby={headingId} aria-busy={state.status === 'loading'} className="flex min-w-0 flex-col gap-3 border-t border-line-subtle pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <h2 id={headingId} className={TYPE.title}>
        Preview
      </h2>
      {/* One region for the whole life of the panel: only its words change. */}
      <p role="status" className="sr-only">
        {state.status === 'ready' ? `${state.data.count} ${state.data.count === 1 ? noun.one : noun.many} match` : ''}
      </p>
      {body}
    </section>
  );
}
