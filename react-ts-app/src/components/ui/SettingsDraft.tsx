import { useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useInRouterContext } from 'react-router-dom';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { UnsavedChangesDialog } from '../../hooks/UnsavedChangesDialog';
import { PRIMARY, QUIET } from './styles';
import { TYPE } from './type';
import { DRAFT, FlagsContext, RegistryContext, SettingsLeaveSlot, type DraftSection, type Flags, type Registry } from './settingsDraftContext';

/** The stay/leave prompt while anything is edited. Its own component because
 *  the guard needs a router; a frame rendered outside one has no links to guard.
 *  It also fills the layout's leave slot, so the phone section picker asks too. */
function LeaveGuard({ dirty, onLeave }: { dirty: boolean; onLeave: () => void }) {
  const guard = useUnsavedGuard(dirty);
  const fillSlot = useContext(SettingsLeaveSlot);
  const request = guard.request;
  useLayoutEffect(() => {
    if (!fillSlot) return;
    fillSlot(request);
    return () => fillSlot(null);
  }, [fillSlot, request]);
  if (!guard.pending) return null;
  return (
    <UnsavedChangesDialog
      subject="page"
      onConfirm={async () => {
        onLeave();
        guard.leave();
      }}
      onClose={guard.stay}
    />
  );
}

function SaveBar({ registry }: { registry: Registry }) {
  const flags = useContext(FlagsContext);
  const dirtyIds = Object.keys(flags).filter((id) => flags[id].dirty);
  const dirty = dirtyIds.length > 0;
  const sectionSaving = Object.values(flags).some((flag) => flag.saving);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(false);
  // A new edit makes "Saved." stale (adjusting state while rendering, not in an effect).
  const [wasDirty, setWasDirty] = useState(false);
  if (dirty !== wasDirty) {
    setWasDirty(dirty);
    if (dirty) setSaved(false);
  }

  const inRouter = useInRouterContext();
  const busy = running || sectionSaving;
  async function saveAll() {
    if (!dirty || busy) return;
    setRunning(true);
    setSaved(false);
    let ok = true;
    try {
      for (const id of dirtyIds) {
        const handler = registry.handlers.current.get(id);
        if (!handler) continue;
        try {
          if (!(await handler.save())) ok = false;
        } catch {
          ok = false;
        }
      }
    } finally {
      setRunning(false);
    }
    if (ok) setSaved(true);
  }
  // Enter in a draft field saves through the same path (useSettingsDraftSave).
  useLayoutEffect(() => {
    registry.setSaveAll(saveAll);
  });
  const discardAll = () => {
    setSaved(false);
    for (const id of dirtyIds) registry.handlers.current.get(id)?.discard();
  };

  const shown = dirty || busy;
  return (
    <>
      <div
        data-part="save-bar"
        className={shown ? '-mx-4 md:-mx-6 sticky bottom-0 z-10 flex items-center gap-2 border-t border-line bg-surface px-4 py-3 md:px-6 motion-safe:animate-fade-up' : 'contents'}
      >
        <p role="status" className={shown ? `mr-auto ${TYPE.label}` : 'sr-only'}>
          {shown ? DRAFT.UNSAVED : saved ? DRAFT.SAVED : ''}
        </p>
        {shown ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (!busy) discardAll();
              }}
              aria-disabled={busy || undefined}
              className={QUIET}
            >
              {DRAFT.DISCARD}
            </button>
            <button type="button" onClick={() => void saveAll()} aria-disabled={busy || undefined} aria-busy={busy || undefined} className={PRIMARY}>
              {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
              {busy ? DRAFT.SAVING : DRAFT.SAVE}
            </button>
          </>
        ) : null}
      </div>
      {inRouter ? <LeaveGuard dirty={dirty} onLeave={discardAll} /> : null}
    </>
  );
}

/** A settings page's draft scope (settings production spec §5.4, §10.6,
 *  §10.7): the sections inside register their typed edits; one sticky bar
 *  ("Unsaved changes · Discard · Save") saves every edited section in
 *  order, keeps a refused one edited (its error is under its field), and
 *  an in-app link or closing the tab asks first while anything is edited. */
export function SettingsDraftScope({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<string, Pick<DraftSection, 'save' | 'discard'>>());
  const [flags, setFlags] = useState<Flags>({});
  const saveAll = useRef<() => Promise<void>>(() => Promise.resolve());
  const registry = useMemo<Registry>(
    () => ({
      handlers,
      setFlags,
      saveAll: () => saveAll.current(),
      setSaveAll: (save) => {
        saveAll.current = save;
      },
    }),
    [],
  );
  return (
    <RegistryContext.Provider value={registry}>
      <FlagsContext.Provider value={flags}>
        {children}
        <SaveBar registry={registry} />
      </FlagsContext.Provider>
    </RegistryContext.Provider>
  );
}
