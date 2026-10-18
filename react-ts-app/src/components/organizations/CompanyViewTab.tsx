import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import {
  addContribution,
  deleteContribution,
  fetchContributions,
  fetchResponsible,
  setResponsible,
} from '../../features/knowledge/knowledgeSlice';
import type { Contribution } from '../../features/knowledge/knowledgeSlice';
import { FUNCTION_LABELS } from '../../features/auth/authSlice';
import type { User, UserFunction } from '../../features/auth/authSlice';
import { apiFetch } from '../../lib/apiClient';
import { formatDate } from '../../features/customers/formatters';
import { QuestionsPanel } from './QuestionsPanel';
import { AccountBriefPanel } from './AccountBriefPanel';
import { OwnerTile } from '../shared/OwnerTile';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardSection,
  EmptyState,
  FilterChip,
  FilterChipRow,
  INPUT,
  NUM,
  PRIMARY,
  QUIET,
  Select,
  TYPE,
} from '../ui';

/**
 * What the whole company knows about this customer — every function's
 * contributions, newest first, and who answers for the account in each
 * function. Company-wide by design: any member reads and writes here,
 * whatever their book; the author's function is stamped from their
 * profile. The Copilot reads the same rows, so what is written here is
 * what it answers from.
 */
export function CompanyViewTab({
  customerId,
  customerName,
  accountName,
  accountOwnerTile,
  embedded = false,
}: {
  customerId: number;
  customerName: string;
  /** On an account page: the account this view is framed for. Knowledge and
   *  department owners are the organisation's; the account has its own owner. */
  accountName?: string;
  accountOwnerTile?: ReactNode;
  /** Inside a page that already sets the column (the organization page):
   *  the cards span its edges. Off by default, so the account page keeps
   *  its centred column. */
  embedded?: boolean;
}) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const canAssign = useCapability('view_all_accounts');
  const canManage = useCapability('manage_users');
  const rows = useAppSelector((s) => s.knowledge.contributions[customerId]);
  const responsible = useAppSelector((s) => s.knowledge.responsible[customerId]);
  const { error, saveError } = useAppSelector((s) => s.knowledge);
  const [body, setBody] = useState('');
  const [filter, setFilter] = useState<UserFunction | 'all'>('all');
  const [members, setMembers] = useState<User[]>([]);

  useEffect(() => {
    dispatch(fetchContributions(customerId));
    dispatch(fetchResponsible(customerId));
  }, [dispatch, customerId]);

  useEffect(() => {
    apiFetch<User[]>('/auth/members/')
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const result = await dispatch(addContribution({ customerId, body: body.trim() }));
    if (addContribution.fulfilled.match(result)) setBody('');
  }

  const shown = (rows ?? []).filter((c) => filter === 'all' || c.function === filter);
  const counts = (rows ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.function] = (acc[c.function] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={embedded ? 'flex flex-col gap-4 w-full' : 'flex flex-col gap-4 max-w-5xl mx-auto w-full'}>
      {/* The standing brief first: what they use us for, and what nobody
          here can answer about them yet. */}
      <AccountBriefPanel customerId={customerId} customerName={customerName} />
      <Card as="section" pad="none" aria-labelledby={`owners-${customerId}`}>
        <CardHeader
          id={`owners-${customerId}`}
          title={`Who answers for ${accountName ?? customerName}`}
          meta={accountName ? `knowledge of ${customerName}` : undefined}
        />
        <CardBody>
          {accountOwnerTile}
          <div className={accountOwnerTile ? 'mt-3' : ''}>
            <AccountOwnerTile customerId={customerId} members={members} canAssign={canAssign} title={accountName ? 'Organisation owner' : 'Account owner'} plain />
          </div>
          {canAssign ? (
            <div data-owners="" className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {(responsible ?? []).filter((r) => r.function !== 'cs').map((r) => (
                <Select
                  key={r.function}
                  label={`${r.function_display} owner`}
                  labelPosition="above"
                  value={r.user?.id ? String(r.user.id) : ''}
                  onChange={(value) => dispatch(setResponsible({ customerId, function: r.function, user_id: value ? Number(value) : null }))}
                  options={[
                    { value: '', label: 'Nobody yet' },
                    // Only people in the function: the engineering owner is an engineer.
                    ...members.filter((m) => m.function === r.function || m.id === r.user?.id).map((m) => ({ value: String(m.id), label: m.name })),
                  ]}
                />
              ))}
            </div>
          ) : (
            <dl data-owners="" className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {(responsible ?? []).filter((r) => r.function !== 'cs').map((r) => (
                <div key={r.function}>
                  <dt className={TYPE.meta}>{r.function_display}</dt>
                  <dd className={`${TYPE.body} font-semibold`}>{r.user?.name ?? 'Nobody yet'}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>

      <QuestionsPanel customerId={customerId} customerName={customerName} members={members} />

      {(error || saveError) && (
        <p className="text-[13px] font-semibold text-danger-ink" role="alert">
          {error ?? saveError}
        </p>
      )}

      <Card as="section" pad="none" aria-labelledby={`known-${customerId}`}>
        <CardHeader id={`known-${customerId}`} title="What we know" />
        <CardBody>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label htmlFor={`contribution-${customerId}`} className={TYPE.label}>
              What do you know about {customerName}?
              {me && (
                <span className={`${TYPE.meta} font-semibold`}>
                  {' '}· filed under {FUNCTION_LABELS[me.function]} as {me.name}
                </span>
              )}
            </label>
            <textarea
              id={`contribution-${customerId}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="A fact, a risk or a change a colleague or the Copilot should know"
              className={`${INPUT} py-2`}
            />
            <div className="flex items-center justify-between gap-2">
              <span className={TYPE.meta}>Visible to everyone in the company, and read by the Copilot.</span>
              <button type="submit" disabled={!body.trim()} className={PRIMARY}>
                Add
              </button>
            </div>
          </form>
        </CardBody>

        <CardSection>
          <FilterChipRow label="Filter by function">
            <FilterChip label="All" count={rows?.length ?? 0} pressed={filter === 'all'} onToggle={() => setFilter('all')} />
            {(Object.keys(FUNCTION_LABELS) as UserFunction[]).filter((k) => counts[k]).map((k) => (
              <FilterChip key={k} label={FUNCTION_LABELS[k]} count={counts[k]} pressed={filter === k} onToggle={() => setFilter(k)} />
            ))}
          </FilterChipRow>
        </CardSection>

        {rows && rows.length === 0 && (
          <div className="border-t border-line-subtle">
            <EmptyState
              size="inline"
              title="Nothing here you can see yet. What your team, your reports and leadership write about this customer appears here."
            />
          </div>
        )}
        <ul className="divide-y divide-line-subtle border-t border-line-subtle">
          {shown.map((c) => (
            <ContributionRow key={c.id} row={c} canRemove={me?.id === c.author.id || canManage} onRemove={() => dispatch(deleteContribution({ customerId, id: c.id }))} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** The organisation's one accountable person — the shared OwnerTile over the knowledge slice. */
function AccountOwnerTile({
  customerId,
  members,
  canAssign,
  title,
  plain,
}: {
  customerId: number;
  members: User[];
  canAssign: boolean;
  title?: string;
  plain?: boolean;
}) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const owner = useAppSelector((s) => s.knowledge.accountOwner[customerId] ?? null);
  const mayChange = canAssign || (!!me && (!owner || owner.id === me.id));
  return (
    <OwnerTile
      title={title}
      owner={owner}
      members={members}
      mayChange={mayChange}
      plain={plain}
      onSave={async (userId, note) => {
        const result = await dispatch(setResponsible({ customerId, function: 'cs', user_id: userId, note }));
        return setResponsible.fulfilled.match(result) ? null : (result.payload ?? 'Could not change who is responsible.');
      }}
    />
  );
}

function ContributionRow({ row, canRemove, onRemove }: { row: Contribution; canRemove: boolean; onRemove: () => void }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3" aria-label={`${row.function_display} by ${row.author.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{row.function_display}</Badge>
          <span className={`${TYPE.body} font-semibold`}>{row.author.name}</span>
          <span className={`${TYPE.meta} ${NUM}`}>{formatDate(row.created_at.slice(0, 10))}</span>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className={`${QUIET} hover:text-danger-ink`}>
            Remove
          </button>
        )}
      </div>
      <p className={`${TYPE.body} whitespace-pre-wrap`}>{row.body}</p>
    </li>
  );
}
