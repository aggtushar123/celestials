import { useState } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import { signed } from '../../../features/organizations/portfolioFields';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { HealthBand, NpsBand, PortfolioSummary } from '../../../features/organizations/portfolioTypes';
import { capitalise, HEALTH_LABEL, NPS_BANDS, NPS_LABEL, RENEWAL_WINDOWS, type RenewalWindow } from '../../../features/organizations/portfolioLabels';
import { usePortfolioKind } from './portfolioKind';
import { Card, LoadingState, NUM, SegmentedControl, TYPE, Tile, tileRow } from '../../ui';
import { FilterButton } from './tileParts';

const BANDS: HealthBand[] = ['good', 'average', 'poor'];
const BAND_DOT: Record<HealthBand, string> = { good: 'bg-success', average: 'bg-warning', poor: 'bg-danger' };
const NPS_BAR: Record<NpsBand, string> = { promoter: 'bg-success', passive: 'bg-line-strong', detractor: 'bg-danger' };

const only = <T,>(values: T[], value: T) => values.length === 1 && values[0] === value;

/** The four summary tiles (spec §1). Numbers come from the server for the
 *  current filters, and every segment filters the list on click. Lifecycle has its
 *  own card (LifecycleCard). On phones the row swipes sideways. */
export function SummaryTiles({
  summary,
  failed = false,
  currency,
  params,
  onFilter,
}: {
  summary: PortfolioSummary | null;
  /** The first load failed: there is no summary to wait for. */
  failed?: boolean;
  currency: CurrencyCode;
  params: PortfolioParams;
  onFilter: (patch: Partial<PortfolioParams>) => void;
}) {
  const kind = usePortfolioKind();
  const [mode, setMode] = useState<'count' | 'mrr' | 'arr'>('count');
  // The Renewing tile's window. The summary counts 30 and 90 days; a
  // 180-day filter (set from the Filters panel) shows as a third, pressed
  // option, whose count is the whole filtered book. Synced during render.
  const [span, setSpan] = useState<RenewalWindow>(params.renews_within || kind.renewalWindow);
  const [seenWindow, setSeenWindow] = useState(params.renews_within);
  if (seenWindow !== params.renews_within) {
    setSeenWindow(params.renews_within);
    if (params.renews_within) setSpan(params.renews_within);
    else if (span === '180') setSpan(kind.renewalWindow);
  }
  if (!summary) {
    if (!failed) return <LoadingState label="Loading summary" variant="tiles" count={4} />;
    return (
      <Card pad="sm">
        <p className={TYPE.label}>Summary unavailable</p>
        <p className={TYPE.meta}>The tiles return once the list loads.</p>
      </Card>
    );
  }

  const health = summary.health;
  const bandValue = (band: HealthBand) => (mode === 'count' ? health[band] : health[mode][band]);
  const bandTotal = BANDS.reduce((total, band) => total + bandValue(band), 0);
  const show = (n: number) => (mode === 'count' ? String(n) : formatCompactMoney(n, currency));

  const nps = summary.nps;
  const npsCount: Record<NpsBand, number> = { promoter: nps.promoters, passive: nps.passives, detractor: nps.detractors };
  const npsBands = NPS_BANDS.map((band) => ({ band, label: NPS_LABEL[band], count: npsCount[band], bar: NPS_BAR[band] }));
  const npsTotal = nps.promoters + nps.passives + nps.detractors;
  const renewing = span === '180' ? summary.accounts : summary.renewing[span];
  const spans = RENEWAL_WINDOWS.filter((days) => days !== '180' || span === '180');

  return (
    <div className={tileRow(4, 'container')}>
      <Tile
        label="Health"
        value={show(bandTotal)}
        meta={`${mode === 'count' ? capitalise(kind.noun.many) : mode.toUpperCase()} by health band`}
        action={
          <SegmentedControl
            size="sm"
            label="Health measure"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'count', label: 'Count' },
              { value: 'mrr', label: 'MRR' },
              { value: 'arr', label: 'ARR' },
            ]}
          />
        }
      >
        <span aria-hidden="true" className="mb-1 flex h-2 overflow-hidden rounded-full bg-line">
          {bandTotal > 0
            ? BANDS.map((band) => (
                <span key={band} className={BAND_DOT[band]} style={{ width: `${(bandValue(band) / bandTotal) * 100}%` }} />
              ))
            : null}
        </span>
        {BANDS.map((band) => (
          <FilterButton
            key={band}
            compact
            pressed={only(params.health, band)}
            onClick={() => onFilter({ health: only(params.health, band) ? [] : [band] })}
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${BAND_DOT[band]}`} />
              {HEALTH_LABEL[band]}
            </span>{' '}
            <span className={`${NUM} text-ink`}>{show(bandValue(band))}</span>
          </FilterButton>
        ))}
      </Tile>

      <Tile label="NPS" value={signed(nps.score)} meta={<><span className={NUM}>{npsTotal}</span> responses</>}>
        <span aria-hidden="true" className="mb-1 flex h-2 overflow-hidden rounded-full bg-line">
          {npsTotal > 0
            ? npsBands.map((b) => <span key={b.band} className={b.bar} style={{ width: `${(b.count / npsTotal) * 100}%` }} />)
            : null}
        </span>
        {npsBands.map((b) => (
          <FilterButton key={b.band} compact pressed={params.nps === b.band} onClick={() => onFilter({ nps: params.nps === b.band ? '' : b.band })}>
            <span>{b.label}</span>{' '}
            <span className={`${NUM} text-ink`}>{b.count}</span>
          </FilterButton>
        ))}
      </Tile>

      <Tile
        label="Accounts · ARR"
        value={summary.accounts}
        meta={
          <>
            <span className={NUM}>{formatCompactMoney(summary.arr, currency)}</span> ARR
            {summary.unconverted_count > 0 ? (
              <>
                {' · '}
                <span className={NUM}>{summary.unconverted_count}</span> without an exchange rate, left out of ARR
              </>
            ) : null}
          </>
        }
      />

      <Tile
        label="Renewing"
        value={renewing}
        meta={`within ${span} days, overdue included`}
        pressed={params.renews_within === span}
        onPress={() => onFilter({ renews_within: params.renews_within === span ? '' : span })}
        buttonLabel={`Renewing within ${span} days: ${renewing}`}
        action={
          <SegmentedControl
            size="sm"
            label="Renewal window"
            value={span}
            onChange={setSpan}
            options={spans.map((days) => ({ value: days, label: `${days}d` }))}
          />
        }
      />
    </div>
  );
}
