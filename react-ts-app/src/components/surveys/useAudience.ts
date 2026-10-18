import { useEffect, useRef, useState } from 'react';
import { fetchAudience } from '../../features/surveys/surveyApi';
import { surveyErrors } from '../../features/surveys/surveyErrors';
import type { AudienceCounts, AudienceRequest } from '../../features/surveys/surveyTypes';

export const AUDIENCE_DEBOUNCE_MS = 400;

export type AudienceState =
  | { status: 'incomplete' }
  | { status: 'loading'; last: AudienceCounts | null }
  | { status: 'ready'; data: AudienceCounts }
  | { status: 'error'; message: string };

type Answer = { key: string; data: AudienceCounts } | { key: string; error: string };
/** `last`, with the segment it answered for: a segment change drops a
 *  mismatched one rather than showing it, dimmed, under the new segment's
 *  kind (a different segment can be a different kind, e.g. "organisations"
 *  vs. "accounts" — same bug class as Segments' usePreview). */
type Last = { segment: number; data: AudienceCounts } | null;
const FALLBACK = 'Could not count who this reaches.';

/** The builder's audience count (spec §2.2), as Segments' usePreview:
 *  POST /sends/audience/ 400 ms after the last change, never while nothing
 *  is chosen (`request` null). Each request is keyed by its body and an
 *  answer counts only while its key is the latest; the last good count
 *  stays (dimmed) while a newer one loads. */
export function useAudience(request: AudienceRequest | null): AudienceState {
  const key = request ? JSON.stringify(request) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [last, setLast] = useState<Last>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = key;
    if (!key) return;
    let cancelled = false;
    const body = JSON.parse(key) as AudienceRequest;
    const timer = window.setTimeout(() => {
      fetchAudience(body).then(
        (data) => {
          if (cancelled || latest.current !== key) return;
          setAnswer({ key, data });
          setLast({ segment: body.segment, data });
        },
        (err: unknown) => {
          if (cancelled || latest.current !== key) return;
          const errors = surveyErrors(err, FALLBACK);
          setAnswer({ key, error: errors.roles ?? errors.segment ?? errors.form ?? FALLBACK });
        },
      );
    }, AUDIENCE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  if (!key) return { status: 'incomplete' };
  if (answer?.key === key) return 'data' in answer ? { status: 'ready', data: answer.data } : { status: 'error', message: answer.error };
  return { status: 'loading', last: last && last.segment === request?.segment ? last.data : null };
}
