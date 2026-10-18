import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { previewText } from '../../features/agents/agentsText';
import { BUNDLE, afterRunText, audienceText, filledInText, pinText, isAppPath, OUTSIDE, showsCantUndo, stepAsAction, stepStateText } from '../../features/agents/bundleText';
import type { Bundle, BundleStep as Step, StepFields, StepFieldValue } from '../../features/agents/bundleTypes';
import type { AgentAction } from '../../features/agents/agentTypes';
import { AgentActionBody } from '../agents/AgentActionBody';
import { UndoAction } from '../agents/UndoAction';
import { CHECKBOX, CHOICE, FOCUS, FORM_ALERT, MetaParts, NUM, TYPE } from '../ui';
import { StepLinks } from './StepLinks';
import { LINK } from '../brain/styles';
import { BundleStepFields } from './BundleStepFields';
import { PlaceholderText } from './PlaceholderText';
import { BundleStepText } from './BundleStepText';

export interface BundleStepProps {
  bundle: Bundle;
  step: Step;
  /** The panel's edits for this step. */
  entry: { selected: boolean; fields: StepFields };
  errors: Record<string, string>;
  /** The bundle is waiting: tick boxes and disabled reasons show. */
  ticking: boolean;
  /** Fields are live: a waiting bundle, or a failed step to retry (Task 9). */
  editing: boolean;
  onToggle: (selected: boolean) => void;
  onField: (key: string, value: StepFieldValue) => void;
  onUndone: (action: AgentAction, text: string) => void;
  /** Task 9: Retry for a failed step. */
  retry?: React.ReactNode;
  /** Focus left this step's fields: the panel saves them (Decision 6). */
  onLeave?: () => void;
  /** This step's save, shown under its fields. */
  saving?: 'saving' | 'saved' | null;
  /** Slack escalations D4 Decision 1: an escalation's reply, listed first, says it runs last. */
  runsLast?: string;
}

/** One step (spec §8.2; frontend Decisions 7 to 10): tick, kind, title,
 *  "Can't be undone", why it is disabled, its preview, its fields while it
 *  is ticked, then after a run its state, its links and its Undo. */
export function BundleStep({ bundle, step, entry, errors, ticking, editing, onToggle, onField, onUndone, retry, onLeave, saving, runsLast }: BundleStepProps) {
  const id = useId();
  const live = ticking && step.status === 'proposed';
  const action = stepAsAction(bundle, step);
  // The server keeps placeholders in the payload (a task's title, say), so
  // the preview sentence is built from the raw preview and each placeholder
  // drawn as a chip; the title and Undo keep the words (Decision 10).
  const preview =
    step.placeholders.length > 0 ? <PlaceholderText text={previewText({ ...action, preview: step.preview })} placeholders={step.placeholders} /> : undefined;
  const note = step.note ?? '';
  const state = step.status === 'skipped' && note ? note : stepStateText(step);
  const survey = step.preview.survey;
  // Slack bundles: a survey to this record's contacts, a pin into a segment, a scenario run.
  const recordSurvey = step.preview.record_survey;
  const pin = step.preview.segment_pin;
  const question = survey?.question ?? recordSurvey?.question;
  const audience = survey?.audience ?? recordSurvey?.audience ?? step.preview.campaign?.audience;
  const after = afterRunText(step);
  const limit = survey?.limit ?? step.preview.campaign?.limit;
  const heading = `${step.position}. ${step.label}`;
  return (
    <li data-step={step.id} data-testid={`step-${step.id}`} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        {live ? (
          <label className={`${CHOICE} font-semibold`}>
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={entry.selected}
              disabled={!step.can_run}
              aria-describedby={step.disabled_reason ? `${id}-why` : undefined}
              onChange={(event) => onToggle(event.target.checked)}
            />
            {heading}
          </label>
        ) : (
          <p className={TYPE.label}>{heading}</p>
        )}
        <div className={`flex min-w-0 flex-col gap-1 ${live ? 'pl-6' : ''}`.trim()}>
          {runsLast ? <p className={TYPE.meta}>{runsLast}</p> : null}
          <p className={`${TYPE.body} break-words`}>
            <PlaceholderText text={step.title} placeholders={step.placeholders} />
          </p>
          {step.placeholders.length > 0 && step.status === 'proposed' ? <p className={TYPE.meta}>{filledInText(Math.min(...step.placeholders.map((p) => p.step)))}</p> : null}
          {step.edited && step.status === 'proposed' ? <p className={TYPE.meta}>{BUNDLE.EDITED}</p> : null}
          {showsCantUndo(step, entry.fields) && step.status !== 'applied' ? (
            <p data-part="cant-undo" className={`inline-flex items-center gap-1 ${TYPE.meta}`}>
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {BUNDLE.CANT_UNDO}
            </p>
          ) : null}
          {live && step.disabled_reason ? (
            <p id={`${id}-why`} className={TYPE.bodyMuted}>
              {step.disabled_reason}
              {step.disabled_link && isAppPath(step.disabled_link) ? (
                <>
                  {' '}
                  <Link to={step.disabled_link} className={LINK}>
                    {OUTSIDE.OPEN_SETTING}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      <AgentActionBody action={action} preview={preview} />
      {live && !step.can_run && step.disabled_link ? <BundleStepText step={step} /> : null}
      {live && !step.can_run && !step.disabled_link && step.preview.slack?.excerpt ? (
        <blockquote data-part="excerpt" className={`${TYPE.bodyMuted} max-w-[68ch] whitespace-pre-line border-l-2 border-line pl-3`}>
          {step.preview.slack.excerpt}
        </blockquote>
      ) : null}
      {question ? (
        <p className={TYPE.body}>
          <span className="font-semibold">{BUNDLE.QUESTION}: </span>
          {question}
        </p>
      ) : null}
      {pin ? (
        <p data-part="pin" className={TYPE.bodyMuted}>
          {pinText(pin)}
        </p>
      ) : null}
      {audience ? (
        <p className={TYPE.bodyMuted}>
          <span className="sr-only">{`${BUNDLE.AUDIENCE}: `}</span>
          <span className={NUM}>{audienceText(audience, limit)}</span>
        </p>
      ) : null}
      {(live && entry.selected && step.can_run) || (editing && step.status === 'failed') ? (
        <div
          onBlur={(event) => {
            // Saved when focus leaves this step's fields, not between them.
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave?.();
          }}
        >
          <BundleStepFields bundle={bundle} step={step} fields={entry.fields} errors={errors} onField={onField} />
        </div>
      ) : null}
      {live ? (
        <p role="status" className={`${TYPE.meta} empty:sr-only`}>
          {saving === 'saving' ? BUNDLE.SAVING : saving === 'saved' ? BUNDLE.SAVED : null}
        </p>
      ) : null}
      {step.status === 'failed' ? (
        <div className="flex flex-col gap-2">
          <p data-focus="" tabIndex={-1} role="alert" className={`${FORM_ALERT} ${FOCUS}`}>
            {step.error}
          </p>
          {retry}
        </div>
      ) : null}
      {state && step.status !== 'proposed' ? (
        <p data-part="state" data-focus="" tabIndex={-1} className={`${TYPE.meta} ${FOCUS}`}>
          <MetaParts parts={[state, after]} />
        </p>
      ) : null}
      {step.status === 'applied' && note ? <p className={TYPE.meta}>{note}</p> : null}
      {step.status === 'applied' ? <StepLinks links={step.links ?? []} /> : null}
      {step.status === 'applied' && step.undo ? <UndoAction action={action} onUndone={onUndone} /> : null}
    </li>
  );
}
