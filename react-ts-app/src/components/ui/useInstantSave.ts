import { useCallback, useRef, useState } from 'react';
import { useToast } from './toastContext';

export const INSTANT = { SAVED: 'Saved', UNDO: 'Undo', UNDONE: 'Change undone', UNDO_FAILED: 'Could not undo that change.' } as const;

export interface InstantChange<S> {
  /** Which control is saving, for `busyKey`. */
  key: string;
  request: () => Promise<S>;
  onSaved: (saved: S) => void;
  /** Sends the previous value back; with it the toast offers Undo. */
  undo?: () => Promise<S>;
  onUndone?: (restored: S) => void;
  onError: (error: unknown) => void;
}

/** A setting that saves the moment it changes (settings production spec
 *  §5.4, §10.5): one request at a time, the control keeping its value until
 *  the server answers, then "Saved" with an Undo that sends the previous
 *  value back through the same call. A refusal goes to `onError` (the form
 *  shows it under the row); there is nothing to revert. */
export function useInstantSave() {
  const toast = useToast();
  const running = useRef(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const run = useCallback(
    async <S,>(change: InstantChange<S>): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      setBusyKey(change.key);
      try {
        const saved = await change.request();
        change.onSaved(saved);
        const undo = change.undo;
        toast({
          message: INSTANT.SAVED,
          action: undo
            ? {
                label: INSTANT.UNDO,
                onAction: () => {
                  undo().then(
                    (restored) => {
                      change.onUndone?.(restored);
                      toast({ message: INSTANT.UNDONE });
                    },
                    () => toast({ message: INSTANT.UNDO_FAILED }),
                  );
                },
              }
            : undefined,
        });
        return true;
      } catch (error) {
        change.onError(error);
        return false;
      } finally {
        running.current = false;
        setBusyKey(null);
      }
    },
    [toast],
  );

  return { busyKey, run };
}
