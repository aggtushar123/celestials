import type { CurrencyCode } from '../../features/auth/authSlice';
import { metricTiles, SAY } from '../../features/brain/brainText';
import type { ChangedMetric } from '../../features/brain/brainTypes';
import { Tile, TYPE, tileRow } from '../ui';
import { Figured } from './Figured';
import { TONE_CLASS } from './styles';

/** What changed's tiles (brain UI spec 2026-10-06 §2): ARR, NRR, ARR at
 *  risk and the healthy share, matched by registry key and skipped when the
 *  scope has none. Each is a standard tile: its figure now, then the change
 *  against then as a sentence in its trend ink. */
export function ChangedTiles({ metrics, currency }: { metrics: ChangedMetric[]; currency: CurrencyCode }) {
  const tiles = metricTiles(metrics, currency);
  if (tiles.length === 0) return null;
  const columns = Math.min(5, Math.max(2, tiles.length)) as 2 | 3 | 4 | 5;
  return (
    <div role="group" aria-label={SAY.TILES} className={tileRow(columns, 'container')}>
      {tiles.map((tile) => (
        <Tile
          key={tile.key}
          label={tile.label}
          value={tile.figure ?? <span className={TYPE.bodyMuted}>{SAY.NO_FIGURE}</span>}
          meta={
            tile.change ? (
              <span data-part="change" className={`font-semibold ${TONE_CLASS[tile.change.tone]}`}>
                <Figured text={tile.change.text} />
              </span>
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
