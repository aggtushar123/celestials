// Brain > Feature Requests: what customers keep asking for, ranked by the
// revenue behind it rather than by who shouted loudest.
//
// Every row is a cluster of classified asks (see revenact-backend
// services/requests). The figures are the reader's own: a CSM sees the
// weight of their book behind an ask, leadership sees all of it.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Inbox, Info, Sparkles } from 'lucide-react';
import { useAppSelector, useCapability } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import { formatCompactMoney, formatMoney } from '../../features/customers/formatters';
import { fetchRequest, fetchRequests, gatherRequests, updateRequest } from '../../features/requests/requestsApi';
import { STATUS_LABELS } from '../../features/requests/types';
import type { FeatureRequestFull, FeatureRequestRow, RequestStatus } from '../../features/requests/types';
import type { CurrencyCode } from '../../features/auth/authSlice';
import { Figured } from '../../components/brain/Figured';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { BrainBackLink } from '../../components/brain/BrainBackLink';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { useBrainScope } from '../../components/brain/useBrainScope';
import {
  Badge,
  type BadgeTone,
  Card,
  EmptyState as UiEmptyState,
  ErrorState as UiErrorState,
  FilterChip,
  FilterChipRow,
  FOCUS,
  ListCard,
  ListRow,
  LoadingState,
  NUM,
  PRIMARY,
  QUIET,
  Select,
  TYPE,
} from '../../components/ui';
import { asksEmpty, CS } from '../../features/brain/customersText';
import type { ScopeKey } from '../../features/brain/brainTypes';

const FILTERS: (RequestStatus | 'all')[] = ['all', 'open', 'planned', 'shipped', 'declined'];
const STATUS_TONE: Record<RequestStatus, BadgeTone> = { open: 'neutral', planned: 'info', shipped: 'success', declined: 'neutral' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-15T09:00:00Z" → "15 Sep 2026", read off the string so the day never shifts. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function filed(created: number, linked: number): string {
  const made = created === 1 ? '1 new request' : `${created} new requests`;
  const from = linked === 1 ? '1 ask' : `${linked} asks`;
  return `${made} from ${from}`;
}

/** What a gather that stopped part-way still managed to file, if anything. */
function partial(err: unknown): string {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null) return '';
  const body = err.body as { created?: number; linked?: number };
  if (!body.created && !body.linked) return '';
  return ` ${filed(body.created ?? 0, body.linked ?? 0)} was still filed.`;
}

function trend(row: Pick<FeatureRequestRow, 'last_90_days' | 'previous_90_days'>): string {
  const { last_90_days: now, previous_90_days: before } = row;
  if (now === 0 && before === 0) return 'No asks in six months';
  if (before === 0) return `${now} in the last 90 days`;
  const change = now - before;
  if (change === 0) return `${now} in the last 90 days, steady`;
  return `${now} in the last 90 days, ${change > 0 ? 'up' : 'down'} from ${before}`;
}

