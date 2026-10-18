import { useEffect, useState } from 'react';
import { OUTSIDE } from '../../features/agents/bundleText';
import type { PickListName, PickValue } from '../../features/agents/bundleTypes';
import { INPUT, TYPE } from '../ui';
import { PickSelect } from './PickSelect';
import type { PickState } from './usePickList';

const PAUSE_MS = 300;
const MOST = 100;

/** People in Jira, searched (D3 frontend Decision 3): a search box, then the
 *  list as a select. The list is read by the caller (round 2 C1: one error
 *  per step); this keeps the typing and its pause. */
export function PickSearch({ id, label, list, state, retry, onQuery, value, onChange, none, error, hint, quiet = false, searchLabel = OUTSIDE.SEARCH_PEOPLE, emptyText = OUTSIDE.NOBODY }: { id: string; label: string; list: PickListName; state: PickState; retry: () => void; onQuery: (query: string) => void; value: PickValue | null; onChange: (value: PickValue | null) => void; none?: string; error?: string; hint?: string; quiet?: boolean; searchLabel?: string; emptyText?: string }) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => onQuery(typed.trim()), PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [typed, onQuery]);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      <input type="search" aria-label={searchLabel} placeholder={searchLabel} maxLength={MOST} className={INPUT} value={typed} onChange={(event) => setTyped(event.target.value)} />
      <PickSelect id={id} label={label} list={list} state={state} retry={retry} value={value} onChange={onChange} none={none} error={error} hint={hint} emptyText={emptyText} labelled={false} quiet={quiet} />
    </div>
  );
}
