import { useCallback, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector, useOrgCurrency } from '../../../hooks';
import {
  deleteOpportunity,
  deleteRisk,
  fetchOpportunitiesForAccount,
  fetchOpportunitiesForCustomer,
  fetchRisksForAccount,
  fetchRisksForCustomer,
  updateOpportunity,
  updateRisk,
  type Account,
  type Opportunity,
  type Risk,
} from '../../../features/customers/customersSlice';
import { awaitingAccount, byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { resolveScope, scopeSlot, type ScopeProps } from '../../../features/organizations/detailScope';
import { opportunitiesSummary, risksSummary } from '../../../features/organizations/listSummaries';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import { KanbanBoard, PipelineCardContent } from '../../pipelines/KanbanBoard';
import { OPPORTUNITY_STAGE_COLUMNS, RISK_STAGE_COLUMNS } from '../../pipelines/kanbanConfig';
import { OpportunityFormModal } from '../../pipelines/OpportunityFormModal';
import { RiskFormModal } from '../../pipelines/RiskFormModal';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  BUTTON,
  CardHeader,
  ErrorState as UiErrorState,
  ListCard,
  ListHeaderRow,
  LoadingState,
  SegmentedControl,
} from '../../ui';
import { DEAL_COLUMNS, DEAL_HEADER_SHOW } from './dealColumns';
import { DealItem } from './DealItem';
import { AccountNames } from './accountNames';
import { AddPaused, ListSearch, NoMatch, ScopedEmpty, SummaryLine } from './ListParts';

type Kind = 'opportunities' | 'risks';

/** Closed Lost starts collapsed, as on the Pipelines Board (pipelines spec §1). */
const OPPORTUNITY_COLUMNS = OPPORTUNITY_STAGE_COLUMNS.map((column) => ({
  ...column,
  collapsible: OPPORTUNITIES_KIND.collapsedStages.includes(column.stage),
}));

const titled = (title: string, q: string) => title.toLowerCase().includes(q.trim().toLowerCase());

