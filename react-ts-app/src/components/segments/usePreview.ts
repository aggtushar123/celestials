import { useEffect, useRef, useState } from 'react';
import { previewSegment } from '../../features/segments/segmentApi';
import { rulesMessage } from '../../features/segments/segmentErrors';
import type { PreviewRequest, PreviewResponse, SegmentKind } from '../../features/segments/segmentTypes';

export const PREVIEW_DEBOUNCE_MS = 400;

export type PreviewState =
  | { status: 'incomplete' }
  | { status: 'loading'; last: PreviewResponse | null }
  | { status: 'ready'; data: PreviewResponse }
  | { status: 'error'; message: string };

type Answer = { key: string; data: PreviewResponse } | { key: string; error: string };
/** `last`, with the kind it answered for: a kind change drops a mismatched
 *  one rather than showing it, dimmed, under the new kind's noun. */
type Last = { kind: SegmentKind; data: PreviewResponse } | null;

/** The builder's live preview (plan Decision 3): POST /segments/preview/
 *  400ms after the last change, never while a condition is unfinished
 *  (`request` null). Each request is keyed by its body and an answer counts
 *  only while its key is the latest, so a superseded one is dropped; a
 *  pending debounce is cleared on every change. */
export function usePreview(request: PreviewRequest | null): PreviewState {
  const key = request ? JSON.stringify(request) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [last, setLast] = useState<Last>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = key;
    if (!key) return;
    let cancelled = false;
    const body = JSON.parse(key) as PreviewRequest;
    const timer = window.setTimeout(() => {
      previewSegment(body).then(
        (data) => {
          if (cancelled || latest.current !== key) return;
          setAnswer({ key, data });
          setLast({ kind: body.kind, data });
        },
        (err: unknown) => {
          if (!cancelled && latest.current === key) setAnswer({ key, error: rulesMessage(err) });
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  if (!key) return { status: 'incomplete' };
  if (answer?.key === key) return 'data' in answer ? { status: 'ready', data: answer.data } : { status: 'error', message: answer.error };
  return { status: 'loading', last: last && last.kind === request?.kind ? last.data : null };
}
