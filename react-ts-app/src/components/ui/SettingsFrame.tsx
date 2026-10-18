import { useContext, useEffect, useId, type ReactNode, type Ref } from 'react';
import { Info, Loader2, Lock, TriangleAlert } from 'lucide-react';
import { Card, CardFooter } from './Card';
import { FIELD_ERROR, FOCUS, PRIMARY } from './styles';
import { TYPE } from './type';
import { SettingsTabsSlot } from './settingsTabsSlot';
import { SettingsDraftScope } from './SettingsDraft';
import { submitDraftOnEnter } from './settingsDraftContext';
import { ToastProvider } from './Toast';

/** Every /settings page's frame (UI foundations spec §6.3): the h1 (its
 *  text equals the nav label: pass `settingsTitle(path)`), a muted intro, an
 *  optional one-line note (a SettingsNote: "you can't change this"), an
 *  optional action on the heading row, then sections. One width for every
 *  page (spec §5.1), so it never re-centres. `headingRef` makes the h1 a
 *  focus target (after a Try again). Account settings keep their own
 *  layout this round. */
export function SettingsFrame({
  title,
  intro,
  note,
  action,
  headingRef,
  children,
}: {
  title: string;
  intro?: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  const tabs = useContext(SettingsTabsSlot);
  return (
    // Enter in a field of a button-less form submits it, which saves through the bar.
    <div onKeyDown={submitDraftOnEnter} className="flex w-full max-w-[960px] flex-col gap-8 px-4 pt-8 pb-6 md:px-6">
      <ToastProvider>
        <SettingsDraftScope>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={headingRef ? `${TYPE.display} rounded-sm ${FOCUS}` : TYPE.display}>
                {title}
              </h1>
              {/* Each tab has its own intro; two reserved lines keep the tab row from jumping between tabs. */}
              {intro ? <p className={`${TYPE.bodyMuted} max-w-[68ch] ${tabs ? 'sm:min-h-[2lh]' : ''}`}>{intro}</p> : null}
              {note ? <div className="mt-1">{note}</div> : null}
            </div>
            {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
          </div>
          {tabs ? <div className="-mt-2 h-11 border-b border-line">{tabs}</div> : null}
          <div className="flex flex-col gap-8">{children}</div>
        </SettingsDraftScope>
      </ToastProvider>
    </div>
  );
}

/** A titled section: the heading (and one `action`) outside, one card
 *  inside. The body is divided rows, or with `list` a labelled list of
 *  rows; `header` sits inside the card above it (column labels); `state`
 *  (loading, empty, error) takes the body's place in the same card. A
 *  one-section form puts SettingsSave in `footer`. The section is the
 *  container its list grid queries. */
export function SettingsSection({
  title,
  description,
  action,
  footer,
  list,
  header,
  state,
  variant = 'default',
  look = 'split',
  headingRef,
  listRef,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  list?: string;
  header?: ReactNode;
  state?: ReactNode;
  variant?: 'default' | 'danger';
  /** `card`: the account-settings look (owner, 2026-10-16), the title,
   *  description and action inside the card above its body. `split` (the
   *  default for now): the title and description outside, beside or above it. */
  look?: 'split' | 'card';
  headingRef?: Ref<HTMLHeadingElement>;
  /** Makes the labelled list programmatically focusable (tabIndex -1), for
   *  moving focus there when the row that had it is deleted. */
  listRef?: Ref<HTMLUListElement>;
  children?: ReactNode;
}) {
  const headingId = useId();
  const body =
    state ??
    (list ? (
      <ul
        role="list"
        aria-label={list}
        ref={listRef}
        tabIndex={listRef ? -1 : undefined}
        className={listRef ? `divide-y divide-line-subtle ${FOCUS}` : 'divide-y divide-line-subtle'}
      >
        {children}
      </ul>
    ) : (
      <div className="divide-y divide-line-subtle">{children}</div>
    ));
  const stacked = Boolean(list || header);
  const titleClass = variant === 'danger' ? TYPE.title.replace('text-ink', 'text-danger-ink') : TYPE.title;
  const heading = (
    <h2 id={headingId} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={headingRef ? `${titleClass} rounded-sm ${FOCUS}` : titleClass}>
      {title}
    </h2>
  );
  if (look === 'card') {
    return (
      <Card as="section" pad="none" aria-labelledby={headingId} className="@container min-w-0 overflow-hidden">
        {/* px-4 like SettingsRow, so the title lines up with the rows. */}
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            {heading}
            {description ? <div className={`${TYPE.bodyMuted} max-w-[68ch]`}>{description}</div> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
        {header ? <div className="border-t border-line-subtle">{header}</div> : null}
        {children || state ? <div className="border-t border-line-subtle">{body}</div> : null}
        {footer ? <CardFooter>{footer}</CardFooter> : null}
      </Card>
    );
  }
  return (
    <section
      aria-labelledby={headingId}
      className={`@container [section+&]:border-t [section+&]:border-line [section+&]:pt-8 ${stacked ? 'flex flex-col gap-3' : 'grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8'}`}
    >
      <div className={stacked ? 'flex flex-wrap items-end justify-between gap-3' : 'flex min-w-0 flex-col gap-1'}>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={headingRef ? `${titleClass} rounded-sm ${FOCUS}` : titleClass}>
            {title}
          </h2>
          {description ? <div className={`${TYPE.bodyMuted} ${stacked ? 'max-w-[68ch]' : 'max-w-[40ch]'}`}>{description}</div> : null}
        </div>
        {action ? <div className={stacked ? 'flex shrink-0 items-center gap-2' : 'mt-2 flex items-center gap-2'}>{action}</div> : null}
      </div>
      <Card as="div" pad="none" className={`min-w-0 ${list ? 'overflow-hidden' : ''}`}>
        {header}
        {body}
        {footer ? <CardFooter>{footer}</CardFooter> : null}
      </Card>
    </section>
  );
}

/** A settings card in the account-settings look (owner, 2026-10-16): the
 *  title, an optional logo and one line of description inside the card,
 *  then its rows under a divider (a labelled list when `list` is given). */
export function SettingsCard({
  title,
  description,
  logo,
  action,
  list,
  children,
}: {
  title: string;
  description?: ReactNode;
  logo?: ReactNode;
  action?: ReactNode;
  list?: string;
  children?: ReactNode;
}) {
  const headingId = useId();
  return (
    <Card as="section" pad="none" aria-labelledby={headingId} className="min-w-0 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        {logo ? (
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle ring-1 ring-line-subtle">
            {logo}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={headingId} className={TYPE.title}>
            {title}
          </h2>
          {description ? <div className={`${TYPE.bodyMuted} max-w-[68ch]`}>{description}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children ? (
        list ? (
          <ul role="list" aria-label={list} className="divide-y divide-line-subtle border-t border-line-subtle">
            {children}
          </ul>
        ) : (
          <div className="divide-y divide-line-subtle border-t border-line-subtle">{children}</div>
        )
      ) : null}
    </Card>
  );
}

/** One setting: label and hint on the left from sm, the control on the
 *  right (`stacked`: the label above at every width). Pass `htmlFor` when
 *  the control is a single input or select, `group` when it is a set of
 *  checkboxes or a switch with words (the row is a group named by the
 *  label). An `error` sits under the control with `errorId`: the control
 *  names it in `aria-describedby` and carries `aria-invalid`. */
export function SettingsRow({
  label,
  hint,
  hintId,
  htmlFor,
  error,
  errorId,
  stacked = false,
  group = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  hintId?: string;
  htmlFor?: string;
  error?: ReactNode;
  errorId?: string;
  stacked?: boolean;
  group?: boolean;
  children: ReactNode;
}) {
  const labelId = useId();
  useEffect(() => {
    if (import.meta.env.DEV && error && !errorId) console.error('SettingsRow: an error needs the errorId its control points at');
  }, [error, errorId]);
  return (
    <div
      role={group ? 'group' : undefined}
      aria-labelledby={group ? labelId : undefined}
      className={stacked ? 'flex flex-col gap-2 px-4 py-3' : 'flex min-h-14 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6'}
    >
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-1">
        {htmlFor ? (
          <label id={group ? labelId : undefined} htmlFor={htmlFor} className={TYPE.label}>
            {label}
          </label>
        ) : (
          <p id={group ? labelId : undefined} className={TYPE.label}>
            {label}
          </p>
        )}
        {hint ? (
          <p id={hintId} className={TYPE.meta}>
            {hint}
          </p>
        ) : null}
      </div>
      <div className={stacked ? 'min-w-0' : 'flex w-full min-w-0 flex-col sm:w-auto sm:min-w-64 sm:max-w-sm sm:items-end'}>
        {children}
        {error ? (
          <p id={errorId} role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface SaveProps {
  dirty: boolean;
  saving: boolean;
  /** "Saved.", "No changes to save.": announced politely, never unmounted. */
  status?: string;
  /** Without it the button submits its form. */
  onSave?: () => void;
  label?: string;
  busyLabel?: string;
}

/** The one PRIMARY. aria-disabled, never disabled: after a save it keeps
 *  focus (a disabled button would drop it to the page). */
function SaveButton({ dirty, saving, onSave, label = 'Save changes', busyLabel = 'Saving…' }: SaveProps) {
  return (
    <button
      type={onSave ? 'button' : 'submit'}
      onClick={
        onSave
          ? () => {
              if (dirty && !saving) onSave();
            }
          : undefined
      }
      aria-disabled={!dirty || saving || undefined}
      aria-busy={saving || undefined}
      className={PRIMARY}
    >
      {saving ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
      {saving ? busyLabel : label}
    </button>
  );
}

/** A one-section form's Save, for that section's footer: its status
 *  region (always there) and its one PRIMARY. A submit handler still
 *  returns early while nothing changed. */
export function SettingsSave(props: SaveProps) {
  return (
    <>
      <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
        {props.status ?? ''}
      </p>
      <SaveButton {...props} />
    </>
  );
}

const NOTE_ICON = { info: Info, lock: Lock, warning: TriangleAlert } as const;

/** A one-line callout (spec §6.3): an icon and a sentence, no box. `lock`
 *  says why a control is read-only; `warning` names a real consequence and
 *  is set in ink (amber text fails contrast). */
export function SettingsNote({ icon = 'info', children }: { icon?: keyof typeof NOTE_ICON; children: ReactNode }) {
  const Icon = NOTE_ICON[icon];
  return (
    <p data-part="settings-note" className={`flex items-start gap-2 ${icon === 'warning' ? TYPE.body : TYPE.bodyMuted}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon === 'warning' ? 'text-warning' : 'text-ink-faint'}`} aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
