import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchPipelineParents, type PipelineParentChoice, type PipelineParentMatches } from '../../../features/pipelines/pipelineApi';
import { useSearchText } from '../../organizations/portfolio/useSearchText';
import { FOCUS, QUIET, TYPE } from '../../ui';

const OPTION = `flex w-full min-h-11 sm:min-h-9 flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

type Read = { search: string; matches: PipelineParentMatches | null; failed: boolean };

/** Add's "where it belongs" (spec §1 Add): any organisation or account the
 *  viewer may open, found by searching the server as they type (300ms after
 *  typing stops). Once picked it shows the choice and a Change button. */
export function ParentPicker({
  value,
  onChange,
  label = 'Belongs to',
  required = true,
}: {
  value: PipelineParentChoice | null;
  onChange: (choice: PipelineParentChoice | null) => void;
  /** The field's label; mail filing (two-way Gmail D3) says "File on". */
  label?: string;
  /** Mail filing is optional: no asterisk, no aria-required. */
  required?: boolean;
}) {
  const id = useId();
  // Change hands focus back to the search box it brings back.
  const refocus = useRef(false);
  const [search, setSearch] = useState('');
  const [text, setText] = useSearchText(search, setSearch);
  const [read, setRead] = useState<Read | null>(null);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    searchPipelineParents(search).then(
      (matches) => {
        if (!cancelled) setRead({ search, matches, failed: false });
      },
      () => {
        if (!cancelled) setRead({ search, matches: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [search, value]);

  if (value) {
    return (
      <div>
        <p className={`mb-1 ${TYPE.label}`}>{label}</p>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-subtle px-3 py-1.5">
          <div className="min-w-0">
            <p className={`truncate ${TYPE.label}`}>{value.name}</p>
            <p className={`truncate ${TYPE.meta}`}>
              {value.type === 'organisation' ? 'Organization' : value.partOf ? `Account · Part of ${value.partOf}` : 'Account'}
            </p>
          </div>
          <button
            type="button"
            className={QUIET}
            onClick={() => {
              refocus.current = true;
              onChange(null);
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  // The last search that answered stays up while the next one is read.
  const matches = read?.matches ?? null;
  const none = matches !== null && matches.organisations.length === 0 && matches.accounts.length === 0;
  // Read out when a search answers; the lists themselves are silent.
  const counted = matches && !none ? `${plural(matches.organisations.length, 'organization')}, ${plural(matches.accounts.length, 'account')}` : '';
  return (
    <div>
      <label htmlFor={id} className={`mb-1 block ${TYPE.label}`}>
        {label}
        {required ? (
          <span className="text-danger-ink" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          ref={(node) => {
            if (node && refocus.current) {
              refocus.current = false;
              node.focus();
            }
          }}
          id={id}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search organizations and accounts"
          autoComplete="off"
          aria-required={required ? 'true' : undefined}
          className={`w-full min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong ${FOCUS}`}
        />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {counted}
      </p>
      <div className="mt-1 max-h-60 overflow-y-auto" aria-busy={!read || read.search !== search}>
        {read?.failed ? (
          <p role="alert" className="px-3 py-2 text-[13px] leading-5 text-danger-ink">
            Could not search organizations and accounts. Try again.
          </p>
        ) : !matches ? (
          <p role="status" className={`px-3 py-2 ${TYPE.bodyMuted}`}>
            Searching…
          </p>
        ) : none ? (
          <p role="status" className={`px-3 py-2 ${TYPE.bodyMuted}`}>
            No organization or account matches “{read?.search}”.
          </p>
        ) : (
          <>
            <Matches label="Organizations" choices={matches.organisations} onPick={onChange} />
            <Matches label="Accounts" choices={matches.accounts} onPick={onChange} />
            {matches.more ? <p className={`px-3 py-1.5 ${TYPE.meta}`}>Showing the first matches. Keep typing to narrow them.</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Matches({ label, choices, onPick }: { label: string; choices: PipelineParentChoice[]; onPick: (choice: PipelineParentChoice) => void }) {
  const headingId = useId();
  if (choices.length === 0) return null;
  return (
    <div role="group" aria-labelledby={headingId}>
      <p id={headingId} className={`px-3 pt-2 pb-1 ${TYPE.meta} font-semibold`}>
        {label}
      </p>
      <ul>
        {choices.map((choice) => (
          <li key={`${choice.type}-${choice.id}`}>
            <button type="button" className={OPTION} onClick={() => onPick(choice)}>
              <span className={TYPE.body}>{choice.name}</span>
              {choice.partOf ? <span className={TYPE.meta}>Part of {choice.partOf}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
