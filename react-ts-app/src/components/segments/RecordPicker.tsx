import { useEffect, useState } from 'react';
import type { DraftValue } from '../../features/segments/ruleDraft';
import { HIDDEN_NAME } from '../../features/segments/ruleSentence';
import { searchRecords, type PickerRecord } from '../../features/segments/segmentApi';
import type { PersonRef, RuleLabels } from '../../features/segments/segmentTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSearchText } from '../organizations/portfolio/useSearchText';
import { FOCUS, INPUT, INVALID, OVERLAY } from '../ui';
import { Chip } from './Chip';
import type { ValueOptions } from './ValueInput';

const GROUP = { customer: 'organisations', account: 'accounts' } as const;

type Answer = { search: string; rows: PersonRef[] } | { search: string; error: string };

/** An organisation or account picker that asks the server by name, 300ms
 *  after typing stops (`useSearchText`, as ParentPicker does), and offers
 *  only what the server answered for the latest search: an older answer that
 *  arrives late is dropped. Chosen records are chips; one the reader can't
 *  open (a `null` kept from saved rules, or an id with no name) reads "an
 *  organisation you can't open" and can only be removed. */
export function RecordPicker({
  record,
  multiple,
  value,
  label,
  labels,
  invalid,
  onNamed,
  onChange,
}: {
  record: PickerRecord;
  multiple: boolean;
  value: DraftValue;
  label: string;
  labels: RuleLabels;
  /** An unfinished row: the search box takes the danger border. */
  invalid: boolean;
  onNamed: ValueOptions['onNamed'];
  onChange: (value: DraftValue) => void;
}) {
  const chosen = (Array.isArray(value) ? value : [value]).filter((id): id is number | null => id === null || typeof id === 'number');
  const names = labels[GROUP[record]];
  const [search, setSearch] = useState('');
  const [text, setText] = useSearchText(search, setSearch);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!search) return;
    let alive = true;
    searchRecords(record, search).then(
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
  }, [record, search]);

  const current = text.trim() && answer && answer.search === search ? answer : null;
  const nameOf = (id: number | null) => (id === null ? undefined : names[String(id)]);
  const pick = (row: PersonRef) => {
    onNamed(GROUP[record], row.id, row.name);
    onChange(multiple ? [...chosen.filter((id) => id !== row.id), row.id] : row.id);
    setText('');
  };
  const remove = (index: number) => onChange(multiple ? chosen.filter((_, i) => i !== index) : undefined);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {chosen.length > 0 ? (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {chosen.map((id, index) => {
            const name = nameOf(id);
            return <Chip key={`${id}-${index}`} name={name ?? HIDDEN_NAME[record]} hidden={!name} onRemove={() => remove(index)} />;
          })}
        </ul>
      ) : null}
      {multiple || chosen.length === 0 ? (
        <div className="flex flex-col gap-1">
          <input
            type="search"
            aria-label={`${label}: search`}
            aria-invalid={invalid}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={record === 'customer' ? 'Search organisations' : 'Search accounts'}
            autoComplete="off"
            className={`${INPUT} ${INVALID} w-56`}
          />
          {current ? (
            'error' in current ? (
              <p role="alert" className="text-[11px] leading-4 text-danger-ink">
                {current.error}
              </p>
            ) : (
              <ul aria-label={`${label}: matches`} className={`flex max-h-56 w-56 flex-col overflow-y-auto py-1 ${OVERLAY}`}>
                {current.rows.length === 0 ? (
                  <li className="px-3 py-2 text-[13px] text-ink-muted">No matches</li>
                ) : (
                  current.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => pick(row)}
                        className={`flex min-h-11 w-full items-center px-3 text-left text-[13px] text-ink hover:bg-subtle sm:min-h-8 ${FOCUS}`}
                      >
                        {row.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
