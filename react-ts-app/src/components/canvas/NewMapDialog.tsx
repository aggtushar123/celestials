import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMap } from '../../features/canvas/canvasApi';
import { createErrors, type CreateErrors } from '../../features/canvas/canvasErrors';
import { NAME_MAX } from '../../features/canvas/canvasOptions';
import { defaultMapName } from '../../features/canvas/canvasText';
import type { MapStart, RecordKind } from '../../features/canvas/canvasTypes';
import { PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { ANY_REFUSAL, useRefusalFocus } from '../plans/useRefusalFocus';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BuilderDialog } from '../segments/BuilderDialog';

const STARTS: { value: MapStart; label: string }[] = [
  { value: 'people', label: "From this record's people" },
  { value: 'blank', label: 'Blank' },
];

/** New map (spec §2.1): a name and where to start; submitted once, then the editor. */
export function NewMapDialog({ record, onClose }: { record: { kind: RecordKind; id: number; name: string | null }; onClose: () => void }) {
  const navigate = useNavigate();
  const nameId = useId();
  const nameErrorId = useId();
  const [name, setName] = useState(defaultMapName(record.name));
  const [start, setStart] = useState<MapStart>('people');
  const [errors, setErrors] = useState<CreateErrors>({});
  // Held after a success: a second click landing before navigate() takes
  // this dialog away creates nothing more. A refusal frees it.
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const { ref, focusRefusal } = useRefusalFocus<HTMLFormElement>(ANY_REFUSAL);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const where = record.kind === 'organization' ? { customer: record.id } : { account: record.id };
    const outcome = await run(() => createMap({ name, ...where, start }));
    if (!outcome) return;
    if (outcome.ok) {
      navigate(`/canvas/${outcome.value.id}`);
      return;
    }
    setErrors(createErrors(outcome.error));
    focusRefusal();
  }

  return (
    <BuilderDialog title="New map" size="narrow" onClose={onClose}>
      <form ref={ref} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {errors.form ? (
            <p role="alert" tabIndex={-1} data-error="" className="text-[13px] text-danger">
              {errors.form}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-[13px] font-semibold text-ink">
              Name
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={errors.name ? nameErrorId : undefined}
              className={`${INPUT} ${errors.name ? 'border-danger' : 'border-line'}`}
            />
            {errors.name ? (
              <p id={nameErrorId} className="text-[13px] text-danger">
                {errors.name}
              </p>
            ) : null}
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Start from</legend>
            {STARTS.map((option) => (
              <label key={option.value} className="flex min-h-11 items-center gap-2 text-[13px] text-ink sm:min-h-9">
                <input type="radio" name="start" value={option.value} checked={start === option.value} onChange={() => setStart(option.value)} />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line-subtle p-4">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? 'Creating…' : 'Create map'}
          </button>
        </footer>
      </form>
    </BuilderDialog>
  );
}
