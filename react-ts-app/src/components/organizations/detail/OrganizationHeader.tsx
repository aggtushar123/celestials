import { Plus } from 'lucide-react';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { BUTTON } from '../portfolio/styles';
import { DetailNameRow } from './DetailNameRow';
import type { MenuItem } from '../../ui/Menu';
import { Badge } from '../../ui';

/** The name row (spec §1.2, and 2026-09-27 §1): initials (never a
 *  third-party logo), the name, owner · lifecycle · last touch, the signal,
 *  then Edit, Add account and ⋯. ⋯ offers Archive and Churn while they still
 *  apply; the server applies its own rules to both, as on the List. */
export function OrganizationHeader({
  row,
  canEdit,
  editError = null,
  onRetryEdit,
  onEdit,
  onArchive,
  onChurn,
  onAddAccount,
}: {
  row: PortfolioRow;
  /** The customer record has landed, so the edit form can open. */
  canEdit: boolean;
  /** Why the record did not land; shown as Edit's reason while it is off. */
  editError?: string | null;
  onRetryEdit?: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onChurn: () => void;
  /** Opens the new-account form; it needs only the organization's id. */
  onAddAccount: () => void;
}) {
  const status = row.is_archived ? 'Archived' : row.churned ? 'Churned' : null;
  const actions: MenuItem[] = [
    ...(row.is_archived ? [] : [{ key: 'archive', label: 'Archive', onSelect: onArchive }]),
    ...(row.churned ? [] : [{ key: 'churn', label: 'Churn', onSelect: onChurn, danger: true }]),
  ];
  return (
    <DetailNameRow
      row={row}
      nameField="organization"
      tags={status ? <Badge>{status}</Badge> : null}
      canEdit={canEdit}
      editError={editError}
      onRetryEdit={onRetryEdit}
      onEdit={onEdit}
      actions={
        <button type="button" onClick={onAddAccount} className={`${BUTTON} min-w-11 justify-center sm:min-w-0`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {/* Icon-only below sm, where the row is short of room; the name stays. */}
          <span className="sr-only sm:not-sr-only">Add account</span>
        </button>
      }
      menu={actions}
    />
  );
}
