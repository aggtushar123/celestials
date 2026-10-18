import { Link } from 'react-router-dom';
import { dayOf } from '../../features/brain/brainText';
import type { CustomerScores, ScoreComment } from '../../features/brain/brainTypes';
import { commentLabel, CS, hiddenCommentsText, noCommentsText, responsesText, SCORE_KINDS, scoreChange, scoreFigure } from '../../features/brain/customersText';
import { recordPath } from '../../features/brain/deskText';
import { TYPE_LABEL } from '../../features/surveys/questions';
import { Card, EmptyState, NUM, TYPE } from '../ui';
import { Figured } from './Figured';
import { LINK, TONE_CLASS } from './styles';

function CommentRow({ comment }: { comment: ScoreComment }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <p data-part="meta" className={`flex flex-wrap items-center gap-x-1 ${TYPE.meta}`}>
        <span>
          <Figured text={commentLabel(comment)} />
        </span>
        {comment.record ? (
          <>
            {' · '}
            <Link to={recordPath(comment.record)} className={LINK}>
              {comment.record.name}
            </Link>
          </>
        ) : null}
        {' · '}
        <span className={NUM}>{dayOf(comment.answered_at)}</span>
      </p>
      <p className={`max-w-[68ch] ${TYPE.body}`}>{comment.comment}</p>
    </li>
  );
}

/** Scores (spec §2.1, Decision 3): NPS, CSAT and CES for the scope's last 90
 *  days against the 90 before, then this window's latest comments, all in
 *  one card. A change is always a sentence beside its colour. */
export function ScoresPanel({ scores }: { scores: CustomerScores }) {
  const hidden = hiddenCommentsText(scores.hidden);
  return (
    <Card pad="none">
      <dl className="grid divide-y divide-line-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {SCORE_KINDS.map((kind) => {
          const figure = scores[kind];
          const change = scoreChange(kind, figure);
          return (
            <div key={kind} data-score={kind} className="flex flex-col gap-1 px-4 py-3">
              <dt className={`${TYPE.body} font-semibold`}>{TYPE_LABEL[kind]}</dt>
              <dd className="flex flex-col gap-1">
                <span data-part="figure" className={figure.now === null ? TYPE.bodyMuted : `${TYPE.display} ${NUM}`}>
                  {scoreFigure(kind, figure)}
                </span>
                {change ? (
                  <span data-part="change" className={`text-[13px] leading-5 font-semibold ${TONE_CLASS[change.tone]}`}>
                    <Figured text={change.text} />
                  </span>
                ) : null}
                <span data-part="responses" className={TYPE.meta}>
                  <Figured text={responsesText(figure)} />
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="border-t border-line-subtle">
        <h3 className={`px-4 pt-3 ${TYPE.label}`}>{CS.COMMENTS}</h3>
        {scores.comments.length === 0 ? (
          <EmptyState size="inline" title={noCommentsText(scores.hidden)} />
        ) : (
          <ul aria-label={CS.COMMENTS} className="divide-y divide-line-subtle">
            {scores.comments.map((comment, i) => (
              <CommentRow key={`${comment.answered_at}-${i}`} comment={comment} />
            ))}
          </ul>
        )}
        {hidden ? (
          <p data-part="hidden" className={`border-t border-line-subtle px-4 py-3 ${TYPE.bodyMuted}`}>
            {hidden}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
