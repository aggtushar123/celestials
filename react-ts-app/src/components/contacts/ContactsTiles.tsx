import type { ContactsSummary } from '../../features/contacts/contactsTypes';
import { NO_VALUE, NUM, Tile, tileRow } from '../ui';

/** The Contacts summary (spec 2026-09-28 §3) as four tiles, the shape the
 *  Organizations and Accounts pages use (UI foundations spec §4.3). */
export function ContactsTiles({ summary }: { summary: ContactsSummary }) {
  const positive = summary.total ? Math.round((summary.positive / summary.total) * 100) : 0;
  const growth = summary.growth_30d_pct;
  return (
    <div className="@container">
      <div className={tileRow(4, 'container')}>
        <Tile label="People" value={summary.total} meta={summary.active !== undefined ? <><span className={NUM}>{summary.active}</span> active</> : undefined} />
        <Tile label="Decision makers" value={summary.decision_makers} meta={<>of <span className={NUM}>{summary.total}</span> people</>} />
        <Tile label="Sentiment" value={`${positive}%`} meta={<>positive · <span className={NUM}>{summary.negative}</span> negative</>} />
        <Tile label="Growth (30d)" value={typeof growth === 'number' ? `${growth > 0 ? '+' : ''}${growth}%` : NO_VALUE} meta="change in people over 30 days" />
      </div>
    </div>
  );
}
