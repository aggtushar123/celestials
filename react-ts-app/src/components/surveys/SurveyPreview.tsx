import { useId } from 'react';
import { LINK_DAYS, questionFor } from '../../features/surveys/questions';
import type { SurveyType } from '../../features/surveys/surveyTypes';
import { RevenactMark } from '../shared/RevenactMark';
import { ScaleButtons } from './ScaleButtons';
import { NUM, TYPE } from '../ui';

const LABEL = TYPE.label;

/** The email and the hosted form as the customer will see them (spec
 *  §2.2). The email's lines are the backend's `send_survey_email`, line for
 *  line; everything is plain text, as the email is (spec §3). */
export function SurveyPreview({ type, subject, intro, workspace }: { type: SurveyType; subject: string; intro: string; workspace: string }) {
  const emailId = useId();
  const formId = useId();
  const question = questionFor(type, workspace);
  const text = intro.trim();
  return (
    <section aria-label="Preview" className="flex flex-col divide-y divide-line-subtle rounded-xl bg-subtle">
      <section aria-labelledby={emailId} className="flex flex-col gap-2 p-3">
        <h3 id={emailId} className={LABEL}>
          The email
        </h3>
        <p className="break-words text-[13px] text-ink">
          <span className="text-ink-muted">Subject: </span>
          <span className="font-semibold">{subject.trim() || 'No subject yet'}</span>
        </p>
        <div className="flex flex-col gap-2 break-words text-[13px] text-ink">
          {text ? (
            <p data-part="intro" className="whitespace-pre-line">
              {text}
            </p>
          ) : null}
          <p>{question}</p>
          <p>
            Answer here, it takes a few seconds:
            <br />
            <span className="text-ink-muted">their own one-time link</span>
          </p>
          <p className="text-ink-muted">
            The link works for <span className={NUM}>{LINK_DAYS}</span> days and takes one answer.
          </p>
        </div>
      </section>
      <section aria-labelledby={formId} className="flex flex-col gap-3 p-3">
        <h3 id={formId} className={LABEL}>
          The form
        </h3>
        <RevenactMark size="sm" />
        <p className="text-[15px] font-semibold text-ink">{question}</p>
        <ScaleButtons type={type} value={null} preview />
        <p className="text-[13px] text-ink-muted">Anything to add? (optional)</p>
      </section>
    </section>
  );
}
