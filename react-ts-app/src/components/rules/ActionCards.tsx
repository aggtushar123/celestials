import { useId } from 'react';
import { Plus, X } from 'lucide-react';
import { availableActions, newAction, type ActionDraft } from '../../features/rules/ruleDraft';
import type { ActionErrors } from '../../features/rules/ruleErrors';
import { ACTION_LABEL } from '../../features/rules/ruleOptions';
import type { ActionType } from '../../features/rules/ruleTypes';
import type { PersonRef, SegmentKind } from '../../features/segments/segmentTypes';
import { BUTTON, FOCUS, ICON_BUTTON, TYPE } from '../ui';
import { CampaignFields, LifecycleFields, NotifyFields, PlanFields, SurveyFields, TaskFields } from './ActionFields';

/** Then (spec §2.2): one to three action cards, each type once. Internal
 *  actions run on their own; a survey waits for review unless told
 *  otherwise. Errors show at each card's own fields (backend: a list
 *  aligned with the actions). */
export function ActionCards({ actions, kind, workspace, teammates, errors, listError, note = '', onChange }: {
  actions: ActionDraft[];
  kind: SegmentKind | null;
  workspace: string;
  teammates: PersonRef[];
  errors: ActionErrors[];
  listError?: string;
  /** A polite line under Then, e.g. a card dropped by a segment change. */
  note?: string;
  onChange: (actions: ActionDraft[]) => void;
}) {
  const headingId = useId();
  const replace = (index: number, next: ActionDraft) => onChange(actions.map((action, at) => (at === index ? next : action)));
  const remove = (index: number) => onChange(actions.filter((_, at) => at !== index));
  // `newAction`'s overloads take a literal type; a switch (rather than a cast)
  // keeps each branch checked against its own overload.
  const add = (type: ActionType) => {
    switch (type) {
      case 'notify':
        onChange([...actions, newAction('notify', kind, workspace)]);
        return;
      case 'task':
        onChange([...actions, newAction('task', kind, workspace)]);
        return;
      case 'lifecycle':
        onChange([...actions, newAction('lifecycle', kind, workspace)]);
        return;
      case 'survey':
        onChange([...actions, newAction('survey', kind, workspace)]);
        return;
      case 'plan':
        onChange([...actions, newAction('plan', kind, workspace)]);
        return;
      case 'campaign':
        onChange([...actions, newAction('campaign', kind, workspace)]);
        return;
    }
  };
  const addable = availableActions(actions, kind);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className={TYPE.title}>
        Then
      </h3>
      <p className={TYPE.meta}>One to three actions, each once. Notify, tasks, lifecycle and plans run on their own; a survey or a campaign waits for your review unless you say otherwise.</p>
      <ul aria-label="Actions" className="flex flex-col divide-y divide-line-subtle">
        {actions.map((action, index) => {
          const own = errors[index] ?? {};
          return (
            <li key={action.action} data-action={action.action} className="flex flex-col gap-3 py-4 first:pt-0">
              <div className="flex items-center gap-2">
                <h4 className={`min-w-0 flex-1 ${TYPE.label}`}>{ACTION_LABEL[action.action]}</h4>
                {actions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${ACTION_LABEL[action.action]}`}
                    className={ICON_BUTTON}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              {action.action === 'notify' ? <NotifyFields action={action} teammates={teammates} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'task' ? <TaskFields action={action} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'lifecycle' ? <LifecycleFields action={action} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'survey' ? <SurveyFields action={action} kind={kind} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'plan' ? <PlanFields action={action} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {action.action === 'campaign' ? <CampaignFields action={action} kind={kind} errors={own} onChange={(next) => replace(index, next)} /> : null}
              {own.action ? (
                <p role="alert" data-error tabIndex={-1} className={`text-[11px] leading-4 text-danger-ink ${FOCUS}`}>
                  {own.action}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p role="status" className={`${TYPE.meta} empty:sr-only`}>
        {note}
      </p>
      {listError ? (
        <p role="alert" data-error tabIndex={-1} className={`text-[11px] leading-4 text-danger-ink ${FOCUS}`}>
          {listError}
        </p>
      ) : null}
      {addable.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {addable.map((type) => (
            <button key={type} type="button" onClick={() => add(type)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {ACTION_LABEL[type]}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
