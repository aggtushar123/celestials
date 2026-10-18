import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, type KeyboardEvent } from 'react';

export const DRAFT = {
  UNSAVED: 'Unsaved changes',
  DISCARD: 'Discard',
  SAVE: 'Save',
  SAVING: 'Saving…',
  SAVED: 'Saved.',
} as const;

export interface DraftSection {
  dirty: boolean;
  saving: boolean;
  /** Saves this section's edits; false when refused (the section shows why). */
  save: () => Promise<boolean>;
  discard: () => void;
}

export type Flags = Record<string, { dirty: boolean; saving: boolean }>;
export interface Registry {
  handlers: { current: Map<string, Pick<DraftSection, 'save' | 'discard'>> };
  setFlags: (update: (current: Flags) => Flags) => void;
  /** Runs the bar's Save. */
  saveAll: () => Promise<void>;
  /** The bar hands in its latest Save. */
  setSaveAll: (save: () => Promise<void>) => void;
}

export const RegistryContext = createContext<Registry | null>(null);
export const FlagsContext = createContext<Flags>({});

/** Navigation that asks first while the page has unsaved edits. The
 *  settings layout sits above each page's draft scope, so it provides this
 *  slot and the scope's leave guard fills it; a control outside the scope
 *  (the phone section picker) navigates through it. Empty: navigate. */
export type LeaveRequest = (to: string) => void;
export const SettingsLeaveSlot = createContext<((request: LeaveRequest | null) => void) | null>(null);

/** One settings section's typed edits, handed to the page's save bar
 *  (settings production spec §5.4): while mounted, the bar knows whether it
 *  is edited or saving, and can save or discard it. Outside a
 *  SettingsDraftScope it does nothing. */
export function useSettingsDraft(section: DraftSection) {
  const registry = useContext(RegistryContext);
  const id = useId();
  // The latest handlers, every render, without a re-render of the bar.
  useLayoutEffect(() => {
    registry?.handlers.current.set(id, {
      save: section.save,
      discard: section.discard,
    });
  });
  useEffect(() => {
    registry?.setFlags((current) =>
      current[id]?.dirty === section.dirty && current[id]?.saving === section.saving
        ? current
        : {
            ...current,
            [id]: { dirty: section.dirty, saving: section.saving },
          },
    );
  }, [registry, id, section.dirty, section.saving]);
  useEffect(
    () => () => {
      registry?.handlers.current.delete(id);
      registry?.setFlags((current) => {
        const rest = { ...current };
        delete rest[id];
        return rest;
      });
    },
    [registry, id],
  );
}

/** The page bar's Save (settings production spec §5.4: Enter in a draft
 *  field saves): a form's onSubmit calls it, so Enter saves every edited
 *  section the way the bar does. Outside a SettingsDraftScope it does nothing. */
export function useSettingsDraftSave(): () => Promise<void> {
  const registry = useContext(RegistryContext);
  return useCallback(() => registry?.saveAll() ?? Promise.resolve(), [registry]);
}

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color']);

/** Enter in a text field submits its form even when the form has several
 *  fields and no submit button (HTML's implicit submission skips such a
 *  form): the settings forms lost their own Save to the bar, and their
 *  onSubmit saves through it (useSettingsDraftSave). A form with its own
 *  submit button (adding an exchange rate) keeps the browser's behaviour.
 *  SettingsFrame listens with it around the page. */
export function submitDraftOnEnter(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return;
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || NOT_TEXT.has(field.type) || !field.form) return;
  if (field.form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]')) return;
  event.preventDefault();
  field.form.requestSubmit();
}