export function FeatureRequestsPage() {
  const currency = useAppSelector((s) => s.auth.user?.organisation.currency ?? 'USD');
  const mayCurate = useCapability('view_all_accounts');
  const brain = useBrainScope();
  const scope = brain.scope;
  const { refused } = brain;
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; rows: FeatureRequestRow[] } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [gathering, setGathering] = useState(false);
  const [gatherNote, setGatherNote] = useState<string | null>(null);
  const [gatherError, setGatherError] = useState<string | null>(null);

  // Customers spec §2.2: read only once ?scope= settles, keyed by scope so a
  // switch drops to the skeleton rather than showing the last view's rows.
  const key = scope ? `${scope}:${filter}#${attempt}` : null;
  const rows = key !== null && loaded?.key === key ? loaded.rows : null;
  const error = key !== null && failed?.key === key ? failed.message : null;
  const shownError = brain.error ?? error;

  useEffect(() => {
    if (!scope || key === null) return;
    let cancelled = false;
    fetchRequests(filter, scope)
      .then((next) => {
        if (cancelled) return;
        if (!Array.isArray(next)) throw new Error('unexpected response');
        setLoaded({ key, rows: next });
      })
      .catch((err) => {
        if (cancelled || refused(err)) return;
        setFailed({ key, message: errorText(err, 'Could not load feature requests.') });
      });
    return () => {
      cancelled = true;
    };
  }, [filter, key, scope, refused]);

  const refusedDetail = useCallback(
    (err: unknown) => {
      if (!refused(err)) return false;
      setOpenId(null);
      return true;
    },
    [refused],
  );

  async function gather() {
    setGathering(true);
    setGatherNote(null);
    setGatherError(null);
    try {
      const result = await gatherRequests();
      const made = filed(result.created, result.linked);
      setGatherNote(result.remaining > 0 ? `${made}, ${result.remaining} left for tonight` : made);
      setAttempt((n) => n + 1);
    } catch (err) {
      setGatherError(`${errorText(err, 'Could not gather asks.')}${partial(err)}`);
      // A stopped gather keeps what it had already filed, so the list has
      // moved on even though the run failed.
      setAttempt((n) => n + 1);
    } finally {
      setGathering(false);
    }
  }

  if (openId !== null && scope) {
    return (
      <RequestDetail
        key={openId}
        id={openId}
        scope={scope}
        currency={currency}
        mayCurate={mayCurate}
        onBack={() => setOpenId(null)}
        onChanged={() => setAttempt((n) => n + 1)}
        onRefused={refusedDetail}
      />
    );
  }

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <BrainBackLink to="/brain/customers" scope={scope} label={CS.BACK} />
          <h2 className={TYPE.title}>Feature Requests</h2>
          <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>
            What customers keep asking for, with the revenue behind it. Built from the asks the classifier already found in
            your emails, tickets and calls.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {mayCurate && (
            <button type="button" onClick={gather} disabled={gathering} className={`${PRIMARY} shrink-0`}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {gathering ? 'Gathering…' : 'Gather asks'}
            </button>
          )}
        </div>
      </div>
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}

      {!mayCurate && (
        <p className={`flex items-start gap-2 ${TYPE.bodyMuted}`}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          These figures count only the companies you can open, so they are the weight of your own book behind each ask.
        </p>
      )}
      {/* Always mounted, sr-only while empty: a live region announces only
          changes to a node that was already there. */}
      <p data-part="gather-status" className={gatherNote ? TYPE.bodyMuted : 'sr-only'} role="status">
        {gatherNote ?? ''}
      </p>
      {gatherError && (
        <p className="text-[13px] leading-5 text-danger-ink" role="alert">
          {gatherError}
        </p>
      )}

      <FilterChipRow label="Status">
        {FILTERS.map((option) => (
          <FilterChip key={option} label={option === 'all' ? 'All' : STATUS_LABELS[option]} pressed={filter === option} onToggle={() => setFilter(option)} />
        ))}
      </FilterChipRow>

      {shownError ? (
        <Card pad="none">
          <UiErrorState message={shownError} onRetry={brain.error ? brain.retry : () => setAttempt((n) => n + 1)} />
        </Card>
      ) : rows === null ? (
        <ListCard label="Feature requests" state={<LoadingState label="Loading feature requests" count={3} />} />
      ) : rows.length === 0 ? (
        <Card pad="none">
          <UiEmptyState
            icon={Inbox}
            /* Minor #5: scope-aware, so a view_all_accounts reader in Me isn't
               told there are none when the company has requests. */
            title={scope ? asksEmpty(scope) : 'No feature requests yet.'}
            detail={
              mayCurate
                ? 'Gather the asks the classifier tagged and they will be grouped and named here.'
                : 'Nothing has been gathered yet, or none of the asks came from companies you can open.'
            }
          />
        </Card>
      ) : (
        <ListCard label="Feature requests">
          {rows.map((row) => (
            <RequestRow key={row.id} row={row} currency={currency} onOpen={setOpenId} />
          ))}
        </ListCard>
      )}
    </BrainFrame>
  );
}

function RequestRow({
  row,
  currency,
  onOpen,
}: {
  row: FeatureRequestRow;
  currency: CurrencyCode;
  onOpen: (id: number) => void;
}) {
  return (
    <li data-row={row.id} className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onOpen(row.id)}
            aria-label={`Open ${row.title}`}
            className={`inline-flex min-h-11 items-center rounded-sm text-left ${TYPE.body} font-semibold hover:underline sm:min-h-9 ${FOCUS}`}
          >
            {row.title}
          </button>
          {row.summary && <p className={`line-clamp-2 max-w-[68ch] ${TYPE.bodyMuted}`}>{row.summary}</p>}
        </div>
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
      </div>
      <p className={TYPE.bodyMuted} title={formatMoney(row.arr, currency)}>
        <Figured
          text={`${formatCompactMoney(row.arr, currency)} revenue asking · ${
            row.companies === 1 ? '1 company' : `${row.companies} companies`
          } · ${row.interactions === 1 ? '1 ask' : `${row.interactions} asks`}`}
        />
      </p>
      <p className={TYPE.bodyMuted}>
        <Figured text={trend(row)} />
      </p>
      {row.owner ? <p className={TYPE.meta}>Owner: {row.owner.name}</p> : null}
    </li>
  );
}

