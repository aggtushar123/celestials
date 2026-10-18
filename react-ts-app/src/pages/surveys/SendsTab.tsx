import { useEffect, useState } from 'react';
import { fetchSends } from '../../features/surveys/surveyApi';
import type { SendListRow } from '../../features/surveys/surveyTypes';
import { BUTTON, EmptyState, ErrorState, ListCard, ListHeaderRow, LoadingState } from '../../components/ui';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { SendRow } from '../../components/surveys/SendRow';
import { SEND_GRID } from '../../components/surveys/sendGrid';

const EXPLAINER =
  "A survey emails one standard question, NPS, CSAT or CES, to the people at a segment's organisations, accounts or contacts. Each person gets a one-time link, and their answers update the scores you already read.";

type Answer = { key: number; rows: SendListRow[] | null; error: string | null };

/** The Sends tab (spec §2.1): every send the reader may read, newest first.
 *  It reads again when `reload` changes (the New survey modal closed). A
 *  failed reload keeps the last list on screen beside the error. */
export function SendsTab({ reload = 0 }: { reload?: number }) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [seen, setSeen] = useState(reload);
  if (seen !== reload) {
    setSeen(reload);
    setAttempt((n) => n + 1);
  }
  useEffect(() => {
    let alive = true;
    fetchSends().then(
      (rows) => {
        if (alive) setAnswer({ key: attempt, rows, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer((last) => ({ key: attempt, rows: last?.rows ?? null, error: errorMessage(err, 'Could not load surveys.') }));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const rows = answer?.rows ?? null;
  const error = answer?.key === attempt ? answer.error : null;
  const loading = answer?.key !== attempt;
  const retry = () => setAttempt((n) => n + 1);

  const state =
    error && (!rows || rows.length === 0) ? (
      <ErrorState message={error} onRetry={retry} />
    ) : !rows || (loading && rows.length === 0) ? (
      <LoadingState label="Loading surveys" count={4} />
    ) : rows.length === 0 ? (
      <EmptyState title="No surveys yet" detail={EXPLAINER} />
    ) : undefined;
  return (
    <div className="flex flex-col gap-2">
      {error && rows && rows.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] leading-5 text-danger-ink">{error} Showing the last result.</p>
          <button type="button" onClick={retry} className={BUTTON}>
            Try again
          </button>
        </div>
      ) : null}
      <div className="@container">
        <ListCard
          label="Survey sends"
          busy={loading}
          state={state}
          header={state ? undefined : <ListHeaderRow columns={SEND_GRID.columns} labels={SEND_GRID.labels} align={SEND_GRID.aligns} show={SEND_GRID.headerShow} />}
        >
          {rows?.map((row) => <SendRow key={row.id} row={row} />)}
        </ListCard>
      </div>
    </div>
  );
}
