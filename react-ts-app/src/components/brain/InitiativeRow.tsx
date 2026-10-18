import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CurrencyCode } from '../../features/auth/authSlice';
import { editInitiative } from '../../features/brain/brainApi';
import type { DoingInitiative, InitiativePatch } from '../../features/brain/brainTypes';
import { bookText, daysLeftParts, DO, initiativeStatusLabel, isClosed, progressFigures, taskStatusText } from '../../features/brain/doingText';
import { formatDate } from '../../features/customers/formatters';
import { recordHref } from '../../features/segments/segmentFields';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, DANGER, NUM, QUIET, TYPE } from '../ui';
import { CloseInitiativeForm, EditInitiativeForm } from './InitiativeForm';
import { LINK } from './styles';

type Mode = 'view' | 'edit' | 'done' | 'abandoned';
type Focus = 'edit' | 'close' | 'abandon' | 'reopen';

/** One initiative (spec §2.1; plan Decision 6), flat inside the section's
 *  list. Edit, close and reopen are sent once; focus lands back on the
 *  control that fits what just changed. */
export function InitiativeRow({ initiative: one, readerId, currency, onChanged }: {
  initiative: DoingInitiative;
  readerId: number;
  currency: CurrencyCode;
  onChanged: (next: DoingInitiative) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();
  const rowRef = useRef<HTMLLIElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const focusAfter = useRef<Focus | null>(null);
  const detailsId = useId();
  const progress = one.progress;
  const figures = progress ? progressFigures(progress, currency) : null;
  const days = progress ? daysLeftParts(progress.days_left, one.status) : null;
  const closed = isClosed(one.status);
  const pct = progress ? progress.progress_pct : null;
  const hasDetails = Boolean(one.hypothesis) || Boolean(one.outcome) || one.work.tasks !== undefined;

  useEffect(() => {
    const target = focusAfter.current;
    if (!target || mode !== 'view') return;
    focusAfter.current = null;
    rowRef.current?.querySelector<HTMLElement>(`[data-focus="${target}"]`)?.focus();
  }, [one, mode]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function back(to: Focus) {
    focusAfter.current = to;
    setError(null);
    setMode('view');
  }

  async function send(patch: InitiativePatch, to: Focus) {
    setError(null);
    const outcome = await run(() => editInitiative(one.id, patch));
    if (!outcome) return;
    if (outcome.ok) {
      onChanged(outcome.value);
      back(to);
    } else setError(errorMessage(outcome.error, DO.SAVE_FAILED));
  }

  return (
    <li ref={rowRef} data-initiative={one.id} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className={`${TYPE.body} font-semibold`}>{one.title}</h3>
        <p data-part="meta" className={TYPE.bodyMuted}>
          {[one.metric_label, bookText(one, readerId), initiativeStatusLabel(one.status), one.owner?.name ?? DO.NO_OWNER].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        {figures === null ? (
          <p data-part="figures" className={TYPE.bodyMuted}>
            {DO.OUTSIDE_VIEW}
          </p>
        ) : (
          <>
            <p data-part="figures" className={TYPE.body}>
              {figures.baseline === null ? null : (
                <>
                  <span className={NUM}>{figures.baseline}</span> →{' '}
                </>
              )}
              <span className={NUM}>{figures.now}</span> → <span className={NUM}>{figures.target}</span>
            </p>
            {pct === null ? (
              <p className={TYPE.bodyMuted}>{DO.NOT_MEASURABLE}</p>
            ) : (
              <div
                role="progressbar"
                aria-label={`${one.title}: progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-2 overflow-hidden rounded-full bg-line"
              >
                <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
              </div>
            )}
          </>
        )}
      </div>
      <p data-part="when" className={TYPE.bodyMuted}>
        {days ? (
          <>
            <span className={NUM}>{days.n}</span> {days.words} ·{' '}
          </>
        ) : null}
        by <span className={NUM}>{formatDate(one.target_by)}</span>
      </p>
      <p data-part="work" className={TYPE.bodyMuted}>
        Tasks: <span className={NUM}>{one.work.open}</span> open · <span className={NUM}>{one.work.done}</span> done
      </p>
      <div className="flex flex-wrap gap-2">
        {hasDetails ? (
          <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((v) => !v)} className={QUIET}>
            {DO.DETAILS}
          </button>
        ) : null}
        {one.can_edit && mode === 'view' ? (
          closed ? (
            <button type="button" data-focus="reopen" disabled={busy} onClick={() => void send({ status: 'active' }, 'close')} className={QUIET}>
              {DO.REOPEN}
            </button>
          ) : (
            <>
              <button type="button" data-focus="edit" onClick={() => setMode('edit')} className={QUIET}>
                {DO.EDIT}
              </button>
              <button type="button" data-focus="close" onClick={() => setMode('done')} className={BUTTON}>
                {DO.MARK_DONE}
              </button>
              <button type="button" data-focus="abandon" onClick={() => setMode('abandoned')} className={DANGER}>
                {DO.ABANDON}
              </button>
            </>
          )
        ) : null}
      </div>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-[13px] leading-5 text-danger-ink outline-none">
          {error}
        </p>
      ) : null}
      {mode === 'edit' ? (
        <EditInitiativeForm initiative={one} busy={busy} onSave={(patch) => void send(patch, 'edit')} onCancel={() => back('edit')} />
      ) : null}
      {mode === 'done' || mode === 'abandoned' ? (
        <CloseInitiativeForm
          as={mode}
          busy={busy}
          onClose={(outcome) => void send({ status: mode, outcome }, 'reopen')}
          onCancel={() => back(mode === 'done' ? 'close' : 'abandon')}
        />
      ) : null}
      {hasDetails ? (
        <div id={detailsId} hidden={!open} data-part="details" className="flex flex-col gap-2 border-t border-line-subtle pt-2">
          {one.hypothesis ? (
            <p className={TYPE.body}>
              <span className="text-ink-muted">{DO.HYPOTHESIS}: </span>
              {one.hypothesis}
            </p>
          ) : null}
          {one.outcome ? (
            <p className={TYPE.body}>
              <span className="text-ink-muted">{DO.OUTCOME}: </span>
              {one.outcome}
            </p>
          ) : null}
          {/* A plain `div`, not `ul`: an `li` only gets the implicit
           *  `listitem` role as a direct descendant of `ul`/`ol`/`menu`
           *  (aria-query), and this row already lives inside one `<li>`,
           *  so a nested `ul` would make `getByRole('listitem')` ambiguous
           *  once the panel opens. */}
          {one.work.tasks === undefined ? null : one.work.tasks.length === 0 ? (
            <p className={TYPE.bodyMuted}>{DO.NO_TASKS}</p>
          ) : (
            <div role="group" aria-label={DO.TASKS} className="flex flex-col gap-1">
              {one.work.tasks.map((task) => (
                <div key={task.id} className={`flex flex-wrap items-baseline gap-x-2 ${TYPE.body}`}>
                  <span className="font-semibold text-ink">{task.title}</span>
                  <Link to={recordHref(task.parent_type, task.parent_id)} className={LINK}>
                    {task.parent_name}
                  </Link>
                  <span className="text-ink-muted">
                    {task.assignee_name} · due <span className={NUM}>{formatDate(task.due_date)}</span> · {taskStatusText(task.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
