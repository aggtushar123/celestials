import { Link } from 'react-router-dom';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { DetailNameRow } from '../../organizations/detail/DetailNameRow';
import { FOCUS } from '../../organizations/portfolio/styles';

const PART_OF_LINK = `inline-flex min-h-11 items-center rounded-sm text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`;

/** The account page's name row (spec 2026-09-29 §2.2): the shared name row,
 *  then "Part of" with one link per linked organisation the viewer may open
 *  (the row lists only those; a hidden one is never named or counted), each
 *  opening that organisation with this account chosen. Edit and ⋯ (Add
 *  contact, Log a call, New task) on the right. */
export function AccountHeader({
  row,
  canEdit,
  editError = null,
  onRetryEdit,
  onEdit,
  onAddContact,
  onLogCall,
  onNewTask,
}: {
  row: AccountPortfolioRow;
  /** The account record has landed, so the edit form can open. */
  canEdit: boolean;
  /** Why the record did not land; shown as Edit's reason while it is off. */
  editError?: string | null;
  onRetryEdit?: () => void;
  onEdit: () => void;
  onAddContact: () => void;
  onLogCall: () => void;
  onNewTask: () => void;
}) {
  const organisations = row.details.profile.organisations;
  return (
    <DetailNameRow
      row={row}
      nameField="account"
      below={
        organisations.length ? (
          <p data-part="part-of" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-ink-muted">
            <span>Part of</span>
            {organisations.map((organisation, index) => (
              <span key={organisation.id} className="inline-flex items-center">
                <Link to={`/organizations/${organisation.id}?account=${row.id}`} className={PART_OF_LINK}>
                  {organisation.name}
                </Link>
                {index < organisations.length - 1 ? <span aria-hidden="true">,</span> : null}
              </span>
            ))}
          </p>
        ) : null
      }
      canEdit={canEdit}
      editError={editError}
      onRetryEdit={onRetryEdit}
      onEdit={onEdit}
      menu={[
        { key: 'contact', label: 'Add contact', onSelect: onAddContact },
        { key: 'call', label: 'Log a call', onSelect: onLogCall },
        { key: 'task', label: 'New task', onSelect: onNewTask },
      ]}
    />
  );
}
