import { useId } from 'react';
import { Pencil } from 'lucide-react';
import type { Customer } from '../../../features/customers/customersSlice';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { AIAttributesPanel } from '../../shared/AIAttributesPanel';
import { AccountDetails } from '../portfolio/AccountDetails';
import { BUTTON, Card, CardBody, CardHeader } from '../../ui';
import { AccountsSection, type AccountsSectionProps } from './AccountsSection';
import { AccountTeamCard } from './AccountTeamCard';
import { CustomerFacts } from './CustomerFacts';

/** Details (spec §1.7): the connected accounts (the owner's decision,
 *  2026-09-26), then the List's six panels with every field and Edit
 *  details, stacked on phones, then contact and CSAT from the customer
 *  record (spec §2), then the AI attributes that used to sit in the pinned
 *  panel, then the account team (Slack escalations D2). Edit details sits on
 *  the section's heading row, as Add account does on Accounts, not alone
 *  under the panels. */
export function DetailsTab({
  row,
  customerId,
  isSm,
  accounts,
  customer,
  customerError,
  onRetryCustomer,
  onEdit,
}: {
  row: PortfolioRow;
  customerId: number;
  isSm: boolean;
  accounts: AccountsSectionProps;
  /** GET /customers/{id}/; null while it loads or when it failed. */
  customer: Customer | null;
  customerError: string | null;
  onRetryCustomer: () => void;
  /** Absent until the customer record has landed. */
  onEdit?: () => void;
}) {
  const headingId = useId();
  return (
    <div className="flex flex-col gap-3">
      <AccountsSection {...accounts} currency={row.details.commercial.currency} />
      <Card as="section" pad="none" aria-labelledby={headingId}>
        <div data-part="details-heading">
          <CardHeader
            id={headingId}
            title="Organization details"
            action={
              onEdit ? (
                <button type="button" onClick={() => onEdit()} className={BUTTON}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit details
                </button>
              ) : undefined
            }
          />
        </div>
        <AccountDetails row={row} stacked={!isSm} />
        <CustomerFacts customer={customer} error={customerError} stacked={!isSm} onRetry={onRetryCustomer} />
        <CardBody>
          <AIAttributesPanel customerId={customerId} />
        </CardBody>
      </Card>
      <AccountTeamCard customerId={customerId} customerName={row.name} />
    </div>
  );
}