type DealsTabProps = ScopeProps & {
  /** The chip: '' All, 'none' the organization itself, or an account id. Always '' on an account's page. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  onShowAll: () => void;
};

/** Deals & risks (spec 2026-09-27 §3; account spec §2.8): an Opportunities /
 *  Risks switch over list items — the organization's, narrowed by the
 *  account chip, or one account's — each with a one-line summary. The board
 *  stays an option from sm. Selecting an item opens its existing edit form;
 *  Add saves on the chosen account, or on the page's account. */
export function DealsTab(props: DealsTabProps) {
  const { account, accounts, isSm, onShowAll } = props;
  const scope = resolveScope(props);
  const kindOfPage = scope.kind;
  const scopeId = scope.id;
  const dispatch = useAppDispatch();
  const currency = useOrgCurrency();
  const {
    pipelineOpportunities: opportunities,
    pipelineOpportunitiesLoading,
    pipelineOpportunitiesError,
    pipelineRisks: risks,
    pipelineRisksLoading,
    pipelineRisksError,
    pipelineOpportunitiesFor,
    pipelineRisksFor,
  } = useAppSelector((state) => state.customers);
  const [kind, setKind] = useState<Kind>('opportunities');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [q, setQ] = useState('');
  // Each shared slot holds this page's records (not another's).
  const slot = scopeSlot({ kind: kindOfPage, id: scopeId });
  const loaded = {
    opportunities: pipelineOpportunitiesFor === slot,
    risks: pipelineRisksFor === slot,
  };
  const [attempt, setAttempt] = useState(0);
  const [addingOpportunity, setAddingOpportunity] = useState<Opportunity['stage'] | null>(null);
  const [addingRisk, setAddingRisk] = useState<Risk['stage'] | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [deletingOpportunity, setDeletingOpportunity] = useState<Opportunity | null>(null);
  const [deletingRisk, setDeletingRisk] = useState<Risk | null>(null);

  const readOpportunities = useCallback(() => {
    if (kindOfPage === 'account') void dispatch(fetchOpportunitiesForAccount({ accountId: scopeId }));
    else void dispatch(fetchOpportunitiesForCustomer(scopeId));
  }, [dispatch, kindOfPage, scopeId]);
  const readRisks = useCallback(() => {
    if (kindOfPage === 'account') void dispatch(fetchRisksForAccount({ accountId: scopeId }));
    else void dispatch(fetchRisksForCustomer(scopeId));
  }, [dispatch, kindOfPage, scopeId]);

  // Read before paint, as People does: the chips never count another page's
  // records left in the shared slots.
  useLayoutEffect(() => {
    readOpportunities();
    readRisks();
  }, [readOpportunities, readRisks, attempt]);

  const scopedOpportunities = useMemo(() => byAccount(opportunities, account), [opportunities, account]);
  const scopedRisks = useMemo(() => byAccount(risks, account), [risks, account]);
  const shownOpportunities = useMemo(() => scopedOpportunities.filter((row) => titled(row.title, q)), [scopedOpportunities, q]);
  const shownRisks = useMemo(() => scopedRisks.filter((row) => titled(row.title, q)), [scopedRisks, q]);
  const target = chosenAccount(accounts, account);
  const paused = awaitingAccount(accounts, account);
  const pausedId = useId();
  // New records go on the page's account, or the chosen chip's, or the organization.
  const addOn = {
    customerId: kindOfPage === 'organization' ? scopeId : undefined,
    accountId: kindOfPage === 'account' ? scopeId : target?.id,
  };

  const isOpps = kind === 'opportunities';
  const error = isOpps ? pipelineOpportunitiesError : pipelineRisksError;
  const busy = isOpps ? pipelineOpportunitiesLoading : pipelineRisksLoading;
  const failed = error !== null && !busy;
  const scopedCount = isOpps ? scopedOpportunities.length : scopedRisks.length;
  const shownCount = isOpps ? shownOpportunities.length : shownRisks.length;
  const board = isSm && view === 'board';

  let state: ReactNode;
  let boardView: ReactNode = null;
  if (failed) state = <UiErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!loaded[kind]) state = <LoadingState label={isOpps ? 'Loading opportunities' : 'Loading risks'} />;
  else if (board) {
    boardView = isOpps ? (
      <KanbanBoard
        columns={OPPORTUNITY_COLUMNS}
        entities={shownOpportunities}
        renderCard={(entity) => PipelineCardContent(entity, currency)}
        onCardClick={setEditingOpportunity}
        onAddClick={paused ? undefined : (stage) => setAddingOpportunity(stage)}
        onMove={(id, stage) => dispatch(updateOpportunity({ id, stage }))}
        minHeight="400px"
      />
    ) : (
      <KanbanBoard
        columns={RISK_STAGE_COLUMNS}
        entities={shownRisks}
        renderCard={(entity) => PipelineCardContent(entity, currency)}
        onCardClick={setEditingRisk}
        onAddClick={paused ? undefined : (stage) => setAddingRisk(stage)}
        onMove={(id, stage) => dispatch(updateRisk({ id, stage }))}
        minHeight="400px"
      />
    );
  } else if (scopedCount === 0) {
    state = (
      <ScopedEmpty
        what={kind}
        scope={scopeLabel(accounts, account)}
        detail={isOpps ? 'Opportunities added here show on the Pipelines board too.' : 'Risks added here show on the Pipelines board too.'}
        onShowAll={onShowAll}
      />
    );
  } else if (shownCount === 0) state = <NoMatch q={q} onClear={() => setQ('')} />;

  const parts =
    loaded[kind] && !failed && scopedCount > 0 ? (isOpps ? opportunitiesSummary(scopedOpportunities, currency) : risksSummary(scopedRisks, currency)) : null;
  const heading = isOpps ? 'Opportunities' : 'Risks';

  return (
    <AccountNames.Provider value={accounts}>
      <div aria-busy={pipelineOpportunitiesLoading || pipelineRisksLoading} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Deals or risks"
            options={[
              { value: 'opportunities', label: 'Opportunities' },
              { value: 'risks', label: 'Risks' },
            ]}
            value={kind}
            onChange={setKind}
          />
          {isSm ? (
            <div className="ml-auto">
              <SegmentedControl
                label="View"
                options={[
                  { value: 'list', label: 'List' },
                  { value: 'board', label: 'Board' },
                ]}
                value={view}
                onChange={setView}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ListSearch label={isOpps ? 'Search opportunities' : 'Search risks'} value={q} onChange={setQ} isSm={isSm} />
          <button
            type="button"
            onClick={() => (isOpps ? setAddingOpportunity('discovery') : setAddingRisk('open'))}
            disabled={paused}
            aria-describedby={paused ? pausedId : undefined}
            className={`${BUTTON} ml-auto`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {`Add ${isOpps ? 'opportunity' : 'risk'}${target ? ` to ${target.name}` : ''}`}
          </button>
        </div>
        {paused ? <AddPaused id={pausedId} /> : null}
        {boardView ? (
          <>
            {parts ? <SummaryLine parts={parts} /> : null}
            {boardView}
          </>
        ) : (
          <ListCard
            className="@container"
            label={heading}
            header={
              <>
                <CardHeader title={heading} meta={parts ? <SummaryLine as="span" parts={parts} /> : undefined} />
                {state ? null : <ListHeaderRow columns={DEAL_COLUMNS} show={DEAL_HEADER_SHOW} labels={[isOpps ? 'Opportunity' : 'Risk', 'MRR', '']} align={['left', 'right']} />}
              </>
            }
            state={state}
          >
            {isOpps
              ? shownOpportunities.map((row) => <DealItem key={row.id} deal={row} onOpen={() => setEditingOpportunity(row)} />)
              : shownRisks.map((row) => <DealItem key={row.id} deal={row} onOpen={() => setEditingRisk(row)} />)}
          </ListCard>
        )}

        {addingOpportunity ? (
          <OpportunityFormModal
            customerId={addOn.customerId}
            accountId={addOn.accountId}
            defaultStage={addingOpportunity}
            onClose={() => setAddingOpportunity(null)}
            onSaved={readOpportunities}
          />
        ) : null}
        {editingOpportunity ? (
          <OpportunityFormModal
            opportunity={editingOpportunity}
            onClose={() => setEditingOpportunity(null)}
            onDeleteRequest={() => {
              setDeletingOpportunity(editingOpportunity);
              setEditingOpportunity(null);
            }}
          />
        ) : null}
        {deletingOpportunity ? (
          <ConfirmDialog
            title={`Delete ${deletingOpportunity.title}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await dispatch(deleteOpportunity(deletingOpportunity.id)).unwrap();
            }}
            onClose={() => setDeletingOpportunity(null)}
          />
        ) : null}
        {addingRisk ? (
          <RiskFormModal
            customerId={addOn.customerId}
            accountId={addOn.accountId}
            defaultStage={addingRisk}
            onClose={() => setAddingRisk(null)}
            onSaved={readRisks}
          />
        ) : null}
        {editingRisk ? (
          <RiskFormModal
            risk={editingRisk}
            onClose={() => setEditingRisk(null)}
            onDeleteRequest={() => {
              setDeletingRisk(editingRisk);
              setEditingRisk(null);
            }}
          />
        ) : null}
        {deletingRisk ? (
          <ConfirmDialog
            title={`Delete ${deletingRisk.title}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await dispatch(deleteRisk(deletingRisk.id)).unwrap();
            }}
            onClose={() => setDeletingRisk(null)}
          />
        ) : null}
      </div>
    </AccountNames.Provider>
  );
}
