import { useCallback, useEffect, useState } from 'react';
import { fetchTemplates } from '../../features/plans/planApi';
import type { TemplateLists } from '../../features/plans/planTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type TemplatesLoad = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'ready'; lists: TemplateLists };

/** GET plans/templates/, again when `version` changes or on `retry`. */
export function useTemplates(version = 0): [TemplatesLoad, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${version}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: TemplatesLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTemplates().then(
      (lists) => {
        if (alive) setAnswer({ key, load: { status: 'ready', lists } });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, load: { status: 'failed', message: errorMessage(err, 'Could not load templates.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, retry];
}
