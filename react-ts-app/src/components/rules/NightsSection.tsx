import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { fetchRun, fetchRuns } from '../../features/rules/ruleApi';
import { actionResultText, runParts, skipReasonText, waitingReviews } from '../../features/rules/ruleText';
import type { Rule, RunDetail, RunRow } from '../../features/rules/ruleTypes';
import { dayText, sentenceText } from '../../features/segments/ruleSentence';
import { recordHref } from '../../features/segments/segmentFields';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { BUTTON, CardHeader, EmptyState, ErrorState, FOCUS, ListCard, LoadingState, NUM, QUIET, TYPE } from '../ui';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Parts } from './Parts';

type Records = { key: number; detail: RunDetail | null; error: string | null };

/** One night's records, read when the night is opened: only those the
 *  reader may open now, fired first; the rest a count (spec §3). */
function RunRecords({ id, rule, runId }: { id: string; rule: Rule; runId: number }) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Records | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRun(rule.id, runId).then(
      (detail) => {
        if (alive) setLoad({ key: attempt, detail, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: attempt, detail: null, error: errorMessage(err, 'Could not load its records.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [rule.id, runId, attempt]);
  const current = load?.key === attempt ? load : null;

  return (
    <div id={id} className="flex flex-col gap-1 border-t border-line-subtle px-4 py-3">
      {!current ? <LoadingState label="Loading its records" count={2} /> : null}
      {current?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] leading-5 text-danger-ink">{current.error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={BUTTON}>
            Try again
          </button>
        </div>
      ) : null}
      {current?.detail ? (
        <>
          {current.detail.records.length > 0 ? (
            <ul aria-label={`Records on ${dayText(current.detail.run_on)}`} className="flex flex-col divide-y divide-line-subtle">
              {current.detail.records.map((record) => (
                <li key={`${record.kind}-${record.id}`} className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 ${TYPE.body}`}>
                  {record.name ? (
                    <Link to={recordHref(record.kind, record.id)} className={`inline-flex min-h-11 items-center font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
                      {record.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink-muted">A deleted record</span>
                  )}
                  <span className={TYPE.bodyMuted}>
                    {record.outcome === 'fired' ? record.actions.map(actionResultText).join(' · ') : skipReasonText(record, rule.cooldown_days)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={TYPE.bodyMuted}>No records you can open.</p>
          )}
          {current.detail.hidden_count > 0 ? (
            <p data-part="hidden" className={TYPE.meta}>
              <span className={NUM}>{current.detail.hidden_count}</span> more {current.detail.hidden_count === 1 ? 'record' : 'records'} you can't open.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function NightRow({ rule, run, startOpen }: { rule: Rule; run: RunRow; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const panelId = useId();
  return (
    <li data-run={run.id} className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          // The line's figures sit in their own span (for DM Mono), so the
          // browser's accessible-name computation drops the whitespace at
          // those span boundaries even though the line reads fine visually
          // and in `textContent`. An explicit label from the same parts
          // keeps the two in step.
          aria-label={sentenceText(runParts(run))}
          onClick={() => setOpen((now) => !now)}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left ${TYPE.body} sm:min-h-9 ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          <span>
            <Parts parts={runParts(run)} />
          </span>
        </button>
        {rule.is_owner && waitingReviews(run) > 0 ? (
          <Link to="/work?queue=mine&kind=approval" className={QUIET}>
            Review it
          </Link>
        ) : null}
      </div>
      {open ? <RunRecords id={panelId} rule={rule} runId={run.id} /> : null}
    </li>
  );
}

type Nights = { key: number; rows: RunRow[] | null; next: string | null; error: string | null };

/** The rule's nights (spec §2.3): rows, newest first, 20 a page under the
 *  server's cursor; each opens its records. `openRun` starts one open (the
 *  rule_fired link, plan Decision 15). */
export function NightsSection({ rule, openRun }: { rule: Rule; openRun: number | null }) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Nights | null>(null);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => {
    let alive = true;
    fetchRuns(rule.id, null).then(
      (page) => {
        if (alive) setLoad({ key: attempt, rows: page.results, next: page.next, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: attempt, rows: null, next: null, error: errorMessage(err, 'Could not load its nights.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [rule.id, attempt]);
  const current = load?.key === attempt ? load : null;

  async function showMore() {
    if (!current?.next || !current.rows) return;
    setMore({ busy: true, error: null });
    try {
      const page = await fetchRuns(rule.id, current.next);
      setLoad({ ...current, rows: [...current.rows, ...page.results], next: page.next });
      setMore({ busy: false, error: null });
    } catch (err) {
      setMore({ busy: false, error: errorMessage(err, 'Could not load more nights.') });
    }
  }

  return (
    <ListCard
      label="Nights"
      header={<CardHeader title="Nights" id={headingId} />}
      state={
        !current ? (
          <LoadingState label="Loading its nights" />
        ) : current.error ? (
          <ErrorState message={current.error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : current.rows && current.rows.length === 0 ? (
          <EmptyState
            title="No nights yet"
            detail={rule.is_active ? 'It runs tonight, after the scores and segments update.' : 'Turn it on and it runs tonight, after the scores and segments update.'}
          />
        ) : undefined
      }
      listRef={listRef}
      footer={
        current?.next ? <MoreButton next={current.next} loading={more.busy} error={more.error} label="Show more nights" onClick={() => void showMore()} list={listRef} /> : undefined
      }
    >
      {current?.rows?.map((run) => <NightRow key={run.id} rule={rule} run={run} startOpen={run.id === openRun} />)}
    </ListCard>
  );
}
