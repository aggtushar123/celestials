import { ChevronDown, ChevronLeft, Play } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { BUTTON, FOCUS, ICON_BUTTON, Menu, PRIMARY, QUIET, Switch, TYPE } from '../../components/ui';
import { formatRelativeTime } from '../../features/customers/formatters';
import { APPLY_TO_LABELS } from './types';
import type { ApplyToTarget } from './types';

interface ScenarioHeaderProps {
  name: string;
  onNameChange: (name: string) => void;
  applyTo: ApplyToTarget;
  onApplyToChange: (target: ApplyToTarget) => void;
  /** Gates On Event auto-execution only, see revenact-backend's
   * Scenario.is_active docstring. Run Now ignores this. */
  isActive: boolean;
  onIsActiveChange: (active: boolean) => void;
  /** Only true once the scenario has been saved at least once (has a
   * real id) and apply_to === 'organizations' — see engine.py's own
   * docstring on why only that target type is runnable in v1. */
  canRun: boolean;
  onRunNowClick: () => void;
  /** Saves in place — stays on the builder. */
  onSave: () => void;
  /** Saves, then returns to the scenarios list. */
  onSaveAndClose: () => void;
  /** Null until the first save this visit (a brand new, never-saved
   * scenario) or on load for an existing one. */
  lastSavedAt: string | null;
}

export function ScenarioHeader({
  name,
  onNameChange,
  applyTo,
  onApplyToChange,
  isActive,
  onIsActiveChange,
  canRun,
  onRunNowClick,
  onSave,
  onSaveAndClose,
  lastSavedAt,
}: ScenarioHeaderProps) {
  const activeHint = useId();
  return (
    // Wraps below lg (UI broken-things fix 12): one row of 64px from
    // lg, rows of controls below it instead of a header running off-screen.
    <header className="z-20 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line-subtle bg-base px-4 py-2 lg:flex-nowrap">
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
        <Link to="/scenarios" className={`-ml-3 ${QUIET}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Scenarios
        </Link>

        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Untitled scenario"
          aria-label="Scenario name"
          className={`min-h-11 sm:min-h-9 min-w-[12rem] rounded-lg border border-transparent bg-transparent px-2 ${TYPE.title} hover:border-line focus:border-line-strong ${FOCUS}`}
        />

        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className={`float-left mr-2 ${TYPE.bodyMuted}`}>Apply to</legend>
          {(Object.keys(APPLY_TO_LABELS) as ApplyToTarget[]).map((option) => (
            <label key={option} className={`flex min-h-11 sm:min-h-9 cursor-pointer items-center gap-2 ${TYPE.body}`}>
              <input
                type="radio"
                name="applyTo"
                className={`h-4 w-4 ${FOCUS}`}
                checked={applyTo === option}
                onChange={() => onApplyToChange(option)}
              />
              {APPLY_TO_LABELS[option]}
            </label>
          ))}
        </fieldset>

        <Switch checked={isActive} onChange={onIsActiveChange} describedBy={activeHint}>
          {isActive ? 'Active' : 'Inactive'}
        </Switch>
        <p id={activeHint} className={`${TYPE.meta} sr-only`}>
          Gates on event auto-execution. Run now works either way.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {lastSavedAt && <span className={TYPE.meta}>Saved {formatRelativeTime(lastSavedAt)}</span>}

        <button
          type="button"
          onClick={onRunNowClick}
          disabled={!canRun}
          title={canRun ? undefined : 'Save an Organizations scenario first to run it.'}
          className={BUTTON}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Run now
        </button>

        <div className="flex items-center gap-1">
          <button type="button" onClick={onSave} className={PRIMARY}>
            Save
          </button>
          <Menu
            label="More save options"
            trigger={<ChevronDown className="h-4 w-4" aria-hidden="true" />}
            triggerClassName={`${ICON_BUTTON} border border-line`}
            items={[{ key: 'close', label: 'Save and close', onSelect: onSaveAndClose }]}
          />
        </div>
      </div>
    </header>
  );
}
