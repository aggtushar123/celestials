import { Fragment, useId } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { useMembers } from '../../../features/knowledge/useMembers';
import { CsatSpread } from '../../organizations/detail/CustomerFacts';
import { BUTTON, Card, CardBody, CardHeader, FOCUS, LoadingState, TYPE } from '../../ui';
import { AIAttributesPanel } from '../../shared/AIAttributesPanel';
import { OwnerTile, type OwnerSummary } from '../../shared/OwnerTile';
import { AccountPanels } from '../portfolio/AccountPanels';
import { useAccountCsat } from './useAccountCsat';

const LINK = `inline-flex min-h-11 items-center rounded-sm text-ink underline sm:min-h-0 ${FOCUS}`;

/** Company knowledge is per organisation (spec Decisions): one link per
 *  linked organisation the viewer may open, and none named otherwise. */
function KnowledgeLine({ organisations }: { organisations: { id: number; name: string }[] }) {
  if (organisations.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted">
        Company knowledge is kept on organization pages, and there is none for this account that you can open.
      </p>
    );
  }
  const links = organisations.map((organisation, index) => (
    <Fragment key={organisation.id}>
      {index > 0 ? ', ' : null}
      <Link to={`/organizations/${organisation.id}?tab=knowledge`} className={LINK}>
        {organisation.name}
      </Link>
    </Fragment>
  ));
  return organisations.length === 1 ? (
    <p className="text-[13px] text-ink-muted">Knowledge for this account lives on {links}'s page.</p>
  ) : (
    <p className="text-[13px] text-ink-muted">Knowledge for this account lives on its organizations' pages: {links}.</p>
  );
}

/** Details (spec 2026-09-29 §2.6): who owns the account (hand over with a
 *  note), the four panels from the Accounts list with Edit details on the
 *  heading row, how its CSAT answers spread, its AI attributes, and where
 *  its company knowledge lives. One surface, divided, never boxed twice. */
export function AccountDetailsTab({
  row,
  currency,
  isSm,
  owner,
  ownerError,
  mayChangeOwner,
  onSaveOwner,
  onRetryOwner,
  onEdit,
}: {
  row: AccountPortfolioRow;
  currency: CurrencyCode;
  isSm: boolean;
  /** From GET /accounts/<id>/ (with their function); undefined while it loads. */
  owner: OwnerSummary | null | undefined;
  /** Set when GET /accounts/<id>/ (the record the owner comes from) failed;
   *  null while it's still loading or once it has landed. */
  ownerError: string | null;
  mayChangeOwner: boolean;
  onSaveOwner: (userId: number | null, note: string) => Promise<string | null>;
  /** Reads the record again after a failed load. */
  onRetryOwner: () => void;
  /** Absent until the account record has landed. */
  onEdit?: () => void;
}) {
  const headingId = useId();
  const csatId = useId();
  const knowledgeId = useId();
  const members = useMembers();
  const csat = useAccountCsat(row.id);

  return (
    <Card as="section" pad="none" aria-labelledby={headingId}>
      <div data-part="details-heading">
        <CardHeader
          id={headingId}
          title="Account details"
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
      <CardBody>
        {owner === undefined ? (
          ownerError ? (
            <div role="alert" className="flex flex-col items-start gap-2 border-t border-line-subtle pt-3">
              <p className="text-[13px] text-danger-ink">{ownerError}</p>
              <button type="button" onClick={onRetryOwner} className={BUTTON}>
                Try again
              </button>
            </div>
          ) : (
            <LoadingState label="Loading the owner" variant="block" />
          )
        ) : (
          <OwnerTile owner={owner} members={members} mayChange={mayChangeOwner} onSave={onSaveOwner} plain />
        )}
      </CardBody>
      <AccountPanels row={row} currency={currency} stacked={!isSm} />
      <section aria-labelledby={csatId} className="flex flex-col gap-3 border-t border-line-subtle px-4 py-4">
        <h3 id={csatId} className={TYPE.label}>
          CSAT responses
        </h3>
        {csat.error ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-[13px] text-danger-ink">{csat.error}</p>
            <button type="button" onClick={csat.retry} className={BUTTON}>
              Try again
            </button>
          </div>
        ) : !csat.breakdown ? (
          <LoadingState label="Loading CSAT responses" variant="block" />
        ) : (
          <CsatSpread breakdown={csat.breakdown} />
        )}
      </section>
      <CardBody>
        <AIAttributesPanel accountId={row.id} />
      </CardBody>
      <section aria-labelledby={knowledgeId} className="flex flex-col gap-2 border-t border-line-subtle px-4 py-4">
        <h3 id={knowledgeId} className={TYPE.label}>
          Knowledge
        </h3>
        <KnowledgeLine organisations={row.details.profile.organisations} />
      </section>
    </Card>
  );
}
