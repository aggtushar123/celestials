import { useId, useRef, useState } from 'react';
import { FEED, addedToMineText } from '../../features/work/feed';
import { REC, assignedStatus, cantDecide, decidedElsewhere, dismissedStatus } from '../../features/work/recommended';
import { assignRecommendation } from '../../features/work/workApi';
import type { FeedGroupKey, FeedItem, SuggestionFeedItem } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Figured } from '../brain/Figured';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, OverflowMenu, QUIET, TYPE } from '../ui';
import { AssignForm } from './AssignForm';
import { DismissForm } from './DismissForm';
import type { Settle } from './FeedDecideRows';
import { FeedRowMeta, KIND_ICON, ROW_FOCUS } from './FeedRowParts';
import { recommendationsChanged, taskChanged } from './taskChanges';
import { useTaskLink } from './useTaskLink';

type Mode = 'idle' | 'assign' | 'dismiss';

/** A suggestion (spec §5): its facts, then Add to my work (a task for the
 *  reader, contract: assign to self), Assign and Dismiss (the existing
 *  forms). On a phone Assign and Dismiss move into the row menu. A 404 or
 *  CANT_DECIDE is lost access (Decision 6); a 409 says who decided. Add
 *  is aria-disabled while it sends, not disabled, so focus stays on it.
 */
export function FeedSuggestionRow({
  item,
  group,
  isSm,
  me,
  onSettled,
  onGone,
  onLost,
}: {
  item: SuggestionFeedItem;
  group: FeedGroupKey;
  isSm: boolean;
  me: number | null;
  onSettled: (item: FeedItem, settle: Settle) => void;
  onGone: (item: FeedItem, text: string) => void;
  onLost: (item: FeedItem, text: string) => void;
}) {
  const titleId = useId();
  const formId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const taskLink = useTaskLink();
  const rec = item.detail;
  const record = rec.record;
  const assignable = record !== null && rec.defaults !== null;
  const addable = assignable && item.actions.includes('add');
  const gone = (text: string) => (text === REC.GONE ? onLost(item, text) : onGone(item, text));
  const Icon = KIND_ICON.suggestion;

  async function add() {
    if (me === null) return;
    setError(null);
    const outcome = await run(() => assignRecommendation(rec.id, { assignee_id: me }));
    if (!outcome) return;
    if (outcome.ok) {
      taskChanged();
      const task = outcome.value.task;
      onSettled(item, { text: addedToMineText(task.title), link: { label: FEED.OPEN_TASK, ...taskLink(task.id) } });
      return;
    }
    const elsewhere = decidedElsewhere(outcome.error);
    if (elsewhere) gone(elsewhere);
    else if (cantDecide(outcome.error)) onLost(item, FEED.CANT_DECIDE);
    else setError(errorMessage(outcome.error, REC.ASSIGN_FAILED));
  }

  // Cancel: focus back on Add to my work, or, on a row without one, on what
  // opened the form (Dismiss, or the row menu on a phone): the first button.
  const cancel = () => {
    setMode('idle');
    (addRef.current ?? actionsRef.current?.querySelector('button'))?.focus();
  };
  const toggle = (next: Mode) => setMode((current) => (current === next ? 'idle' : next));
  const actions = (
    <>
      {addable ? (
        <button ref={addRef} type="button" aria-disabled={busy || undefined} onClick={() => void add()} aria-describedby={titleId} className={BUTTON}>
          {FEED.ADD_TO_MINE}
        </button>
      ) : null}
      {isSm ? (
        <>
          {assignable ? (
            <button type="button" aria-expanded={mode === 'assign'} aria-controls={mode === 'assign' ? formId : undefined} onClick={() => toggle('assign')} className={QUIET}>
              {FEED.ASSIGN}
            </button>
          ) : null}
          <button type="button" aria-expanded={mode === 'dismiss'} aria-controls={mode === 'dismiss' ? formId : undefined} onClick={() => toggle('dismiss')} className={QUIET}>
            {FEED.DISMISS}
          </button>
        </>
      ) : (
        <OverflowMenu
          label={FEED.ROW_ACTIONS}
          items={[
            ...(assignable ? [{ key: 'assign', label: FEED.ASSIGN, onSelect: () => setMode('assign') }] : []),
            { key: 'dismiss', label: FEED.DISMISS, onSelect: () => setMode('dismiss') },
          ]}
        />
      )}
    </>
  );
  return (
    <li data-item={item.key} className={`group flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {item.title}
        </h3>
        <FeedRowMeta item={item} group={group} />
        {rec.why.facts.length > 0 ? (
          <ul aria-label={REC.WHY} className={`flex max-w-[68ch] list-disc flex-col gap-0.5 pl-5 ${TYPE.body}`}>
            {rec.why.facts.map((fact, index) => (
              <li key={index}>
                <Figured text={fact} />
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] leading-5 text-danger-ink">
            {error}
          </p>
        ) : null}
        <div ref={actionsRef} className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
        {mode === 'assign' && assignable && record ? (
          <div id={formId}>
            <AssignForm
              rec={{ ...rec, record }}
              onAssigned={(answer) => {
                taskChanged();
                onSettled(item, { text: assignedStatus(answer.task.title, answer.task.assignee, me), link: { label: FEED.OPEN_TASK, ...taskLink(answer.task.id) } });
              }}
              onGone={gone}
              onRefused={() => onLost(item, FEED.CANT_DECIDE)}
              onCancel={cancel}
            />
          </div>
        ) : null}
        {mode === 'dismiss' ? (
          <div id={formId}>
            <DismissForm
              rec={rec}
              onDismissed={() => {
                recommendationsChanged();
                onSettled(item, { text: dismissedStatus(rec.title) });
              }}
              onGone={gone}
              onRefused={() => onLost(item, FEED.CANT_DECIDE)}
              onCancel={cancel}
            />
          </div>
        ) : null}
      </article>
    </li>
  );
}
