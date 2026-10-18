import { Link } from 'react-router-dom';
import type { CurrencyCode } from '../../features/auth/authSlice';
import type { CustomerAnomaly, CustomerAsk, ScopeKey } from '../../features/brain/brainTypes';
import { anomalyMeta, askMeta, asksEmpty, CS, seeAllHref, topText } from '../../features/brain/customersText';
import { BUTTON, EmptyState, ListCard, ListRow, TYPE } from '../ui';
import { Figured } from './Figured';

function Row({ kind, id, title, meta }: { kind: 'ask' | 'anomaly'; id: number; title: string; meta: string }) {
  return <ListRow dataAttrs={{ 'data-row': `${kind}-${id}` }} title={title} meta={<Figured text={meta} />} />;
}

/** Asks (spec §2.1): the top requests by the ARR behind them in this scope, in the server's order. */
export function AskList({ asks, scope, currency }: { asks: CustomerAsk[]; scope: ScopeKey; currency: CurrencyCode }) {
  return (
    <ListCard label={CS.ASKS} state={asks.length === 0 ? <EmptyState size="inline" title={asksEmpty(scope)} /> : undefined}>
      {asks.map((ask) => (
        <Row key={ask.id} kind="ask" id={ask.id} title={ask.title} meta={askMeta(ask, currency)} />
      ))}
    </ListCard>
  );
}

/** Anomalies (spec §2.1): titles as the server gated them. */
export function AnomalyList({ anomalies, currency }: { anomalies: CustomerAnomaly[]; currency: CurrencyCode }) {
  return (
    <ListCard label={CS.ANOMALIES} state={anomalies.length === 0 ? <EmptyState size="inline" title={CS.NO_ANOMALIES} /> : undefined}>
      {anomalies.map((anomaly) => (
        <Row key={anomaly.id} kind="anomaly" id={anomaly.id} title={anomaly.title} meta={anomalyMeta(anomaly, currency)} />
      ))}
    </ListCard>
  );
}

/** "Top 5 of 7" and See all, which opens the full page in the same scope (Decision 2). */
export function SeeAll({ page, scope, shown, total }: { page: 'requests' | 'anomalies'; scope: ScopeKey; shown: number; total: number }) {
  if (total === 0) return null;
  const top = topText(shown, total);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {top ? (
        <span className={TYPE.bodyMuted}>
          <Figured text={top} />
        </span>
      ) : null}
      <Link to={seeAllHref(page, scope)} aria-label={page === 'requests' ? CS.SEE_ALL_ASKS : CS.SEE_ALL_ANOMALIES} className={BUTTON}>
        {CS.SEE_ALL}
      </Link>
    </div>
  );
}
