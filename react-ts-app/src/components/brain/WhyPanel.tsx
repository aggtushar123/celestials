import { Sparkles } from 'lucide-react';
import { fetchExplanation, writeExplanation } from '../../features/brain/brainApi';
import { hiddenText, SAY } from '../../features/brain/brainText';
import type { ScopeExplanation, ScopeKey } from '../../features/brain/brainTypes';
import { BUTTON, NUM, TYPE } from '../ui';
import { useKept } from './useKept';

/** Why one signal moved, for this scope (spec §2.3 item 3): the kept
 *  explanation, or Explain this. A flat block inside its row, not a card. */
export function WhyPanel({ metric, label, scope, onRefused }: { metric: string; label: string; scope: ScopeKey; onRefused: (err: unknown) => boolean }) {
  const kept = useKept<ScopeExplanation>({
    read: () => fetchExplanation(metric, scope).then((p) => p.explanation),
    write: () => writeExplanation(metric, scope).then((p) => p.explanation),
    onRefused,
    readFallback: SAY.LOAD_EXPLANATION,
    writeFallback: SAY.EXPLAIN_FAILED,
  });
  const explanation = kept.value;
  const hidden = explanation ? hiddenText(explanation.hidden) : null;
  // Never offer a write beside a failed read (I1): "None yet" only means a
  // successful read with nothing kept, not a read that errored.
  const offerWrite = (explanation === null && !kept.loadError) || Boolean(explanation?.stale);

  return (
    <div id={`why-${metric}`} role="region" aria-label={`Why ${label} moved`} className="flex flex-col gap-2 border-t border-line-subtle bg-subtle px-4 py-3">
      {explanation === undefined && !kept.loadError ? (
        <div role="status" aria-label="Loading the explanation" className="flex flex-col gap-1.5">
          <span aria-hidden="true" className="block h-3 w-3/4 motion-safe:animate-pulse rounded bg-line-subtle" />
          <span aria-hidden="true" className="block h-3 w-1/2 motion-safe:animate-pulse rounded bg-line-subtle" />
        </div>
      ) : null}
      {kept.loadError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className={TYPE.bodyMuted}>{kept.loadError}</p>
          <button type="button" onClick={kept.retry} className={BUTTON}>
            Try again
          </button>
        </div>
      ) : null}
      {explanation ? (
        <>
          <p className={`max-w-[68ch] ${TYPE.body}`}>{explanation.text}</p>
          {explanation.evidence.length ? (
            <ul aria-label="Figures used" className="flex flex-col gap-0.5">
              {explanation.evidence.map((line, index) => (
                <li key={`${index}-${line}`} className={`${TYPE.meta} ${NUM}`}>
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {hidden ? <p className={TYPE.meta}>{hidden}</p> : null}
          {explanation.stale ? <p className={TYPE.meta}>{SAY.STALE_EXPLANATION}</p> : null}
        </>
      ) : null}
      {offerWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={kept.save} disabled={kept.writing} className={BUTTON}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {kept.writing ? SAY.EXPLAINING : explanation ? SAY.EXPLAIN_AGAIN : SAY.EXPLAIN}
          </button>
          <span className={TYPE.meta}>{SAY.CREDITS}</span>
        </div>
      ) : null}
      {kept.writeError ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {kept.writeError}
        </p>
      ) : null}
    </div>
  );
}
