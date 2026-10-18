import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { fetchHistory, historyQuery } from '../../features/agents/bundlesApi';
import { BUNDLE, HISTORY, REJECT_REASONS, STATUS_WORD, bundleForText, finishedByText, historyFiltersOf, historyLinks, historyParams } from '../../features/agents/bundleText';
import { FINISHED_STATUSES, type HistoryFilters, type HistoryPayload } from '../../features/agents/bundleTypes';
import { AGENTS, AGENT_LABEL, KIND_LABEL, hiddenActivityText } from '../../features/agents/agentsText';
import { ACTION_KINDS, AGENT_KINDS, type SignalSource } from '../../features/agents/agentTypes';
import { bundleHref, dayText } from '../../features/work/feed';
import { BUTTON, Card, EmptyState, ErrorState, FOCUS, ListCard, LoadingState, NUM, QUIET, Select, TYPE } from '../../components/ui';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { CHANNEL_ICON, KIND_ICON } from '../../components/work/FeedRowParts';
import { StepLinks } from '../../components/work/StepLinks';
import { useFeedChanges } from '../../components/work/taskChanges';
import { OPENED_HERE } from '../../components/work/useTaskLink';
import { ApiError } from '../../lib/apiClient';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';

/** History (spec §8.1; frontend Decision 13): finished bundles the reader
 *  may read, newest change first, 50 a page, filtered in the URL. Review
 *  opens the panel read-only with each step's result, links and Undo. */
/** A message bundle's channel icon, as its queue row shows (Decision 4); else the bundle icon. */
function RowIcon({ channel }: { channel: SignalSource | null }) {
  const Icon = channel ? CHANNEL_ICON[channel] : KIND_ICON.bundle;
  return <Icon data-channel={channel ?? undefined} className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />;
}

export function HistoryPage() {
  const titleId = useId();
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const filters = historyFiltersOf(params);
  const key = historyQuery(filters);
  const filterLabel = useMediaQuery(SM) ? 'inline' : 'above';
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: HistoryPayload } | null>(null);
  const [failure, setFailure] = useState<{ key: string; text: string; status: number | null } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const paging = useRef(false);
  useFeedChanges(() => setAttempt((n) => n + 1));

  useEffect(() => {
    let alive = true;
    fetchHistory(historyFiltersOf(new URLSearchParams(key))).then(
      (data) => {
        if (!alive) return;
        setLoaded({ key, data });
        setFailure(null);
      },
      (err: unknown) => alive && setFailure({ key, text: errorMessage(err, HISTORY.LOAD), status: err instanceof ApiError ? err.status : null }),
    );
    return () => {
      alive = false;
    };
  }, [key, attempt]);

  const data = loaded && loaded.key === key ? loaded.data : null;
  const error = !data && failure && failure.key === key ? failure : null;

  // A page past the end (a 404) has a way out: page 1.
  useEffect(() => {
    if (error?.status === 404 && filters.page > 1) setParams(historyParams({ ...filters, page: 1 }, params), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error?.status, key]);
  useEffect(() => {
    if (!paging.current || !data) return;
    paging.current = false;
    headingRef.current?.focus();
  }, [data]);

  const choose = (change: Partial<HistoryFilters>) => setParams(historyParams({ ...filters, ...change, page: change.page ?? 1 }, params), { replace: true });
  const turn = (page: number) => {
    paging.current = true;
    choose({ page });
  };
  const filtered = filters.agent !== null || filters.step_kind !== null || filters.status !== null;

  let body: ReactNode;
  if (error)
    body = (
      <Card pad="none">
        <ErrorState message={error.text} onRetry={() => setAttempt((n) => n + 1)} />
      </Card>
    );
  else if (!data) body = <ListCard label={HISTORY.LOADING} state={<LoadingState label={HISTORY.LOADING} count={4} />} />;
  else if (data.results.length === 0)
    body = (
      <Card pad="none">
        {filtered ? (
          <EmptyState
            title={AGENTS.EMPTY_FILTERED_TITLE}
            action={
              <Link to={`/work?${historyParams({ agent: null, step_kind: null, status: null, page: 1 }, params).toString()}`} replace className={QUIET}>
                {AGENTS.CLEAR_FILTERS}
              </Link>
            }
          />
        ) : (
          <EmptyState title={HISTORY.EMPTY_TITLE} detail={HISTORY.EMPTY_DETAIL} />
        )}
      </Card>
    );
  else
    body = (
      <>
        <ListCard label={HISTORY.LIST}>
          {data.results.map((bundle) => {
            const by = finishedByText(bundle);
            // The reason only, never the note (it can name people or plans).
            const why = bundle.status === 'rejected' ? REJECT_REASONS.find((r) => r.value === bundle.reject_reason)?.label : undefined;
            return (
              <li key={bundle.id} data-bundle={bundle.id} className="flex items-start gap-3 px-4 py-3">
                <RowIcon channel={bundle.source.channel ?? null} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <h3 className={`${TYPE.body} break-words font-semibold`}>{bundle.title}</h3>
                  <p className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
                    <span className="font-semibold">{STATUS_WORD[bundle.status]}</span>
                    {why ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{why}</span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>{bundleForText(bundle)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{bundle.agent_label}</span>
                    {by ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{by}</span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span className={NUM}>{dayText(bundle.run_finished_at ?? bundle.updated_at)}</span>
                  </p>
                  <StepLinks links={historyLinks(bundle)} />
                  <Link to={bundleHref(pathname, params, bundle.id)} state={OPENED_HERE} aria-label={`${BUNDLE.REVIEW} ${bundle.title}`} className={`${BUTTON} self-start`}>
                    {BUNDLE.REVIEW}
                  </Link>
                </div>
              </li>
            );
          })}
        </ListCard>
        {data.previous || data.next ? (
          <div className="flex flex-wrap gap-2">
            {data.previous ? (
              <button type="button" onClick={() => turn(filters.page - 1)} className={BUTTON}>
                {AGENTS.PREVIOUS}
              </button>
            ) : null}
            {data.next ? (
              <button type="button" onClick={() => turn(filters.page + 1)} className={BUTTON}>
                {AGENTS.NEXT}
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  const hidden = data ? hiddenActivityText(data.hidden) : null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className={`${TYPE.title} ${FOCUS}`}>
          {HISTORY.LIST} {data ? <span className={`${TYPE.meta} ${NUM}`}>{data.count}</span> : null}
        </h2>
        <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2">
          <Select label={AGENTS.AGENT} labelPosition={filterLabel} value={filters.agent ?? ''} onChange={(value) => choose({ agent: (value || null) as HistoryFilters['agent'] })} options={[{ value: '', label: AGENTS.ALL_AGENTS }, ...AGENT_KINDS.map((kind) => ({ value: kind, label: AGENT_LABEL[kind] }))]} />
          <Select label={HISTORY.STEP_KIND} labelPosition={filterLabel} value={filters.step_kind ?? ''} onChange={(value) => choose({ step_kind: (value || null) as HistoryFilters['step_kind'] })} options={[{ value: '', label: HISTORY.ALL_STEP_KINDS }, ...ACTION_KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))]} />
          <Select label={AGENTS.STATUS} labelPosition={filterLabel} value={filters.status ?? ''} onChange={(value) => choose({ status: (value || null) as HistoryFilters['status'] })} options={[{ value: '', label: AGENTS.ALL_STATUSES }, ...FINISHED_STATUSES.map((value) => ({ value, label: STATUS_WORD[value] }))]} />
        </div>
      </div>
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
    </section>
  );
}
