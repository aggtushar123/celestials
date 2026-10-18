import { useCallback, useEffect, useState } from 'react';
import { ASKER_LABEL, fetchEvals, type EvalResult, type EvalsPayload } from '../../features/agents/evalsApi';
import { formatDate } from '../../features/customers/formatters';
import { CODE, EmptyState, ErrorState, LoadingState, META_DANGER, MetaParts, NUM, SettingsSection, TYPE } from '../../components/ui';

const LIST = 'Golden questions';

/** Failed first, then the rest, each in the golden set's order. */
const ordered = (results: EvalResult[]) => [...results.filter((r) => !r.passed), ...results.filter((r) => r.passed)];

function Row({ result }: { result: EvalResult }) {
  const status = result.skipped ? 'Skipped' : result.passed ? 'Passed' : 'Failed';
  return (
    <li data-case={result.id} className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`${TYPE.body} min-w-0 flex-1 font-semibold`}>{result.question}</p>
        <span className={result.passed || result.skipped ? TYPE.meta : `${META_DANGER} font-semibold`}>{status}</span>
      </div>
      <p className={TYPE.meta}>
        <MetaParts
          parts={[
            result.kind,
            result.asker ? ASKER_LABEL[result.asker] : '',
            result.correct !== undefined ? `Correct ${result.correct}/2` : '',
            result.grounded !== undefined ? `Grounded ${result.grounded}/2` : '',
            result.private === false ? 'Revealed private data' : '',
          ].filter(Boolean)}
        />
      </p>
      {result.reason ? <p className={TYPE.bodyMuted}>{result.reason}</p> : null}
      {result.answer ? (
        <details className="mt-1">
          <summary className={`${TYPE.meta} cursor-pointer select-none`}>Copilot's answer</summary>
          <p className={`${TYPE.bodyMuted} mt-1 max-w-[68ch] whitespace-pre-wrap`}>{result.answer}</p>
        </details>
      ) : null}
    </li>
  );
}

/**
 * Answer quality (Google's "measure before you cut", owner 2026-10-16):
 * Copilot answers a fixed golden set the way people get it, and a stronger
 * model grades each answer against the data Copilot was given. The newest
 * run, failed questions first, with how the last runs went.
 */
export function AnswerQuality() {
  const [data, setData] = useState<EvalsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchEvals()
      .then(setData)
      .catch(() => setError("Couldn't load answer quality."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const description = 'Copilot answers a fixed set of questions the way people get them; a stronger model grades each against the data Copilot was given.';
  if (error) return <SettingsSection title="Answer quality" description={description} state={<ErrorState message={error} onRetry={load} />} />;
  if (!data) return <SettingsSection title="Answer quality" description={description} state={<LoadingState label="Loading answer quality" />} />;
  const run = data.run;
  if (!run) {
    return (
      <SettingsSection
        title="Answer quality"
        description={description}
        state={<EmptyState title="Not measured yet." detail={<>Runs with <code className={CODE}>run_copilot_evals</code>.</>} />}
      />
    );
  }
  const earlier = data.history.slice(1, 6);
  return (
    <SettingsSection
      title="Answer quality"
      description={
        <>
          <span className={`${TYPE.body} font-semibold text-ink ${NUM}`}>
            {run.passed} of {run.total} passed
          </span>
          <span className={`block ${TYPE.meta}`}>
            <MetaParts
              parts={[
                formatDate(run.started_at.slice(0, 10)),
                run.model ? `Copilot ${run.model}` : '',
                run.judge_model ? `Judged by ${run.judge_model}` : '',
                earlier.length ? `Earlier: ${earlier.map((h) => `${h.passed}/${h.total}`).join(', ')}` : '',
              ].filter(Boolean)}
            />
          </span>
        </>
      }
      list={LIST}
    >
      {ordered(run.results).map((result) => (
        <Row key={result.id} result={result} />
      ))}
    </SettingsSection>
  );
}
