import type { TicketKpis } from '../../../../../features/tickets/ticketsSlice';
import { Kpi, KpiStrip } from '../../../shared/Kpi';
import { useDrill } from '../../../drill/useDrill';

/** An em-dash rather than a zero while the first fetch is in flight: "0
 * tickets" is a claim, "—" is an admission. Same convention as HealthDistribution's
 * own metrics. */
const n = (v: number | null | undefined, suffix = '') =>
  v === null || v === undefined ? '—' : `${v}${suffix}`;

const PATH = '/tickets/stats/';

/**
 * The six ticket-overview figures, on the shared `Kpi`/`KpiStrip`.
 *
 * Colour used to follow a `gray | green | red | orange` scheme that tracked
 * nothing real — On Hold in amber, an average lifetime and a resolution
 * rate in green — so every glance implied a caution or a win that wasn't
 * one. A negative-sentiment count is the one figure here that is
 * unambiguously a loss; everything else is a plain count or rate.
 *
 * Four of the six drill into the server: Total, On Hold and the two
 * sentiment counts are real segments the backend can list the tickets
 * behind. Resolution rate and average lifetime stay plain — a rate and an
 * average aren't a set of tickets to open a list of accounts from.
 */
export function KPIGrid({
  kpis,
  query,
  drillable = true,
}: {
  kpis: TicketKpis | null;
  query: string;
  /** False while the view refetches: the figures on screen are the old
   *  ones, but a drill would send the new query, so nothing opens. */
  drillable?: boolean;
}) {
  const { open } = useDrill();

  const drill = (title: string, value: number, segment: string) => (trigger: HTMLElement) =>
    open(
      {
        title,
        figure: String(value),
        source: { kind: 'server', path: PATH, query, segment },
      },
      trigger,
    );

  return (
    <KpiStrip columns={2} stackFromLg>
      <Kpi
        label="Total Ticket Volume"
        value={n(kpis?.total)}
        onDrill={kpis && drillable ? drill('Total Ticket Volume', kpis.total, 'all') : undefined}
      />
      <Kpi
        label="Tickets On Hold"
        value={n(kpis?.on_hold)}
        onDrill={kpis && drillable ? drill('Tickets On Hold', kpis.on_hold, 'on_hold') : undefined}
      />
      <Kpi label="Avg. Ticket Lifetime (Days)" value={n(kpis?.avg_lifetime_days)} />
      <Kpi label="Ticket Resolution Rate" value={n(kpis?.resolution_rate, '%')} />
      <Kpi
        label="Positive Sentiment Tickets"
        value={n(kpis?.positive_sentiment)}
        onDrill={
          kpis && drillable ? drill('Positive Sentiment Tickets', kpis.positive_sentiment, 'sentiment:positive') : undefined
        }
      />
      <Kpi
        label="Negative Sentiment Tickets"
        value={n(kpis?.negative_sentiment)}
        tone="loss"
        onDrill={
          kpis && drillable ? drill('Negative Sentiment Tickets', kpis.negative_sentiment, 'sentiment:negative') : undefined
        }
      />
    </KpiStrip>
  );
}
