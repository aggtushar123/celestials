// Brain > Anomalies: what suddenly started going wrong at several
// companies at once.
//
// One fault reported by eight accounts reads as eight tickets everywhere
// else in this product (see revenact-backend services/anomalies). Here it
// is one row, ranked by the revenue behind it, and every figure is the
// reader's own: their companies, and the reports they may read.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivitySquare, ChevronLeft, Info, Radar } from 'lucide-react';
import { useAppSelector, useCapability } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import { formatCompactMoney, formatMoney } from '../../features/customers/formatters';
import type { CurrencyCode } from '../../features/auth/authSlice';
import {
  STATUS_LABELS,
  detectAnomalies,
  fetchAnomalies,
  fetchAnomaly,
  setAnomalyStatus,
} from '../../features/anomalies/anomaliesApi';
import type { AnomalyDetail, AnomalyRow, AnomalyStatus } from '../../features/anomalies/anomaliesApi';
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
import type { ScopeKey } from '../../features/brain/brainTypes';
import { CS } from '../../features/brain/customersText';

const FILTERS: (AnomalyStatus | 'all')[] = ['all', 'live', 'acknowledged', 'resolved'];
const STATUS_TONE: Record<AnomalyStatus, BadgeTone> = { live: 'danger', acknowledged: 'warning', resolved: 'success' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-22T09:00:00Z" → "22 Sep", read off the string so the day never shifts. */
function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function found(created: number, attached: number): string {
  const clusters = created === 1 ? '1 new cluster' : `${created} new clusters`;
  const reports = attached === 1 ? '1 report attached' : `${attached} reports attached`;
  return `${clusters}, ${reports}`;
}

/** What a stopped run still managed to find, if anything. */
function partial(err: unknown): string {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null) return '';
  const body = err.body as { found?: number };
  if (!body.found) return '';
  return ` ${body.found === 1 ? '1 new cluster was' : `${body.found} new clusters were`} still found.`;
}

