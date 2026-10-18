import type { Line } from '../../features/surveys/surveyText';
import { NUM } from '../ui';

/** "6 skipped (…) · 2 without an email": each figure in tabular figures. */
export function Lines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={line.text}>
          {index > 0 ? ' · ' : ''}
          <span className={NUM}>{line.n}</span> {line.text}
        </span>
      ))}
    </>
  );
}
