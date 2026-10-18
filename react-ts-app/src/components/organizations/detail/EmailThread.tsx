import { useContext, useEffect, useState } from 'react';
import type { StoryTarget } from '../../../features/organizations/detailScope';
import { fetchThreadAt, storyPath } from '../../../features/organizations/storyApi';
import { sourceName } from '../../../features/organizations/storyKinds';
import type { StoryItem } from '../../../features/organizations/storyTypes';
import { errorMessage } from '../portfolio/usePortfolio';
import { NUM, QUIET } from '../../ui';
import { ShowAccountTags } from './accountNames';
import { Sheet } from './Sheet';

type Load = { key: string; items: StoryItem[] } | { key: string; error: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function Message({ item, current }: { item: StoryItem; current: boolean }) {
  const showTag = useContext(ShowAccountTags);
  const source = sourceName(item.source);
  return (
    <li aria-current={current ? 'true' : undefined} className="py-3">
      <p className="text-[13px] font-semibold text-ink">{item.actor?.name ?? 'Unknown sender'}</p>
      <p className="text-[11px] text-ink-muted">
        <time dateTime={item.occurred_at} className={NUM}>
          {when(item.occurred_at)}
        </time>
      </p>
      {item.summary ? <p className="mt-2 whitespace-pre-line break-words text-[13px] text-ink">{item.summary}</p> : null}
      <p className="mt-1 text-[11px] text-ink-muted">
        {[showTag ? (item.account?.name ?? 'Organization') : null, source ? `via ${source}` : null].filter(Boolean).join(' · ')}
      </p>
    </li>
  );
}

/** One email's thread (spec §1.6). The backend has no thread endpoint: the
 *  story read with `thread` returns that thread's emails, across the page's
 *  scope (an organization and its accounts, or one account), each under its
 *  own visibility rule. Each message shows its sender, time and the story's
 *  one-line summary; the full message and replying stay in Communications. */
export function EmailThread({
  orgId,
  threadId,
  openedId,
  title,
  isSm,
  onClose,
}: {
  /** The page: an organization id, or a scope. */
  orgId: StoryTarget;
  threadId: string;
  /** The email that was opened; it is marked current in the thread. */
  openedId: number;
  title: string;
  isSm: boolean;
  onClose: () => void;
}) {
  const path = storyPath(orgId);
  const [attempt, setAttempt] = useState(0);
  const key = `${path}#${threadId}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchThreadAt(path, threadId).then(
      (items) => {
        if (!cancelled) setLoad({ key, items });
      },
      (err: unknown) => {
        if (!cancelled) setLoad({ key, error: errorMessage(err, 'Could not open this email.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, path, threadId]);

  const current = load && load.key === key ? load : null;
  // The opened email may have gone (or no longer be visible) since the story loaded.
  const thread = current && 'items' in current && current.items.some((item) => item.id === openedId) ? current.items : null;

  return (
    <Sheet title={title} description={thread && thread.length > 1 ? `${thread.length} messages` : undefined} isSm={isSm} onClose={onClose}>
      {!current ? (
        <div role="status" aria-label="Opening the email" className="flex flex-col gap-2 py-3">
          <span aria-hidden="true" className="block h-3 w-32 animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-2/3 animate-pulse rounded bg-subtle" />
        </div>
      ) : 'error' in current ? (
        <div role="alert" className="flex flex-col items-start gap-2 py-3">
          <p className="text-[13px] text-danger">{current.error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : thread ? (
        <ol className="flex flex-col divide-y divide-line-subtle">
          {thread.map((item) => (
            <Message key={item.id} item={item} current={item.id === openedId} />
          ))}
        </ol>
      ) : (
        <p className="py-3 text-[13px] text-ink-muted">This email is no longer available to you.</p>
      )}
    </Sheet>
  );
}
