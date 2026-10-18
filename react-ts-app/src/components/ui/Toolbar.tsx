import type { ReactNode, Ref } from 'react';
import { ActionCluster } from './ActionCluster';
import type { UiAction } from './OverflowMenu';
import { FOCUS } from './styles';

/** The one list toolbar (UI foundations spec §5.6): a lead control (a kind
 *  switch), the search with the result count beside it, the filters, then
 *  the actions with the primary last. Below sm the search and count take
 *  row 1 (`max-sm:-order-1`); the lead, filters and actions share row 2.
 *  The DOM keeps the desktop order, lead first, so the focus order matches
 *  what a desktop user sees (WCAG 2.4.3). `actions.extra` (a control that
 *  belongs with the actions, such as Pin fields) sits in the actions' own
 *  right-aligned group, so they always wrap together. The count is a
 *  polite live region that stays mounted (empty until there is a count).
 *  Without a search (Campaigns, Logged scores) the count sits before the
 *  filters, on the same line while there is room and wrapping with them. */
export function Toolbar({
  lead,
  search,
  filters,
  actions = {},
  count,
  countRef,
}: {
  lead?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  actions?: { primary?: ReactNode; secondary?: UiAction[]; extra?: ReactNode };
  /** "14 opportunities": announced politely as it changes. */
  count?: ReactNode;
  /** Where a caller sends focus (a row it removed): the count takes tabIndex -1. */
  countRef?: Ref<HTMLParagraphElement>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lead ? (
        <div data-part="toolbar-lead" className="flex shrink-0 items-center">
          {lead}
        </div>
      ) : null}
      <div
        data-part="toolbar-search"
        className={search ? 'flex min-w-0 basis-full items-center gap-3 max-sm:-order-1 sm:flex-1 sm:basis-auto' : 'flex min-w-fit flex-1 items-center gap-3'}
      >
        {search}
        <p
          ref={countRef}
          tabIndex={countRef ? -1 : undefined}
          role="status"
          aria-live="polite"
          className={`shrink-0 text-[13px] text-ink-muted tabular-nums${count ? ' sm:pr-3' : ''}${countRef ? ` ${FOCUS}` : ''}`}
        >
          {count}
        </p>
      </div>
      {filters}
      {actions.extra ? (
        <div className="ml-auto flex items-center gap-2">
          {actions.extra}
          <ActionCluster primary={actions.primary} secondary={actions.secondary} />
        </div>
      ) : (
        <ActionCluster primary={actions.primary} secondary={actions.secondary} />
      )}
    </div>
  );
}
