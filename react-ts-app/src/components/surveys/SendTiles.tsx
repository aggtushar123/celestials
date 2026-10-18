import { BAND_LABEL, BANDS, FIGURE_HINT, formatFigure, TYPE_LABEL } from '../../features/surveys/questions';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { NUM, Tile, tileRow, TYPE } from '../ui';
import { Rate } from './Rate';

/** The tiles (spec §2.3; UI foundations spec §4.3): sent, answered, the
 *  response rate, and the type's figure with its bands as the tile's
 *  breakdown (at most three rows). For the owner they cover every invite;
 *  for anyone else only the people they may open (the server decides). */
export function SendTiles({ send }: { send: SurveySend }) {
  const { summary, survey_type: type } = send;
  return (
    <div className={tileRow(4, 'container')}>
      <Tile label="Sent" value={summary.sent} />
      <Tile label="Answered" value={summary.answered} />
      <Tile label="Response rate" value={<Rate rate={summary.rate} isOwner={send.is_owner} />} />
      <Tile label={TYPE_LABEL[type]} value={formatFigure(type, summary.figure)} meta={FIGURE_HINT[type]}>
        {BANDS[type].map((band) => (
          <span key={band} data-part="band" className="flex items-baseline justify-between gap-2">
            <span className={TYPE.meta}>{BAND_LABEL[band]}</span>
            <span className={`${TYPE.meta} ${NUM}`}>{summary.bands[band] ?? 0}</span>
          </span>
        ))}
      </Tile>
    </div>
  );
}
