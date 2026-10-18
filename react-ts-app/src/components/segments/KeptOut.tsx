import { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronRight } from 'lucide-react';
import { previewSegment } from '../../features/segments/segmentApi';
import type { PreviewResponse, Segment } from '../../features/segments/segmentTypes';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { Card, FOCUS, LoadingState, NUM, QUIET, TYPE } from '../ui';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** The preview names at most ten records (PREVIEW_SIZE), so the ids are
 *  asked for ten at a time: every one of them comes back (Ruling G2). */
export const KEPT_OUT_CHUNK = 10;

type Answer = { records: PreviewResponse['results'] } | { error: string };

/** The owner's kept-out records, which are no longer members, each with
 *  Let back in (plan Decision 9). Named through the preview with no rules
 *  and ten of these ids as pins: exactly those records, as the reader may
 *  open them. Show more names the next ten, so none is ever unreachable. */
export function KeptOut({
  segment,
  disabled,
  toggleRef,
  onLetBackIn,
}: {
  segment: Segment;
  disabled: boolean;
  /** Where Let back in sends focus once the record it named unmounts. */
  toggleRef: RefObject<HTMLButtonElement | null>;
  onLetBackIn: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const key = segment.excluded_ids.join(',');
  const kind = segment.kind;
  // How many chunks are wanted, for this set of ids only: a change to the
  // set (a keep-out, a let-back-in) starts again at the first ten.
  const [wanted, setWanted] = useState({ key, chunks: 1 });
  const chunks = wanted.key === key ? wanted.chunks : 1;
  const [attempt, setAttempt] = useState(0);
  // Answers by `${key}#${chunk}`, so an answer for an older set never shows.
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  useEffect(() => {
    if (!open || !key) return;
    const index = chunks - 1;
    const slot = `${key}#${index}`;
    const ids = key.split(',').map(Number).slice(index * KEPT_OUT_CHUNK, (index + 1) * KEPT_OUT_CHUNK);
    let alive = true;
    const store = (answer: Answer) =>
      setAnswers((previous) => ({
        ...Object.fromEntries(Object.entries(previous).filter(([name]) => name.startsWith(`${key}#`))),
        [slot]: answer,
      }));
    previewSegment({ kind, rules: { match: 'all', conditions: [] }, pinned_ids: ids }).then(
      (data) => {
        if (alive) store({ records: data.results });
      },
      (err: unknown) => {
        if (alive) store({ error: errorMessage(err, 'Could not load who is kept out.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [open, key, kind, chunks, attempt]);

  const slots = Array.from({ length: chunks }, (_, index) => answers[`${key}#${index}`]);
  const records = slots.flatMap((slot) => (slot && 'records' in slot ? slot.records : []));
  const last = slots[chunks - 1];
  const lastError = last && 'error' in last ? last.error : null;
  const more = chunks * KEPT_OUT_CHUNK < segment.excluded_ids.length;
  const total = segment.excluded_ids.length;

  return (
    <Card pad="none">
      <h2>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-4 sm:min-h-12 text-left ${TYPE.title} hover:bg-subtle ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          Kept out <span className={`${NUM} text-[13px] leading-5 font-normal text-ink-muted`}>{total}</span>
        </button>
      </h2>
      {!open ? null : (
        <div className="border-t border-line-subtle">
          {chunks === 1 && lastError ? (
            <p role="alert" className="flex items-center gap-2 px-4 py-3 text-[13px] leading-5 text-danger-ink">
              {lastError}
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={QUIET}>
                Try again
              </button>
            </p>
          ) : chunks === 1 && !last ? (
            <LoadingState label="Loading kept-out records" count={Math.min(3, total)} />
          ) : (
            <>
              <ul ref={listRef} aria-label="Kept out" className="divide-y divide-line-subtle">
                {records.map((record) => (
                  <li key={record.id} className="flex min-h-12 items-center justify-between gap-2 px-4 py-2">
                    <span className={`min-w-0 truncate ${TYPE.body}`}>{record.name}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onLetBackIn(record.id)}
                      aria-label={`Let ${record.name} back in`}
                      className={`${QUIET} shrink-0`}
                    >
                      Let back in
                    </button>
                  </li>
                ))}
              </ul>
              {lastError ? (
                <p role="alert" className="flex items-center gap-2 px-4 py-3 text-[13px] leading-5 text-danger-ink">
                  {lastError}
                  <button type="button" onClick={() => setAttempt((n) => n + 1)} className={QUIET}>
                    Try again
                  </button>
                </p>
              ) : (
                <MoreButton
                  next={more || !last ? String(chunks) : null}
                  loading={!last}
                  error={null}
                  label="Show more kept-out records"
                  onClick={() => setWanted({ key, chunks: chunks + 1 })}
                  list={listRef}
                  className="mt-1.5"
                />
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