export function AnomaliesPage() {
  const currency = useAppSelector((s) => s.auth.user?.organisation.currency ?? 'USD');
  const mayAct = useCapability('view_all_accounts');
  const brain = useBrainScope();
  const scope = brain.scope;
  const { refused } = brain;
  const [filter, setFilter] = useState<AnomalyStatus | 'all'>('all');
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; rows: AnomalyRow[] } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [lookError, setLookError] = useState<string | null>(null);

  // Customers spec §2.2: read only once ?scope= settles, keyed by scope so a
  // switch drops to the skeleton rather than showing the last view's rows.
  const key = scope ? `${scope}:${filter}#${attempt}` : null;
  const rows = key !== null && loaded?.key === key ? loaded.rows : null;
  const error = key !== null && failed?.key === key ? failed.message : null;
  const shownError = brain.error ?? error;

  useEffect(() => {
    if (!scope || key === null) return;
    let cancelled = false;
    fetchAnomalies(filter, scope)
      .then((next) => {
        if (cancelled) return;
        if (!Array.isArray(next)) throw new Error('unexpected response');
        setLoaded({ key, rows: next });
      })
      .catch((err) => {
        if (cancelled || refused(err)) return;
        setFailed({ key, message: errorText(err, 'Could not load anomalies.') });
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

  async function look() {
    setLooking(true);
    setNote(null);
    setLookError(null);
    try {
      const result = await detectAnomalies();
      setNote(found(result.found, result.attached));
    } catch (err) {
      setLookError(`${errorText(err, 'Could not look now.')}${partial(err)}`);
    } finally {
      setLooking(false);
      // Either way the picture may have moved on.
      setAttempt((n) => n + 1);
    }
  }

  if (openId !== null && scope) {
    return (
      <AnomalyPane
        key={openId}
        id={openId}
        scope={scope}
        currency={currency}
        mayAct={mayAct}
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
          <h2 className={TYPE.title}>Anomalies</h2>
          <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>
            The same thing going wrong at several companies at once, found in the last fortnight of classified emails,
            tickets and calls.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {mayAct && (
            <button type="button" onClick={look} disabled={looking} className={`${PRIMARY} shrink-0`}>
              <Radar className="h-4 w-4" aria-hidden="true" />
              {looking ? 'Looking…' : 'Look now'}
            </button>
          )}
        </div>
      </div>
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}

      {!mayAct && (
        <p className={`flex items-start gap-2 ${TYPE.bodyMuted}`}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          These figures count only the companies you can open and the reports you can read.
        </p>
      )}
      {/* Always mounted, sr-only while empty: a live region announces only
          changes to a node that was already there. */}
      <p data-part="look-status" className={note ? TYPE.bodyMuted : 'sr-only'} role="status">
        {note ?? ''}
      </p>
      {lookError && (
        <p className="text-[13px] leading-5 text-danger-ink" role="alert">
          {lookError}
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
        <ListCard label="Anomalies" state={<LoadingState label="Loading anomalies" count={3} />} />
      ) : rows.length === 0 ? (
        <Card pad="none">
          <UiEmptyState
            icon={ActivitySquare}
            title="Nothing unusual right now."
            detail="A cluster shows here when the same report reaches at least three companies and clearly more often than the fortnight before. A cluster made only of personal mail is named from its shape rather than its words."
          />
        </Card>
      ) : (
        <ListCard label="Anomalies">
          {rows.map((row) => (
            <AnomalyListRow key={row.id} anomaly={row} currency={currency} onOpen={setOpenId} />
          ))}
        </ListCard>
      )}
    </BrainFrame>
  );
}

function AnomalyListRow({
  anomaly,
  currency,
  onOpen,
}: {
  anomaly: AnomalyRow;
  currency: CurrencyCode;
  onOpen: (id: number) => void;
}) {
  return (
    <li data-row={anomaly.id} className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onOpen(anomaly.id)}
            aria-label={`Open ${anomaly.title}`}
            className={`inline-flex min-h-11 items-center rounded-sm text-left ${TYPE.body} font-semibold hover:underline sm:min-h-9 ${FOCUS}`}
          >
            {anomaly.title}
          </button>
          {anomaly.summary && <p className={`line-clamp-2 max-w-[68ch] ${TYPE.bodyMuted}`}>{anomaly.summary}</p>}
        </div>
        <Badge tone={STATUS_TONE[anomaly.status]}>{STATUS_LABELS[anomaly.status]}</Badge>
      </div>
      <p className={TYPE.bodyMuted} title={formatMoney(anomaly.arr, currency)}>
        <Figured
          text={`${formatCompactMoney(anomaly.arr, currency)} revenue hit · ${
            anomaly.companies === 1 ? '1 company' : `${anomaly.companies} companies`
          } · ${anomaly.interactions === 1 ? '1 report' : `${anomaly.interactions} reports`}`}
        />
      </p>
      <p className={TYPE.bodyMuted}>
        <Figured text={`Seen ${shortDate(anomaly.first_seen_at)} to ${shortDate(anomaly.last_seen_at)}`} />
      </p>
      {anomaly.acknowledged_by ? <p className={TYPE.meta}>Acknowledged by {anomaly.acknowledged_by.name}</p> : null}
    </li>
  );
}

function AnomalyPane({
  id,
  scope,
  currency,
  mayAct,
  onBack,
  onChanged,
  onRefused,
}: {
  id: number;
  scope: ScopeKey;
  currency: CurrencyCode;
  mayAct: boolean;
  onBack: () => void;
  onChanged: () => void;
  onRefused: (err: unknown) => boolean;
}) {
  const [detail, setDetail] = useState<AnomalyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Final review #7/#8: an old scope's detail (reached by browser
  // back/forward while this pane is open) must never linger. Reset during
  // render when `scope` changes, the documented way to adjust state for a
  // prop change without an effect (`id` changing already remounts this
  // component via its key).
  const [priorScope, setPriorScope] = useState(scope);
  if (scope !== priorScope) {
    setPriorScope(scope);
    setDetail(null);
    setError(null);
  }

  useEffect(() => {
    // Final review #7/#8: a per-effect `cancelled` flag (as FeatureRequests'
    // RequestDetail uses), not a single `alive` ref that a later effect run
    // resets back to true while an earlier read is still in flight.
    let cancelled = false;
    fetchAnomaly(id, scope)
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled || onRefused(err)) return;
        setError(errorText(err, 'Could not load this cluster.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, scope, onRefused]);

  async function change(status: AnomalyStatus) {
    setSaving(true);
    setError(null);
    try {
      const next = await setAnomalyStatus(id, status);
      setDetail((last) => (last ? { ...last, status: next.status, acknowledged_by: next.acknowledged_by } : last));
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
        All anomalies
      </button>

      {error && (
        <p className="text-[13px] leading-5 text-danger-ink" role="alert">
          {error}
        </p>
      )}

      {detail === null ? (
        !error && (
          <Card pad="none">
            <LoadingState label="Loading the cluster" variant="block" />
          </Card>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={TYPE.title}>{detail.title}</h2>
                {!mayAct && <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABELS[detail.status]}</Badge>}
              </div>
              {detail.summary && <p className={`mt-1 max-w-[68ch] ${TYPE.bodyMuted}`}>{detail.summary}</p>}
            </div>
            {mayAct && (
              <div className="shrink-0">
                <Select
                  id="anomaly-status"
                  label="Status"
                  value={detail.status}
                  onChange={(value) => change(value as AnomalyStatus)}
                  disabled={saving}
                  options={(Object.keys(STATUS_LABELS) as AnomalyStatus[]).map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
                />
              </div>
            )}
          </div>

          <Card pad="none">
            <dl className="grid grid-cols-2 divide-line-subtle sm:grid-cols-5 sm:divide-x">
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Revenue hit</dt>
                <dd className={`${TYPE.title} ${NUM}`} title={formatMoney(detail.arr, currency)}>{formatCompactMoney(detail.arr, currency)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Companies</dt>
                <dd className={`${TYPE.title} ${NUM}`}>{detail.companies}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Reports</dt>
                <dd className={`${TYPE.title} ${NUM}`}>{detail.interactions}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>First seen</dt>
                <dd className={`${TYPE.title} ${NUM}`}>{shortDate(detail.first_seen_at)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3">
                <dt className={TYPE.meta}>Latest</dt>
                <dd className={`${TYPE.title} ${NUM}`}>{shortDate(detail.last_seen_at)}</dd>
              </div>
            </dl>
          </Card>

          <section className="flex flex-col gap-2">
            <h2 className={TYPE.title}>Companies hit</h2>
            <ListCard label="Companies hit">
              {detail.companies_hit.map((company) => (
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
            <h2 className={TYPE.title}>Reports</h2>
            <ListCard label="Reports">
              {detail.evidence.map((report) => (
                <li key={report.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
                    <span className="font-semibold">{report.kind}</span>
                    <Link
                      to={report.company.type === 'account' ? `/accounts/${report.company.id}` : `/organizations/${report.company.id}`}
                      className={`inline-flex min-h-11 items-center rounded-sm font-semibold text-ink-muted hover:text-ink sm:min-h-0 ${FOCUS}`}
                    >
                      {report.company.name}
                    </Link>
                    <span>
                      <Figured text={shortDate(report.occurred_at)} />
                    </span>
                  </div>
                  <p className={TYPE.body}>{report.snippet}</p>
                </li>
              ))}
            </ListCard>
          </section>
        </>
      )}
    </BrainFrame>
  );
}
