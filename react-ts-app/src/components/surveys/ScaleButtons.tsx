import { useId } from 'react';
import { SCALE_ENDS, scaleOf } from '../../features/surveys/questions';
import type { SurveyType } from '../../features/surveys/surveyTypes';
import { MONO } from '../organizations/portfolio/styles';

/** The answer buttons in even rows, so no score sits alone on a line:
 *  NPS 6 then 5, CSAT one row of 5, CES 4 then 3 on phones and 7 from sm.
 *  (The preview picture keeps wrapping: its column is narrower.) */
const GRID: Record<SurveyType, string> = { nps: 'grid-cols-6', csat: 'grid-cols-5', ces: 'grid-cols-4 sm:grid-cols-7' };
const TILE = `${MONO} inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-2 text-[15px] font-semibold`;

/** The type's scores in one row, 44px each, wrapping on phones (spec §2.4).
 *  Native radios underneath, so arrow keys move between scores and a screen
 *  reader hears "9, radio, 10 of 11"; the end labels describe the lowest and
 *  the highest. `preview` draws the same row as a picture for the builder,
 *  with no control in it. */
export function ScaleButtons({
  type,
  value,
  onChange,
  preview = false,
}: {
  type: SurveyType;
  value: number | null;
  onChange?: (score: number) => void;
  preview?: boolean;
}) {
  const name = useId();
  const lowId = useId();
  const highId = useId();
  const scores = scaleOf(type);
  const [lowLabel, highLabel] = SCALE_ENDS[type];
  const first = scores[0];
  const last = scores[scores.length - 1];
  return (
    <div className="flex flex-col gap-1.5">
      {preview ? (
        <>
          <p className="sr-only">
            Scores {first} to {last}, from {lowLabel} to {highLabel}
          </p>
          <div aria-hidden="true" className="flex flex-wrap gap-1.5">
            {scores.map((score) => (
              <span key={score} className={`${TILE} border-line bg-surface text-ink`}>
                {score}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div data-part="scale" className={`grid gap-1.5 ${GRID[type]}`}>
          {scores.map((score) => {
            const checked = value === score;
            return (
              <label
                key={score}
                className={`${TILE} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                  checked ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink hover:border-line-strong'
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  value={score}
                  checked={checked}
                  onChange={() => onChange?.(score)}
                  aria-describedby={score === first ? lowId : score === last ? highId : undefined}
                  className="sr-only"
                />
                {score}
              </label>
            );
          })}
        </div>
      )}
      <div aria-hidden={preview ? 'true' : undefined} className="flex justify-between gap-3 text-[11px] text-ink-muted">
        <span id={lowId}>{lowLabel}</span>
        <span id={highId}>{highLabel}</span>
      </div>
    </div>
  );
}
