import { useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchCalls } from '../../../features/calls/callsSlice';
import type { Account } from '../../../features/customers/customersSlice';
import { awaitingAccount, byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { resolveScope, scopeSlot, type ScopeProps } from '../../../features/organizations/detailScope';
import { callsSummary } from '../../../features/organizations/listSummaries';
import { dayLabel, groupByDay, localDay } from '../../../features/organizations/storyDays';
import { BUTTON, CardHeader, ErrorState as UiErrorState, ListCard, LoadingState, TYPE } from '../../ui';
import { AddFlow, type AddFlowParent } from './AddFlow';
import { CallItem } from './CallItem';
import { AccountNames } from './accountNames';
import { AddPaused, ScopedEmpty, SummaryLine } from './ListParts';

type CallsSectionProps = ScopeProps & {
  account: string;
  accounts: Account[];
  isSm: boolean;
  /** Whether the Files tab is showing: a hidden tab closes its sheet. */
  active: boolean;
  /** Bumped when the Story's + Add logs a call, so the list reads again. */
  version: number;
  /** A call was logged here; the page reads the story again. */
  onLogged: () => void;
  onShowAll: () => void;
};

/** Calls (spec 2026-09-27 §4; account spec §2.9): the organization's calls
 *  and every visible account's, narrowed by the account chip, or one
 *  account's own, as day-grouped plain rows like the Story's. No timeline
 *  rail and no scroll area of its own: the page scrolls. "Log a call" is the
 *  Story's + Add sheet, on the chosen account or the page's account. */
export function CallsSection(props: CallsSectionProps) {
  const { account, accounts, isSm, active, version, onLogged, onShowAll } = props;
  const scope = resolveScope(props);
  const kind = scope.kind;
  const scopeId = scope.id;
  const pageAccountName = scope.kind === 'account' ? scope.name : undefined;
  const dispatch = useAppDispatch();
  const { items, isLoading, error, scope: slot } = useAppSelector((state) => state.calls);
  // The shared slot holds this page's calls (not another's).
  const loaded = slot === scopeSlot({ kind, id: scopeId });
  const [attempt, setAttempt] = useState(0);
  const [logging, setLogging] = useState(false);
  if (!active && logging) setLogging(false);
  const headingId = useId();
  const pausedId = useId();

  // Before paint, as People does.
  useLayoutEffect(() => {
    void dispatch(
      fetchCalls(kind === 'account' ? { entityType: 'account', customerId: null, accountId: scopeId } : { entityType: 'organization', customerId: scopeId }),
    );
  }, [dispatch, kind, scopeId, version, attempt]);

  const target = chosenAccount(accounts, account);
  const paused = awaitingAccount(accounts, account);
  // Same shape AddFlow itself now requires (never neither id): this
  // account's own page, or the organization with whichever account (if any)
  // is chosen.
  const addFlowParent: AddFlowParent = kind === 'account' ? { accountId: scopeId } : target ? { customerId: scopeId, accountId: target.id } : { customerId: scopeId };
  const shown = useMemo(() => byAccount(items, account), [items, account]);
  const days = useMemo(() => groupByDay(shown.map((call) => ({ ...call, all_day: false }))), [shown]);
  const today = localDay(new Date());
  const failed = error !== null && !isLoading;

  let body: ReactNode;
  if (failed) body = <ListCard label="Calls" state={<UiErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />} />;
  else if (!loaded) body = <ListCard label="Calls" state={<LoadingState label="Loading calls" />} />;
  else if (shown.length === 0) {
    body = (
      <ListCard
        label="Calls"
        state={
          <ScopedEmpty
            what="calls"
            scope={scopeLabel(accounts, account)}
            detail="Calls logged here or from a recorder arrive with their summaries."
            onShowAll={onShowAll}
          />
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <ListCard key={day.key} label={dayLabel(day.key, today)} header={<CardHeader title={dayLabel(day.key, today)} level={3} />}>
            {day.items.map((call) => (
              <CallItem key={call.id} call={call} />
            ))}
          </ListCard>
        ))}
      </div>
    );
  }

  return (
    <AccountNames.Provider value={accounts}>
      <section aria-labelledby={headingId} aria-busy={isLoading} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 id={headingId} className={TYPE.title}>
              Calls
            </h2>
            {loaded && !failed && shown.length > 0 ? <SummaryLine parts={callsSummary(shown)} /> : null}
          </div>
          <button
            type="button"
            onClick={() => setLogging(true)}
            disabled={paused}
            aria-describedby={paused ? pausedId : undefined}
            className={BUTTON}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Log a call
          </button>
        </div>
        {paused ? <AddPaused id={pausedId} /> : null}
        {body}
        {active && logging ? (
          <AddFlow
            what="call"
            {...addFlowParent}
            // A truthy check, not `??`: an account's own page names it '' until
            // its row lands, and `''` is not "no name" the way `undefined` is.
            accountName={pageAccountName || target?.name}
            isSm={isSm}
            onClose={() => setLogging(false)}
            onAdded={() => {
              setLogging(false);
              onLogged();
            }}
          />
        ) : null}
      </section>
    </AccountNames.Provider>
  );
}
