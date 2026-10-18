import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { AddRelationshipDialog } from '../../components/canvas/AddRelationshipDialog';
import { MapBoard } from '../../components/canvas/MapBoard';
import { MapContext, type MapContextValue } from '../../components/canvas/MapContext';
import { MapHeader } from '../../components/canvas/MapHeader';
import { NotOnMapTray } from '../../components/canvas/NotOnMapTray';
import { OpenPlansStrip } from '../../components/canvas/OpenPlansStrip';
import { PeopleList } from '../../components/canvas/PeopleList';
import { PersonPanel } from '../../components/canvas/PersonPanel';
import { useMap } from '../../components/canvas/useMap';
import { UnsavedChangesDialog } from '../../hooks/UnsavedChangesDialog';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { FORM_REFUSAL, useRefusalFocus } from '../../components/plans/useRefusalFocus';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { deleteMap } from '../../features/canvas/canvasApi';
import { nodeKind } from '../../features/canvas/canvasBoard';
import { deleteRefusal } from '../../features/canvas/canvasErrors';
import { parseMapId } from '../../features/canvas/canvasParams';
import { SAY } from '../../features/canvas/canvasOptions';
import { recordHref } from '../../features/plans/planText';
import { MD, useMediaQuery } from '../../lib/useMediaQuery';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { BUTTON, Card, EmptyState, ErrorState, FOCUS, LoadingState, PageHeader, SegmentedControl, TYPE } from '../../components/ui';

const BACK = { to: '/canvas', label: 'Canvas' } as const;

/** A map (spec §2.2), keyed by its id so another map never shows this one's state. */
export function MapEditor() {
  const { id: raw } = useParams();
  return <OneMap key={raw} raw={raw} />;
}

function OneMap({ raw }: { raw: string | undefined }) {
  const id = parseMapId(raw);
  const wide = useMediaQuery(MD);
  const editable = wide;
  const { ref, focusRefusal } = useRefusalFocus<HTMLDivElement>(FORM_REFUSAL);
  const map = useMap(id ?? 0, focusRefusal);
  // The board (and the name input, in MapHeader) locks while a save is in
  // flight: simpler and still correct than reconciling a mid-save edit
  // against the save's answer (`editable` on its own still decides the
  // read-only-on-phones split for the header).
  const boardEditable = editable && !map.saving;
  const [openId, setOpenId] = useState<string | null>(null);
  const [relatingFrom, setRelatingFrom] = useState<string | null>(null);
  const navigate = useNavigate();
  const guard = useUnsavedGuard(editable && map.dirty);
  const [confirmReload, setConfirmReload] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<'people' | 'map'>('people');
  // Held after a success: a second Delete before navigate() sends nothing.
  const remover = useSubmitOnce({ holdOnSuccess: true });
  const reload = () => (map.dirty ? setConfirmReload(true) : map.reload());

  // A person may be opened only when `nodeKind` is `person` (Decision 10):
  // hidden and removed nodes have no panel, even if asked for directly.
  const openPerson = (nodeId: string) => {
    const node = map.nodes.find((n) => n.id === nodeId);
    if (node && nodeKind(node, map.hidden, map.people) === 'person') setOpenId(nodeId);
  };

  const context = useMemo<MapContextValue>(
    () => ({
      editable: boardEditable,
      people: map.people,
      hidden: map.hidden,
      nameOf: map.nameOf,
      openPerson,
      askRelationship: setRelatingFrom,
      removePerson: (nodeId: string) => {
        map.removePerson(nodeId);
        setOpenId((cur) => (cur === nodeId ? null : cur));
      },
      relabelLine: map.relabelLine,
      removeLine: map.removeLine,
    }),
    // The map's functions close over its state; rebuild when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardEditable, map.people, map.hidden, map.nodes, map.edges, openId, relatingFrom],
  );

  if (id === null || map.missing) {
    return (
      <OrganizationsFrame>
        <PageHeader back={BACK} title="Map" />
        <Card pad="none">
          <EmptyState title={SAY.MISSING} action={<Link to="/canvas" className={BUTTON}>All maps</Link>} />
        </Card>
      </OrganizationsFrame>
    );
  }
  if (!map.canvas) {
    return (
      <OrganizationsFrame>
        <PageHeader back={BACK} title="Map" />
        <Card pad="none">
          {map.error ? <ErrorState message={map.error} onRetry={map.reload} /> : <LoadingState label="Loading map" variant="block" />}
        </Card>
      </OrganizationsFrame>
    );
  }

  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} />
      <div ref={ref} className="flex min-h-0 flex-1 flex-col gap-3">
        <MapHeader map={map} editable={editable} onDelete={() => setDeleting(true)} />
        {map.refusal ? (
          <div role="alert" tabIndex={-1} data-error="" className={`flex items-start gap-2 rounded-xl bg-danger-dim p-3 text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <ul className="flex flex-col gap-1">
              {map.refusal.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            {map.refusal.changed ? (
              <button type="button" onClick={reload} className={BUTTON}>
                Reload
              </button>
            ) : null}
          </div>
        ) : null}
        <p role="status" className={`${TYPE.bodyMuted} empty:sr-only`}>
          {map.notice}
        </p>
        <OpenPlansStrip plans={map.canvas.open_plans} record={map.canvas.record} />
        <MapContext.Provider value={context}>
          {editable ? (
            <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-base">
              {boardEditable ? <NotOnMapTray map={map} /> : null}
              <MapBoard map={map} editable={boardEditable} onOpen={openPerson} bare />
              {openId && boardEditable ? <PersonPanel map={map} nodeId={openId} onClose={() => setOpenId(null)} /> : null}
            </div>
          ) : (
            <>
              <p className={TYPE.bodyMuted}>{SAY.PHONE_NOTE}</p>
              <SegmentedControl
                label="View"
                options={[
                  { value: 'people', label: 'People' },
                  { value: 'map', label: 'Map' },
                ]}
                value={view}
                onChange={setView}
              />
              {view === 'people' ? <PeopleList map={map} /> : <MapBoard map={map} editable={false} onOpen={() => {}} />}
            </>
          )}
          {relatingFrom ? <AddRelationshipDialog map={map} sourceId={relatingFrom} onClose={() => setRelatingFrom(null)} /> : null}
        </MapContext.Provider>
      </div>
      {confirmReload ? (
        <ConfirmDialog
          title="Discard your changes?"
          message="Reloading shows their changes and drops yours."
          confirmLabel="Reload"
          danger
          onConfirm={async () => map.reload()}
          onClose={() => setConfirmReload(false)}
        />
      ) : null}
      {guard.pending ? <UnsavedChangesDialog subject="map" onConfirm={async () => guard.leave()} onClose={guard.stay} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${map.canvas.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            const outcome = await remover.run(() => deleteMap(map.canvas!.id));
            if (!outcome) return;
            if (!outcome.ok) throw deleteRefusal(outcome.error);
            navigate(`${recordHref(map.canvas!.record)}?tab=maps`, { replace: true });
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
