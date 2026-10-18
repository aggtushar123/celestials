import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { RuleDraft } from '../../features/rules/ruleDraft';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { CADENCE_LABEL, DIRECTION_LABEL, SCORE_LABEL, SCORE_RANGES, scoresFor, triggerOption, WEEKDAYS } from '../../features/rules/ruleOptions';
import { rangeHint } from '../../features/rules/ruleText';
import type { Cadence, Direction, Score, Trigger } from '../../features/rules/ruleTypes';
import type { SegmentKind, SegmentListRow } from '../../features/segments/segmentTypes';
import type { SegmentRef } from '../../features/surveys/surveyTypes';
import { segmentSelectOptions } from '../surveys/segmentSelectOptions';
import { FOCUS, INLINE_TARGET, INPUT, INVALID, NUM, Select, TYPE } from '../ui';
import { Field } from './Field';

const TRIGGERS: readonly Trigger[] = ['entered', 'left', 'crossed', 'schedule'];
const DIRECTIONS: readonly Direction[] = ['below', 'above'];
const CADENCES: readonly Cadence[] = ['weekly', 'monthly'];

/** When the rule acts (spec §2.2): the trigger, worded for the segment's
 *  kind, and one of the caller's own segments; then the score, direction
 *  and value of a line, or the day of a schedule. Contacts have no scores
 *  and accounts no CES, so those choices are not offered. */
export function TriggerFields({ draft, kind, segments, segmentsError, fallback, errors, onChange }: {
  draft: RuleDraft;
  kind: SegmentKind | null;
  /** The caller's own segments; null while loading. */
  segments: SegmentListRow[] | null;
  segmentsError: string | null;
  fallback: SegmentRef | null;
  errors: RuleErrors['field'];
  onChange: (patch: Partial<RuleDraft>) => void;
}) {
  const headingId = useId();
  const triggerId = useId();
  const segmentId = useId();
  const scoreId = useId();
  const directionId = useId();
  const valueId = useId();
  const cadenceId = useId();
  const dayId = useId();
  const scores = scoresFor(kind);
  const score: Score | '' = draft.score && scores.includes(draft.score) ? draft.score : '';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className={TYPE.title}>
        When
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={triggerId}
          label="Trigger"
          hint={kind === 'contact' ? 'Contacts have no scores, so a score rule needs an organisation or account segment.' : null}
          error={errors.trigger}
        >
          {(aria) => (
            <Select
              id={triggerId}
              label="Trigger"
              labelPosition="external"
              invalid={aria['aria-invalid']}
              describedBy={aria['aria-describedby']}
              value={draft.trigger}
              onChange={(trigger) => onChange({ trigger })}
              options={TRIGGERS.map((trigger) => ({ value: trigger, label: triggerOption(trigger, kind), disabled: trigger === 'crossed' && kind === 'contact' }))}
            />
          )}
        </Field>
        <Field id={segmentId} label="Segment" hint="Only your own segments: a rule runs as you, on records you can open." error={errors.segment}>
          {(aria) => (
            <Select
              id={segmentId}
              label="Segment"
              labelPosition="external"
              invalid={aria['aria-invalid']}
              describedBy={aria['aria-describedby']}
              value={draft.segment === null ? '' : String(draft.segment)}
              disabled={segments === null}
              onChange={(value) => onChange({ segment: value ? Number(value) : null })}
              options={segmentSelectOptions(segments, fallback)}
            />
          )}
        </Field>
      </div>
      {segmentsError ? (
        <p role="alert" className="text-[11px] leading-4 text-danger-ink">
          {segmentsError}
        </p>
      ) : null}
      {segments !== null && segments.length === 0 && !segmentsError ? (
        <p className={TYPE.meta}>
          You have no segments yet.{' '}
          <Link to="/segments/new" className={`${INLINE_TARGET} font-semibold text-ink underline ${FOCUS}`}>
            Make one
          </Link>
          , then automate it.
        </p>
      ) : null}
      {draft.trigger === 'crossed' && kind !== 'contact' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id={scoreId} label="Score" error={errors.score}>
            {(aria) => (
              <Select
                id={scoreId}
                label="Score"
                labelPosition="external"
                invalid={aria['aria-invalid']}
                describedBy={aria['aria-describedby']}
                value={score}
                onChange={(value) => onChange({ score: value })}
                options={[{ value: '', label: 'Choose a score…' }, ...scores.map((option) => ({ value: option, label: SCORE_LABEL[option] }))]}
              />
            )}
          </Field>
          <Field id={directionId} label="Direction" error={errors.direction}>
            {(aria) => (
              <Select
                id={directionId}
                label="Direction"
                labelPosition="external"
                invalid={aria['aria-invalid']}
                describedBy={aria['aria-describedby']}
                value={draft.direction}
                onChange={(direction) => onChange({ direction })}
                options={DIRECTIONS.map((direction) => ({ value: direction, label: DIRECTION_LABEL[direction] }))}
              />
            )}
          </Field>
          <Field id={valueId} label="Value" hint={score ? rangeHint(score) : null} error={errors.threshold}>
            {(aria) => (
              <input
                id={valueId}
                {...aria}
                type="number"
                inputMode="decimal"
                step="any"
                min={score ? SCORE_RANGES[score][0] : undefined}
                max={score ? SCORE_RANGES[score][1] : undefined}
                value={draft.threshold}
                onChange={(event) => onChange({ threshold: event.target.value })}
                className={`${INPUT} ${INVALID} ${NUM}`}
              />
            )}
          </Field>
        </div>
      ) : null}
      {draft.trigger === 'schedule' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={cadenceId}
            label="Repeat"
            hint={draft.cadence === 'monthly' ? 'On the 1st of each month, overnight (UTC).' : 'Overnight (UTC) on the day you choose.'}
            error={errors.cadence}
          >
            {(aria) => (
              <Select
                id={cadenceId}
                label="Repeat"
                labelPosition="external"
                invalid={aria['aria-invalid']}
                describedBy={aria['aria-describedby']}
                value={draft.cadence}
                onChange={(cadence) => onChange({ cadence })}
                options={CADENCES.map((cadence) => ({ value: cadence, label: CADENCE_LABEL[cadence] }))}
              />
            )}
          </Field>
          {draft.cadence === 'weekly' ? (
            <Field id={dayId} label="Day" error={errors.weekday}>
              {(aria) => (
                <Select
                  id={dayId}
                  label="Day"
                  labelPosition="external"
                  invalid={aria['aria-invalid']}
                  describedBy={aria['aria-describedby']}
                  value={String(draft.weekday)}
                  onChange={(day) => onChange({ weekday: Number(day) })}
                  options={WEEKDAYS.map((day, index) => ({ value: String(index), label: day }))}
                />
              )}
            </Field>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
