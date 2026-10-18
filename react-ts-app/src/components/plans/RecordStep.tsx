import { useEffect, useId, useState } from 'react';
import { searchPlanRecords } from '../../features/plans/planApi';
import type { RecordKind, RecordRef } from '../../features/plans/planTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSearchText } from '../organizations/portfolio/useSearchText';
import { TYPE } from '../ui';
import { RecordIcon } from './parts';

const GROUPS: readonly { kind: RecordKind; label: string }[] = [
  { kind: 'organization', label: 'Organisations' },
  { kind: 'account', label: 'Accounts' },
];
type Answer = { search: string; rows: RecordRef[] } | { search: string; error: string };

/** 1. Record (spec §2.2): a search over organisations and accounts the
 *  person can open, 300 ms after typing stops; the latest answer wins.
 *  Locked when the modal opened over a record's page. */
export function RecordStep({ record, locked, loading, error, onPick, onClear, heading = '1. Record' }: {
  record: RecordRef | null;
  locked: boolean;
  loading: boolean;
  error?: string;
  onPick: (record: RecordRef) => void;
  onClear: () => void;
  /** The section's heading; New plan numbers its steps, Work's New task does not. */
  heading?: string;
}) {
  const headingId = useId();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [text, setText] = useSearchText(search, setSearch);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!search) return;
    let alive = true;
    searchPlanRecords(search).then(
      (rows) => {
        if (alive) setAnswer({ search, rows });
      },
      (err: unknown) => {
        if (alive) setAnswer({ search, error: errorMessage(err, 'Could not search.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [search]);
  const current = text.trim() && answer && answer.search === search ? answer : null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        {heading}
      </h3>
      {record ? (
        <div data-part="record" className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
          <RecordIcon kind={record.kind} />
          <span className="min-w-0 break-words font-semibold">{record.name}</span>
          <span className="text-[11px] text-ink-muted">{record.kind === 'organization' ? 'Organisation' : 'Account'}</span>
          {!locked ? (
            <button type="button" onClick={onClear} className={QUIET}>
              Change
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <p className="text-[13px] text-ink-muted">Loading the record…</p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={searchId} className={TYPE.label}>
            Organisation or account
          </label>
          <input
            id={searchId}
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search by name"
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${searchId}-error` : undefined}
            className={`${FILTER_SELECT} w-full placeholder:text-ink-muted sm:max-w-80 ${error ? 'border-danger' : ''}`}
          />
          {current && 'error' in current ? (
            <p role="alert" className="text-[11px] text-danger">
              {current.error}
            </p>
          ) : null}
          {current && 'rows' in current && current.rows.length === 0 ? <p className="text-[13px] text-ink-muted">No matches</p> : null}
          {current && 'rows' in current
            ? GROUPS.map((group) => {
                const rows = current.rows.filter((row) => row.kind === group.kind);
                if (rows.length === 0) return null;
                return (
                  <div key={group.kind} className="flex flex-col gap-1">
                    <p className={TYPE.label}>{group.label}</p>
                    <ul aria-label={group.label} className="flex flex-col">
                      {rows.map((row) => (
                        <li key={`${row.kind}-${row.id}`}>
                          <button
                            type="button"
                            onClick={() => {
                              onPick(row);
                              setText('');
                            }}
                            className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-[13px] text-ink hover:bg-subtle active:bg-line-subtle sm:min-h-9 ${FOCUS}`}
                          >
                            <RecordIcon kind={row.kind} />
                            <span title={row.name} className="min-w-0 truncate">{row.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            : null}
        </div>
      )}
      {error ? (
        <p id={`${searchId}-error`} role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
