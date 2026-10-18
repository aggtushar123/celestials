import { useId } from 'react';
import type { PersonRef, Sharing } from '../../features/segments/segmentTypes';
import { Lock, Users, UsersRound } from 'lucide-react';
import { Select, TYPE } from '../ui';
import { Chip } from './Chip';
import { RadioTile } from './RadioTile';

const OPTIONS = [
  { value: 'private', label: 'Only me', icon: Lock },
  { value: 'workspace', label: 'Everyone in the workspace', icon: Users },
  { value: 'people', label: 'Chosen teammates', icon: UsersRound },
] as const satisfies readonly { value: Sharing; label: string; icon: unknown }[];
/** The backend's MAX_SHARED. */
const MAX_SHARED = 50;
/** What a segment's sharing shows teammates. A survey passes its own. */
const SEGMENT_NOTE = 'Teammates see the same rules, but only the members they may open, and a count of the rest. Only you can change it.';

/** Private, the workspace, or chosen teammates (spec Decisions, Sharing),
 *  with a people picker of active teammates. Leaving "Chosen teammates"
 *  clears the choice, as the backend does. */
export function SharingFields({ sharing, sharedWith, teammates, error, onChange, note = SEGMENT_NOTE }: {
  sharing: Sharing;
  sharedWith: PersonRef[];
  /** Active people in the workspace, the owner left out. */
  teammates: PersonRef[];
  error: string | null;
  onChange: (sharing: Sharing, sharedWith: PersonRef[]) => void;
  /** What sharing shows teammates (default: a segment's). */
  note?: string;
}) {
  const name = useId();
  const rest = teammates.filter((person) => !sharedWith.some((chosen) => chosen.id === person.id));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`mb-1 ${TYPE.title}`}>Sharing</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <RadioTile
            key={option.value}
            name={name}
            label={option.label}
            icon={option.icon}
            checked={sharing === option.value}
            onChange={() => onChange(option.value, option.value === 'people' ? sharedWith : [])}
          />
        ))}
      </div>
      <p className={TYPE.meta}>{note}</p>
      {sharing === 'people' ? (
        <div className="flex flex-col gap-2">
          {sharedWith.length > 0 ? (
            <ul aria-label="Shared with" className="flex flex-wrap gap-1.5">
              {sharedWith.map((person) => (
                <Chip key={person.id} name={person.name} onRemove={() => onChange('people', sharedWith.filter((chosen) => chosen.id !== person.id))} />
              ))}
            </ul>
          ) : null}
          <Select
            label="Add a teammate"
            labelPosition="hidden"
            value=""
            disabled={sharedWith.length >= MAX_SHARED}
            onChange={(next) => {
              const person = rest.find((candidate) => String(candidate.id) === next);
              if (person) onChange('people', [...sharedWith, person]);
            }}
            className="self-start"
            options={[{ value: '', label: 'Add a teammate…' }, ...rest.map((person) => ({ value: String(person.id), label: person.name }))]}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
