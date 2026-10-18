import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Card, ErrorState, LoadingState, SettingsFrame } from '../../components/ui';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { fetchWorkSettings } from '../../features/work/workApi';
import { TRACK } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';

const STALE = 'Nothing is shown rather than settings that may be out of date.';

/** A Settings › Work page (delivery 3 Decision 7; UI foundations spec §6.3): a thin data wrapper around SettingsFrame.
 *  GET /work/settings/ with a loading state and Try again inside a card, then the page's own body, which may replace the settings after a
 *  save. After Try again, focus follows the outcome: the h1 once it loads,
 *  Try again if it fails once more (never on the first load). The load
 *  words default to the Tasks and Notifications ones. */
export function WorkSettingsFrame({
  title,
  intro,
  loading = TRACK.LOADING,
  loadFailed = TRACK.LOAD,
  children,
}: {
  title: string;
  intro: string;
  loading?: string;
  loadFailed?: string;
  children: (settings: WorkSettings, onSaved: (next: WorkSettings) => void) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retried = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    fetchWorkSettings().then(
      (data) => {
        if (!alive) return;
        setSettings(data);
        setError(null);
      },
      (err: unknown) => {
        if (alive) setError(errorMessage(err, loadFailed));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt, loadFailed]);

  // Only after a Try again, and only once its answer is on screen.
  useEffect(() => {
    if (!retried.current) return;
    if (settings) headingRef.current?.focus();
    else if (error) errorRef.current?.querySelector('button')?.focus();
    else return;
    retried.current = false;
  }, [settings, error]);

  const retry = () => {
    retried.current = true;
    setError(null);
    setAttempt((n) => n + 1);
  };

  let body: ReactNode;
  if (!settings && error)
    body = (
      <Card pad="none">
        <div ref={errorRef}>
          <ErrorState message={error} detail={STALE} onRetry={retry} />
        </div>
      </Card>
    );
  else if (!settings)
    body = (
      <Card pad="none">
        <LoadingState label={loading} variant="block" />
      </Card>
    );
  else body = children(settings, setSettings);

  return (
    <SettingsFrame title={title} intro={intro} headingRef={headingRef}>
      {body}
    </SettingsFrame>
  );
}
