import { useEffect, useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ApiError } from '../../../lib/apiClient';
import { fetchSlackConversation, filedText, SLACK, threadDescription, type SlackConversationDetail } from '../../../features/organizations/slackApi';
import { errorMessage } from '../portfolio/usePortfolio';
import { Badge, NUM, QUIET, TYPE } from '../../ui';
import { LINKS } from '../../../features/organizations/linkText';
import { TicketLines } from './LinkLines';
import { LINK } from './StoryItemRow';
import { Sheet } from './Sheet';

type Load = { key: string; detail: SlackConversationDetail } | { key: string; gone: true } | { key: string; error: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** One Slack thread (Slack escalations D1 Decision 2): every message oldest
 *  first, the app's own marked, why it is filed here, and Open in Slack. */
export function SlackThread({ id, title, isSm, onClose }: { id: number; title: string; isSm: boolean; onClose: () => void }) {
  const uid = useId();
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSlackConversation(id).then(
      (detail) => {
        if (!cancelled) setLoad({ key, detail });
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setLoad({ key, gone: true });
        else setLoad({ key, error: errorMessage(err, SLACK.LOAD) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  const current = load && load.key === key ? load : null;
  const detail = current && 'detail' in current ? current.detail : null;
  const filed = detail ? filedText(detail) : '';

  return (
    <Sheet title={detail?.title ?? title} description={detail ? threadDescription(detail) : undefined} isSm={isSm} onClose={onClose}>
      {!current ? (
        <div role="status" aria-label={SLACK.OPENING} className="flex flex-col gap-2 py-3">
          <span aria-hidden="true" className="block h-3 w-32 animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
        </div>
      ) : 'error' in current ? (
        <div role="alert" className="flex flex-col items-start gap-2 py-3">
          <p className="text-[13px] text-danger">{current.error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            {SLACK.RETRY}
          </button>
        </div>
      ) : 'gone' in current ? (
        <p className="py-3 text-[13px] text-ink-muted">{SLACK.GONE}</p>
      ) : detail ? (
        <>
          <ol className="flex flex-col divide-y divide-line-subtle">
            {detail.messages.map((m) => (
              <li key={m.ts} className="py-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <span>{m.name || 'Someone'}</span>
                  {m.bot ? <Badge>{SLACK.APP}</Badge> : null}
                </p>
                <p className="text-[11px] text-ink-muted">
                  <time dateTime={m.at} className={NUM}>
                    {when(m.at)}
                  </time>
                </p>
                <p className="mt-2 whitespace-pre-line break-words text-[13px] text-ink">{m.text}</p>
              </li>
            ))}
          </ol>
          {filed ? <p className={`mt-2 ${TYPE.meta}`}>{filed}</p> : null}
          {(detail.tickets?.length ?? 0) > 0 || (detail.hidden_links ?? 0) > 0 ? (
            <section aria-labelledby={`${uid}-issues`} className="mt-3 flex flex-col gap-1">
              <h3 id={`${uid}-issues`} className={TYPE.label}>
                {LINKS.ISSUES}
              </h3>
              <TicketLines tickets={detail.tickets ?? []} hidden={detail.hidden_links ?? 0} />
            </section>
          ) : null}
          {/^https?:\/\//i.test(detail.url) ? (
            <a href={detail.url} target="_blank" rel="noopener noreferrer" className={LINK}>
              {SLACK.OPEN}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
