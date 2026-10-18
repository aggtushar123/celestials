// "Search older mail in Gmail" (contract §6, decision 28; Decision 12): the
// person's search run live in Gmail, 20 at a time, newest first, with More
// from Gmail. Nothing is stored until a result is opened: one Revenact
// already holds says "In Revenact" and opens its stored copy; any other is
// stored first (POST open), then opened.

import { useEffect, useState } from 'react';
import { ChevronLeft, Paperclip } from 'lucide-react';
import { draftFailure, openGmailResult, searchGmail, type GmailSearchResult } from '../../features/mail/mailDrafts';
import { BACK_TO_MAIL, GMAIL_MORE, GMAIL_NONE, GMAIL_OPEN_FAILED, GMAIL_RESULTS, GMAIL_SEARCH_FAILED, GMAIL_SEARCHING, gmailEstimate, HELD } from '../../features/mail/mailText';
import { Figured } from '../../components/brain/Figured';
import { Badge, BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, ListRow, LoadingState, NUM, QUIET, TYPE } from '../../components/ui';
import { dayOf } from './mailWho';

type Page = { key: string; results: GmailSearchResult[]; next: string | null; estimate: number };
type Read = Page | { key: string; error: string };

const ALERT = 'mx-4 mt-2 text-[13px] leading-5 text-danger-ink';

export function GmailSearchResults({ q, onOpen, onBack }: { q: string; onOpen: (messageId: number) => void; onBack: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${q}#${attempt}`;
  const [read, setRead] = useState<Read | null>(null);
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    searchGmail(q, null).then(
      (page) => {
        if (live) setRead({ key, results: page.results, next: page.next_page_token, estimate: page.result_size_estimate });
      },
      (err: unknown) => {
        if (live) setRead({ key, error: draftFailure(err, GMAIL_SEARCH_FAILED).text });
      },
    );
    return () => {
      live = false;
    };
  }, [q, key]);

  // Only the answer for this search and attempt; an older one never shows.
  const current = read?.key === key ? read : null;
  const page = current && !('error' in current) ? current : null;

  async function loadMore() {
    if (!page?.next || more) return;
    setMore(true);
    setMoreError(null);
    try {
      const next = await searchGmail(q, page.next);
      setRead({ ...page, results: [...page.results, ...next.results], next: next.next_page_token });
    } catch (err) {
      setMoreError(draftFailure(err, GMAIL_SEARCH_FAILED).text);
    } finally {
      setMore(false);
    }
  }

  async function open(result: GmailSearchResult) {
    if (result.message_id !== null) {
      onOpen(result.message_id);
      return;
    }
    if (opening) return;
    setOpening(result.gmail_id);
    setOpenError(null);
    try {
      const message = await openGmailResult(result.gmail_id);
      onOpen(message.id);
    } catch (err) {
      setOpenError(draftFailure(err, GMAIL_OPEN_FAILED).text);
    } finally {
      setOpening(null);
    }
  }

  return (
    <section aria-label={GMAIL_RESULTS} aria-busy={opening !== null || undefined} className="flex flex-col">
      <button type="button" onClick={onBack} className={`-ml-3 self-start ${QUIET}`}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {BACK_TO_MAIL}
      </button>
      <div className="flex flex-wrap items-baseline gap-x-2 px-4 pb-1">
        <h3 className={TYPE.title}>{GMAIL_RESULTS}</h3>
        {page && page.estimate > 0 ? (
          <span className={TYPE.meta}>
            <Figured text={gmailEstimate(page.estimate)} />
          </span>
        ) : null}
      </div>
      {!current ? (
        <LoadingState label={GMAIL_SEARCHING} count={4} />
      ) : 'error' in current ? (
        <UiErrorState message={current.error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : current.results.length === 0 ? (
        <UiEmptyState size="inline" title={GMAIL_NONE} />
      ) : (
        <ul aria-label={GMAIL_RESULTS} className="divide-y divide-line-subtle">
          {current.results.map((result) => (
            <ListRow
              key={result.gmail_id}
              title={result.from.name || result.from.address}
              meta={result.snippet ? `${result.subject}: ${result.snippet}` : result.subject}
              trailing={
                <>
                  {result.has_attachments ? (
                    <>
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                      <span className="sr-only">Has attachments</span>
                    </>
                  ) : null}
                  {result.message_id !== null ? <Badge>{HELD}</Badge> : null}
                  <span className={`ml-auto ${TYPE.meta} ${NUM}`}>{dayOf(result.sent_at)}</span>
                </>
              }
              onSelect={() => void open(result)}
            />
          ))}
        </ul>
      )}
      {openError ? (
        <p role="alert" className={ALERT}>
          {openError}
        </p>
      ) : null}
      {page?.next ? (
        <button type="button" onClick={() => void loadMore()} disabled={more} className={`mt-4 ml-4 self-start ${BUTTON}`}>
          {more ? GMAIL_SEARCHING : GMAIL_MORE}
        </button>
      ) : null}
      {moreError ? (
        <p role="alert" className={ALERT}>
          {moreError}
        </p>
      ) : null}
    </section>
  );
}
