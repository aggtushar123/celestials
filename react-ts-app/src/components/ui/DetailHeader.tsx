import { useEffect, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import { Menu, type MenuItem } from './Menu';
import { BUTTON, FOCUS, ICON_BUTTON, PRIMARY } from './styles';
import { TYPE } from './type';

/** One visible action on a detail page's name row. */
export interface HeaderAction {
  key: string;
  label: string;
  icon: LucideIcon;
  /** A link (Edit opens its route over the page). */
  to?: string;
  /** A button. */
  onSelect?: () => void;
  /** The page's one primary (Send now, Save). */
  primary?: boolean;
  disabled?: boolean;
  /** A toggle (Edit, Done editing). */
  pressed?: boolean;
  /** Its words while it works ("Saving…"); also marks it aria-busy. */
  busyLabel?: string;
}

const ACTION = 'min-w-11 justify-center sm:min-w-0';

function ActionButton({ action }: { action: HeaderAction }) {
  const Icon = action.icon;
  const className = `${action.primary ? PRIMARY : BUTTON} ${ACTION}`;
  const body = (
    <>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {/* Icon-only below sm, so the name keeps the row. */}
      <span className="sr-only sm:not-sr-only">{action.busyLabel ?? action.label}</span>
    </>
  );
  if (action.to && !action.disabled) {
    return (
      <Link to={action.to} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onSelect}
      disabled={action.disabled}
      aria-pressed={action.pressed}
      aria-busy={action.busyLabel ? true : undefined}
      className={className}
    >
      {body}
    </button>
  );
}

/** A detail page's name row (UI foundations spec §6.1, §7, §9.2 row 3; the
 *  Impact pages): the name as the page's one display h1 (or `heading`, an
 *  editable name that holds its own h1), a short `description`, then on the
 *  right at most two visible controls (`control`, such as a rule's switch or
 *  a plan's status, counts as one) and the ⋯ menu, whose danger items
 *  (Delete, Cancel plan) always come last. Under it one muted `meta` line,
 *  then a polite `status` region that is always mounted (empty until there
 *  is something to say: Unsaved changes, Sending now, Paused), then
 *  `children` (a rule sentence, Made by). Below sm the actions are icons
 *  with their names for screen readers, so the row never wraps. */
export function DetailHeader({
  title,
  titleRef,
  heading,
  description,
  control,
  actions = [],
  menu = [],
  menuLabel = 'More actions',
  meta,
  status,
  children,
}: {
  title: string;
  /** The h1, focusable (`tabIndex -1`) when given: Duplicate lands here. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Replaces the h1 (an editable name); it must render the page's h1. */
  heading?: ReactNode;
  description?: ReactNode;
  /** One always-visible control before the actions. */
  control?: ReactNode;
  /** At most two, a `control` counting as one; more logs a development
   *  error (the test pins it). */
  actions?: readonly HeaderAction[];
  menu?: MenuItem[];
  menuLabel?: string;
  meta?: ReactNode;
  status?: ReactNode;
  children?: ReactNode;
}) {
  const visible = (control ? 1 : 0) + actions.length;
  useEffect(() => {
    if (import.meta.env.DEV && visible > 2) console.error('DetailHeader: at most two visible controls');
  }, [visible]);
  const items = [...menu.filter((item) => !item.danger), ...menu.filter((item) => item.danger)];
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {heading ?? (
            <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className={`break-words ${TYPE.display} ${FOCUS}`}>
              {title}
            </h1>
          )}
          {description ? <p className={`mt-0.5 max-w-[68ch] ${TYPE.bodyMuted}`}>{description}</p> : null}
        </div>
        {visible > 0 || items.length > 0 ? (
          <div data-part="actions" className="flex shrink-0 items-center gap-2">
            {control}
            {actions.map((action) => (
              <ActionButton key={action.key} action={action} />
            ))}
            {items.length > 0 ? (
              <Menu label={menuLabel} trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />} triggerClassName={`${ICON_BUTTON} border border-line`} items={items} />
            ) : null}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div data-part="meta" className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 ${TYPE.bodyMuted}`}>
          {meta}
        </div>
      ) : null}
      <div role="status" aria-live="polite" data-part="status" className="empty:sr-only">
        {status}
      </div>
      {children}
    </header>
  );
}
