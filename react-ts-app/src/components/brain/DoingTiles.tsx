import { useLocation } from 'react-router-dom';
import type { DoingPayload } from '../../features/brain/brainTypes';
import { atRiskText, DO, doingFigures, firedText, onTrackText, withSection, type SectionKey } from '../../features/brain/doingText';
import { Tile, tileRow } from '../ui';
import { Figured } from './Figured';

/** What's being done's tiles (brain UI spec §2): initiatives (active, and
 *  on track), open plans (and at risk), rules running (and what they fired
 *  last night). Each jumps to its section, replacing the section links. */
export function DoingTiles({ data, current, onSame }: {
  data: Pick<DoingPayload, 'initiatives' | 'plans' | 'rules'>;
  current: SectionKey | null;
  onSame: (key: SectionKey) => void;
}) {
  const f = doingFigures(data);
  const { search } = useLocation();
  const jump = (key: SectionKey) => ({
    to: { search: withSection(search, key) },
    replace: true,
    current: current === key,
    onOpen: () => {
      if (current === key) onSame(key);
    },
  });
  return (
    <nav aria-label={DO.SECTIONS} className={tileRow(3, 'container')}>
      <Tile
        label={DO.INITIATIVES}
        value={f.active}
        meta={<Figured text={onTrackText(f.onTrack)} />}
        buttonLabel={`${DO.INITIATIVES}: ${f.active} active, ${onTrackText(f.onTrack)}`}
        {...jump('initiatives')}
      />
      <Tile
        label={DO.OPEN_PLANS}
        value={f.openPlans}
        meta={<Figured text={atRiskText(f.atRisk)} />}
        buttonLabel={`${DO.OPEN_PLANS}: ${f.openPlans}, ${atRiskText(f.atRisk)}`}
        {...jump('plans')}
      />
      <Tile
        label={DO.RULES_RUNNING}
        value={f.running}
        meta={<Figured text={firedText(f.fired)} />}
        buttonLabel={`${DO.RULES_RUNNING}: ${f.running}, ${firedText(f.fired)}`}
        {...jump('rules')}
      />
    </nav>
  );
}
