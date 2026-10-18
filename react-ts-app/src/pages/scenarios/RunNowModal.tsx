import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X, AlertCircle, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { fetchAllPages, ApiError } from '../../lib/apiClient';
import { trapTab } from '../../lib/focusTrap';
import { BUTTON, ICON_BUTTON, OVERLAY, PRIMARY, Select, TYPE } from '../../components/ui';
import type { ScenarioRun } from './types';

interface CustomerOption {
  id: number;
  name: string;
}

interface RunNowModalProps {
  onRun: (customerId: number) => Promise<ScenarioRun>;
  onClose: () => void;
}

const STATUS_ICON = {
  ok: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Done" />,
  skipped: <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-label="Skipped" />,
  failed: <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Failed" />,
};

/** The builder's "Run now" button: picks a real Customer to run the
 * scenario against (see engine.py's own docstring on why only a
 * Customer, not an Account/Contact, is a valid target in v1) and shows
 * the run's own log once it comes back. Runs synchronously on the
 * backend (no task queue) so this modal's "Running…" state is exactly
 * as long as the single POST /run/ request takes. */
export function RunNowModal({ onRun, onClose }: RunNowModalProps) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioRun | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus goes to the dialog itself (the select is disabled while the
  // organisations load) and back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    if (event.key === 'Tab' && dialogRef.current) trapTab(event.nativeEvent, dialogRef.current);
  }

  useEffect(() => {
    async function load() {
      try {
        setCustomers(await fetchAllPages<CustomerOption>('/customers/'));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load organizations.');
      } finally {
        setIsLoadingCustomers(false);
      }
    }
    load();
  }, []);

  async function handleRun() {
    if (!selectedId) return;
    setError(null);
    setIsRunning(true);
    try {
      setResult(await onRun(Number(selectedId)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run this scenario.');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`w-full max-w-md space-y-4 p-5 focus:outline-none ${OVERLAY}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className={TYPE.title}>Run now</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p role="status" className={`text-[13px] leading-5 font-semibold empty:sr-only ${result?.status === 'failed' ? 'text-danger-ink' : 'text-success-ink'}`}>
          {result ? (result.status === 'success' ? 'Run completed.' : 'Run finished with a failure.') : ''}
        </p>

        {!result && (
          <>
            <Select
              label="Organization"
              value={selectedId}
              onChange={setSelectedId}
              disabled={isLoadingCustomers}
              options={[
                { value: '', label: isLoadingCustomers ? 'Loading…' : 'Select an organization', disabled: true },
                ...customers.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />

            {error && (
              <div role="alert" className="flex items-center gap-2 text-[13px] leading-5 text-danger-ink">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className={BUTTON}>
                Cancel
              </button>
              <button type="button" onClick={handleRun} disabled={!selectedId || isRunning} className={PRIMARY}>
                {isRunning ? 'Running…' : 'Run'}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {result.log.map((entry, i) => (
                <li key={i} className={`flex items-start gap-2 ${TYPE.bodyMuted}`}>
                  {STATUS_ICON[entry.status]}
                  <span>
                    <span className="font-semibold text-ink">{entry.action ?? 'Flow'}:</span> {entry.detail}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-1">
              <button type="button" onClick={onClose} className={PRIMARY}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
