import { useLocation } from 'react-router-dom';
import type { CustomersPayload } from '../../features/brain/brainTypes';
import { CS, customerTiles, type CustomerSectionKey } from '../../features/brain/customersText';
import { withSection } from '../../features/brain/doingText';
import { Tile, tileRow, TYPE } from '../ui';
import { Figured } from './Figured';
import { TONE_CLASS } from './styles';

/** What customers are saying's tiles (brain UI spec §2): asks, anomalies,
 *  NPS, CSAT and negative contacts, each jumping to its section in place
 *  of the section links. A score under 5 answers reads "Not enough
 *  answers", as Scores does. NPS and CSAT both jump to Scores (fix wave
 *  item 16): only the first of a section's tiles is ever `current`, so a
 *  screen reader never hears two tiles claim the same current location. */
export function CustomerTiles({ data, current, onSame }: {
  data: CustomersPayload;
  current: CustomerSectionKey | null;
  onSame: (key: CustomerSectionKey) => void;
}) {
  const { search } = useLocation();
  const seen = new Set<CustomerSectionKey>();
  return (
    <nav aria-label={CS.SECTIONS} className={tileRow(5, 'container')}>
      {customerTiles(data).map((tile) => {
        const isCurrent = current === tile.section && !seen.has(tile.section);
        if (isCurrent) seen.add(tile.section);
        return (
          <Tile
            key={tile.key}
            label={tile.title}
            value={tile.muted ? <span className={TYPE.bodyMuted}>{tile.figure}</span> : tile.figure}
            meta={
              tile.detail ? (
                <span data-part="change" className={`font-semibold ${TONE_CLASS[tile.detail.tone]}`}>
                  <Figured text={tile.detail.text} />
                </span>
              ) : undefined
            }
            to={{ search: withSection(search, tile.section) }}
            replace
            current={isCurrent}
            onOpen={() => {
              if (isCurrent) onSame(tile.section);
            }}
            buttonLabel={tile.label}
          />
        );
      })}
    </nav>
  );
}
