import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BAND_LABEL, bandTone, LINK_DAYS, lowFilterLabel } from '../../features/surveys/questions';
import { fetchAnswers } from '../../features/surveys/surveyApi';
import { answersFilter, withAnswersFilter } from '../../features/surveys/surveyParams';
import { dayLabel, recordPath } from '../../features/surveys/surveyText';
import type { AnswerRow, AnswersFilter, BandName, SurveySend } from '../../features/surveys/surveyTypes';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { EmptyState, ErrorState, FOCUS, INLINE_TARGET, ListCard, LoadingState, NUM, SegmentedControl, TYPE } from '../ui';

/** Semantic colour for meaning only: a low score, the middle, a high one. */
const TONE = { low: 'bg-danger-dim text-danger-ink', mid: 'bg-subtle text-ink', high: 'bg-success-dim text-success-ink' } as const;
const LINK = `${INLINE_TARGET} z-10 inline-block max-w-full hover:underline ${FOCUS}`;

type Page = { key: string; rows: AnswerRow[]; next: string | null; hidden: number };

function emptyText(filter: AnswersFilter, send: SurveySend): { title: string; detail: string } {
  if (filter === 'detractors') {
    return { title: send.survey_type === 'nps' ? 'No detractors' : 'No low scores', detail: 'Nobody you can open answered in the low band.' };
  }
  if (filter === 'comments') return { title: 'No answers with a comment', detail: 'A comment is optional on the form.' };
  return { title: 'No answers yet', detail: `Answers appear here as people reply. A link works for ${LINK_DAYS} days.` };
}

/** The score in tabular figures, tinted by its band, the band named for screen
 *  readers so colour never carries the meaning alone. */
export function ScoreChip({ score, band }: { score: number; band: BandName }) {
  return (
    <span data-part="score" className={`${NUM} inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-semibold ${TONE[bandTone(band)]}`}>
      {score}
      <span className="sr-only">, {BAND_LABEL[band]}</span>
    </span>
  );
}

/** One answer, a row: chip, person and record, date, then the comment as
 *  plain text (React escapes it; spec §3). */
function AnswerItem({ row }: { row: AnswerRow }) {
  return (
    <li data-answer={row.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
      <ScoreChip score={row.score} band={row.band} />
      <div className="min-w-0 flex-1 basis-48">
        {/* No overflow on the paragraphs: the name truncates inside its link,
            so the link's 44px pseudo-element hit area is never clipped. */}
        <p className={`${TYPE.body} font-semibold`}>
          {row.contact ? (
            <Link to={`/contacts/${row.contact.id}`} className={LINK}>
              <span className="block truncate">{row.contact.name}</span>
            </Link>
          ) : (
            <em className="block truncate font-normal text-ink-muted">A deleted contact</em>
          )}
        </p>
        {/* Below sm both links keep 44px hit areas from INLINE_TARGET, which
            take no room (UI broken-things fix 20's gap stays closed). */}
        <p className={TYPE.meta}>
          <Link to={recordPath(row.record)} className={LINK}>
            <span className="block truncate">{row.record.name}</span>
          </Link>
        </p>
      </div>
      <span className={`shrink-0 ${TYPE.meta}`}>{dayLabel(row.answered_at)}</span>
      {row.comment ? (
        // The row takes the full line; the measure caps the text inside it.
        <div className="basis-full">
          <p className={`max-w-[68ch] whitespace-pre-line break-words ${TYPE.body}`}>{row.comment}</p>
        </div>
      ) : null}
    </li>
  );
}

/** Answers (spec §2.3): only people the reader may open, newest first, 50
 *  a page by the server's opaque cursor; the rest a count (backend Decision
 *  20: `hidden_count` is one count of answered invites the reader cannot
 *  open, the same number whichever filter is selected — never worded as
 *  "N more detractors", always "N more answers from people you can't
 *  open"). The filter lives in the URL (`?answers=`, plan Decision 9). */
export function AnswersSection({ send }: { send: SurveySend }) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [search, setSearch] = useSearchParams();
  const filter = answersFilter(search);
  const [attempt, setAttempt] = useState(0);
  const key = `${send.id}#${filter}#${attempt}`;
  const [page, setPage] = useState<Page | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [more, setMore] = useState<{ key: string; loading: boolean; error: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAnswers(send.id, filter, null).then(
      (data) => {
        if (alive) setPage({ key, rows: data.results, next: data.next_cursor, hidden: data.hidden_count });
      },
      (err: unknown) => {
        if (alive) setFailure({ key, message: errorMessage(err, 'Could not load the answers.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, send.id, filter]);

  const current = page?.key === key ? page : null;
  const failed = !current && failure?.key === key ? failure.message : null;
  // Belongs to the key it was fetched under, like `page` and `failure`: a
  // filter/attempt change leaves it behind rather than carrying a stale
  // spinner or error over to the newly loaded list.
  const currentMore = more?.key === key ? more : { loading: false, error: null };

  const showMore = async () => {
    if (!current?.next) return;
    const from = current;
    setMore({ key: from.key, loading: true, error: null });
    try {
      const data = await fetchAnswers(send.id, filter, from.next);
      // Added only to the page it continues: a filter changed meanwhile drops it.
      setPage((latest) =>
        latest && latest.key === from.key ? { ...latest, rows: [...latest.rows, ...data.results], next: data.next_cursor, hidden: data.hidden_count } : latest,
      );
      setMore({ key: from.key, loading: false, error: null });
    } catch (err) {
      setMore({ key: from.key, loading: false, error: errorMessage(err, 'Could not load more answers.') });
    }
  };

  const options = [
    { value: 'all' as const, label: 'All' },
    { value: 'detractors' as const, label: lowFilterLabel(send.survey_type) },
    { value: 'comments' as const, label: 'With comments' },
  ];

  const empty = emptyText(filter, send);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className={TYPE.title}>
          Answers
        </h2>
        <SegmentedControl label="Show answers" options={options} value={filter} onChange={(next) => setSearch(withAnswersFilter(search, next), { replace: true })} />
      </div>
      <ListCard
        label="Answers"
        state={
          failed ? (
            <ErrorState message={failed} onRetry={() => setAttempt((n) => n + 1)} />
          ) : !current ? (
            <LoadingState label="Loading answers" />
          ) : current.rows.length === 0 ? (
            <EmptyState title={empty.title} detail={empty.detail} />
          ) : undefined
        }
        listRef={listRef}
        footer={
          current?.next ? (
            <MoreButton next={current.next} loading={currentMore.loading} error={currentMore.error} label="Show more answers" onClick={() => void showMore()} list={listRef} />
          ) : undefined
        }
      >
        {current?.rows.map((row) => <AnswerItem key={row.id} row={row} />)}
      </ListCard>
      {current && current.hidden > 0 ? (
        <p data-part="hidden-answers" className={TYPE.bodyMuted}>
          <span className={NUM}>{current.hidden}</span> more {current.hidden === 1 ? 'answer' : 'answers'} from people you can't open.
        </p>
      ) : null}
    </section>
  );
}
