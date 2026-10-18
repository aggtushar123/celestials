import { useEffect, useRef, useState } from 'react';
import { previewCampaign } from '../../features/campaigns/campaignApi';
import { campaignErrors } from '../../features/campaigns/campaignErrors';
import { PREVIEW_DEBOUNCE_MS } from '../../features/campaigns/campaignOptions';
import type { Preview, PreviewRequest } from '../../features/campaigns/campaignTypes';

/** `loading.error`: the last answer's refusal, kept while the next loads
 *  so its words do not flicker (and are not announced again). */
export type PreviewState = { status: 'idle' } | { status: 'loading'; last: Preview | null; error: string | null } | { status: 'ready'; data: Preview } | { status: 'error'; message: string };
type Answer = { key: string; data: Preview } | { key: string; error: string };
const FALLBACK = 'Could not draw the preview.';

/** The editor's preview (spec §2.2), as Surveys' useAudience: POST preview/
 *  400 ms after the last change, keyed by its body; an answer counts only
 *  while its key is the latest; the last good one stays, dimmed, while a
 *  newer one loads. */
export function usePreview(campaignId: number | null, request: PreviewRequest | null): PreviewState {
  const key = campaignId !== null && request ? JSON.stringify([campaignId, request]) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [last, setLast] = useState<Preview | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = key;
    if (!key) return;
    let cancelled = false;
    const [id, body] = JSON.parse(key) as [number, PreviewRequest];
    const timer = window.setTimeout(() => {
      previewCampaign(id, body).then(
        (data) => {
          if (cancelled || latest.current !== key) return;
          setAnswer({ key, data });
          setLast(data);
          setLastError(null);
        },
        (err: unknown) => {
          if (cancelled || latest.current !== key) return;
          const found = campaignErrors(err, FALLBACK);
          const error = found.subject ?? found.body ?? found.form ?? Object.values(found)[0] ?? FALLBACK;
          setAnswer({ key, error });
          setLastError(error);
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  if (!key) return { status: 'idle' };
  if (answer?.key === key) return 'data' in answer ? { status: 'ready', data: answer.data } : { status: 'error', message: answer.error };
  return { status: 'loading', last, error: lastError };
}