function RequestDetail({
  id,
  scope,
  currency,
  mayCurate,
  onBack,
  onChanged,
  onRefused,
}: {
  id: number;
  scope: ScopeKey;
  currency: CurrencyCode;
  mayCurate: boolean;
  onBack: () => void;
  onChanged: () => void;
  onRefused: (err: unknown) => boolean;
}) {
  const [detail, setDetail] = useState<FeatureRequestFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Minor #7: an old scope's detail (reached by browser back/forward while
  // this pane is open) must never linger. Reset during render when `scope`
  // changes, the documented way to adjust state for a prop change without
  // an effect (`id` changing already remounts this component via its key).
  const [priorScope, setPriorScope] = useState(scope);
  if (scope !== priorScope) {
    setPriorScope(scope);
    setDetail(null);
    setError(null);
  }

  const load = useCallback(() => {
    let cancelled = false;
    fetchRequest(id, scope)
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled || onRefused(err)) return;
        setError(errorText(err, 'Could not load this request.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, scope, onRefused]);

  useEffect(load, [load]);

  async function setStatus(status: RequestStatus) {
    setSaving(true);
    setError(null);
    try {
      const saved = await updateRequest(id, { status });
      // The PATCH answers unscoped (Contract note 3): take its status and
      // owner, keep this scope's figures.
      setDetail((last) => (last ? { ...last, status: saved.status, owner: saved.owner } : last));
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BrainFrame>
      <button type="button" onClick={onBack} className={`-ml-3 w-fit ${QUIET}`}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All feature requests
      </button>

      {error && (
        <p className="text-[13px] leading-5 text-danger-ink" role="alert">
          {error}
        </p>
      )}

      {detail === null ? (
        !error && (
          <Card pad="none">
            <LoadingState label="Loading request" variant="block" />
          </Card>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={TYPE.title}>{detail.title}</h2>
                {!mayCurate && <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABELS[detail.status]}</Badge>}
              </div>
              {detail.summary && <p className={`mt-1 max-w-[68ch] ${TYPE.bodyMuted}`}>{detail.summary}</p>}
            </div>
            {mayCurate && (
              <div className="shrink-0">
                <Select
                  id="request-status"
                  label="Status"
                  value={detail.status}
                  onChange={(value) => setStatus(value as RequestStatus)}
                  disabled={saving}
                  options={(Object.keys(STATUS_LABELS) as RequestStatus[]).map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
                />
              </div>
            )}
          </div>

          <Card pad="none">
            <dl className="grid grid-cols-2 divide-line-subtle sm:grid-cols-4 sm:divide-x">
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Revenue asking</dt>
                <dd className={`${TYPE.title} ${NUM}`} title={formatMoney(detail.arr, currency)}>{formatCompactMoney(detail.arr, currency)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Companies</dt>
                <dd className={`${TYPE.title} ${NUM}`}>{detail.companies}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Asks</dt>
                <dd className={`${TYPE.title} ${NUM}`}>{detail.interactions}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Last 90 days</dt>
                <dd className={`${TYPE.title} ${NUM}`}>{detail.last_90_days}</dd>
              </div>
            </dl>
          </Card>

          <section className="flex flex-col gap-2">
            <h2 className={TYPE.title}>Companies asking</h2>
            <ListCard label="Companies asking">
              {detail.companies_asking.map((company) => (
                <ListRow
                  key={company.id}
                  href={`/organizations/${company.id}`}
                  title={company.name}
                  trailing={<span className={`${TYPE.meta} ${NUM}`}>{formatCompactMoney(company.arr, currency)}</span>}
                  density="compact"
                />
              ))}
            </ListCard>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className={TYPE.title}>Evidence</h2>
            <ListCard label="Evidence">
              {detail.evidence.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
                    <span className="font-semibold">{row.kind}</span>
                    <Link
                      to={row.company.type === 'account' ? `/accounts/${row.company.id}` : `/organizations/${row.company.id}`}
                      className={`inline-flex min-h-11 items-center rounded-sm font-semibold text-ink-muted hover:text-ink sm:min-h-0 ${FOCUS}`}
                    >
                      {row.company.name}
                    </Link>
                    <span>
                      <Figured text={shortDate(row.occurred_at)} />
                    </span>
                  </div>
                  <p className={TYPE.body}>{row.snippet}</p>
                </li>
              ))}
            </ListCard>
          </section>
        </>
      )}
    </BrainFrame>
  );
}
