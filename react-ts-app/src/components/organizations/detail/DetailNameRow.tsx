import { useId, type ReactNode } from 'react';
import { Ellipsis, Pencil } from 'lucide-react';
import type { PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { SignalTag, touchText } from '../portfolio/rowParts';
import { BUTTON, QUIET } from '../portfolio/styles';
import { Menu, type MenuItem } from '../../ui/Menu';
import { ICON_BUTTON, Initials, TYPE } from '../../ui';

/** The name row on either detail page (organisation spec §1.2; account spec
 *  2026-09-29 §2.2): initials (never a third-party logo), the name, owner ·
 *  lifecycle · last touch, the signal, then Edit, the page's own buttons and
 *  ⋯ on the right. Edit stays off until the record lands, and says why when
 *  it failed. */
export function DetailNameRow({
  row,
  nameField,
  tags,
  below,
  canEdit,
  editError = null,
  onRetryEdit,
  onEdit,
  actions,
  menu,
}: {
  row: PortfolioRowBase;
  /** The heading's `data-field`: "organization", "account". */
  nameField: string;
  /** Beside the name, before the signal (Archived, Churned). */
  tags?: ReactNode;
  /** Under owner · lifecycle · last touch ("Part of"). */
  below?: ReactNode;
  /** The record has landed, so the edit form can open. */
  canEdit: boolean;
  /** Why the record did not land; shown as Edit's reason while it is off. */
  editError?: string | null;
  onRetryEdit?: () => void;
  onEdit: () => void;
  /** Buttons between Edit and ⋯ (Add account). */
  actions?: ReactNode;
  /** What ⋯ holds; no ⋯ when there is nothing. */
  menu: MenuItem[];
}) {
  const reasonId = useId();
  const blocked = !canEdit && editError ? editError : null;
  return (
    <div className="flex items-start gap-3">
      <Initials text={row.initials} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h1 data-field={nameField} title={row.name} className={`min-w-0 truncate ${TYPE.display}`}>
            {row.name}
          </h1>
          {tags}
          <SignalTag signal={row.signal} />
        </div>
        <p className={`truncate ${TYPE.bodyMuted}`}>
          <span data-field="owner">{row.owner?.name ?? 'Unassigned'}</span> ·{' '}
          <span data-field="lifecycleStage">{row.lifecycle.label}</span> · {touchText(row.last_touch_days)}
        </p>
        {below}
        {blocked ? (
          <p role="alert" className={`mt-1 flex flex-wrap items-center gap-x-2 text-[11px] leading-4 text-danger-ink`}>
            <span id={reasonId}>Edit is unavailable: {blocked}</span>
            {onRetryEdit ? (
              <button type="button" onClick={onRetryEdit} className={QUIET}>
                Try again
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={!canEdit}
          aria-describedby={blocked ? reasonId : undefined}
          className={`${BUTTON} min-w-11 justify-center sm:min-w-0`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {/* Icon-only below sm: the name gets the room. */}
          <span className="sr-only sm:not-sr-only">Edit</span>
        </button>
        {actions}
        {menu.length ? (
          <Menu
            label={`More actions for ${row.name}`}
            trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
            triggerClassName={`${ICON_BUTTON} border border-line`}
            items={menu}
          />
        ) : null}
      </div>
    </div>
  );
}
