import { useCallback, useState } from 'react';
import type { AddKind } from '../../../features/organizations/storyKinds';
import { useTaskChanges } from '../../work/taskChanges';

/** The tabs opened so far, the active one included. A tab mounts when first
 *  opened and then stays mounted, hidden while another shows (DetailTabPanels):
 *  its lists read on mount, so unmounting one would read it again and blank
 *  it on the way back, and the story keeps its place. Tracked during render,
 *  so the tab mounts in the same render that selects it. */
export function useVisitedTabs<K extends string>(active: K): ReadonlySet<K> {
  const [visited, setVisited] = useState<ReadonlySet<K>>(() => new Set([active]));
  if (!visited.has(active)) {
    const next = new Set(visited).add(active);
    setVisited(next);
    return next;
  }
  return visited;
}

/** What a detail page reads again after a change: `version` the row and
 *  record (after an edit or a handover), `storyVersion` the story, and
 *  `callsVersion` the Files tab's calls list. */
export function useDetailVersions() {
  const [version, setVersion] = useState(0);
  const [storyVersion, setStoryVersion] = useState(0);
  const [callsVersion, setCallsVersion] = useState(0);
  const reloadHeader = useCallback(() => setVersion((v) => v + 1), []);
  const reloadStory = useCallback(() => setStoryVersion((v) => v + 1), []);
  // A task changed in the panel (Work spec §1.5): the story reads again.
  useTaskChanges(reloadStory);
  /** A record was added through + Add: the story reads again, and so does
   *  the calls list for a call (Files keeps it mounted once opened). */
  const onAdded = useCallback((what: AddKind) => {
    setStoryVersion((v) => v + 1);
    if (what === 'call') setCallsVersion((v) => v + 1);
  }, []);
  return {
    version,
    storyVersion,
    callsVersion,
    reloadHeader,
    reloadStory,
    onAdded,
  };
}
