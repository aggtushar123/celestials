import { useId, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { createSlackJira, dismissSlackMessage, readRefusal, sendSlackReply } from '../../features/work/workApi';
import { SLACK_ROW, compactMoney, withIssue } from '../../features/work/slackMessageText';
import type { FeedGroupKey, FeedItem, SlackMessageFeedItem } from '../../features/work/workTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, FORM_ALERT, FORM_OK, INPUT, NUM, QUIET, TYPE } from '../ui';
import type { Settle } from './FeedDecideRows';
import { handedToText } from '../../features/work/feed';
import { FeedRowMeta, KIND_ICON, ROW_FOCUS } from './FeedRowParts';

const AREA = `${INPUT} min-h-20 py-2`;
const SECTION = 'flex max-w-[68ch] flex-col gap-1.5 border-t border-line-subtle pt-2';

/** A Slack message the person sent to Revenact themselves (connections spec
 *  2026-10-16 §3, Send to Revenact): the agent's one-line summary, who sent
 *  it, the message itself, the customer's context, and its two things, each
 *  one click (owner, 2026-10-16): the drafted Jira issue and the drafted,
 *  editable reply to the sender, or both at once (the issue first, so the
 *  reply carries its link). Only its owner ever sees it; a 404 means it is gone. */
export function SlackMessageRow({
  item,
  group,
  onSettled,
  onLost,
}: {
  item: SlackMessageFeedItem;
  group: FeedGroupKey;
  onSettled: (item: FeedItem, settle: Settle) => void;
  onLost: (item: FeedItem, text: string) => void;
}) {
  const titleId = useId();
  const jiraId = useId();
  const replyId = useId();
  const d = item.detail;
  const Icon = KIND_ICON.slack_message;
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });

  const [issue, setIssue] = useState<{ key: string; url: string } | null>(d.jira?.key ? { key: d.jira.key, url: d.jira.url } : null);
  const [title, setTitle] = useState(d.jira?.summary ?? '');
  const [replied, setReplied] = useState<string | null>(d.reply?.sent_at ? d.reply.url : null);
  const [text, setText] = useState(() => (issue && d.reply ? withIssue(d.reply.with_issue, issue.key, issue.url) : (d.reply?.draft ?? '')));
  const [edited, setEdited] = useState(false);
  const [working, setWorking] = useState<null | 'jira' | 'reply' | 'both'>(null);

  const canJira = item.actions.includes('jira') && Boolean(d.jira?.available) && !issue;
  const canReply = item.actions.includes('reply') && Boolean(d.reply) && replied === null;
  const to = d.reply?.to || d.sender;

  async function dismiss() {
    setError(null);
    const outcome = await run(() => dismissSlackMessage(item.id));
    if (!outcome) return;
    if (outcome.ok) return onSettled(item, { text: SLACK_ROW.DISMISSED });
    if (outcome.error instanceof ApiError && outcome.error.status === 404) return onLost(item, SLACK_ROW.GONE);
    setError(SLACK_ROW.DISMISS_FAILED);
  }

  /** The issue, made now; null when refused (the reason is shown). */
  async function makeIssue(): Promise<{ key: string; url: string } | null> {
    try {
      const made = await createSlackJira(item.id, { summary: title.trim(), description: d.jira?.description ?? '' });
      setIssue(made);
      if (!edited && d.reply) setText(withIssue(d.reply.with_issue, made.key, made.url));
      return made;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onLost(item, SLACK_ROW.GONE);
      else setError(readRefusal(err, SLACK_ROW.JIRA_FAILED).form);
      return null;
    }
  }

  async function postReply(body: string): Promise<boolean> {
    try {
      const posted = await sendSlackReply(item.id, body);
      setReplied(posted.url);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onLost(item, SLACK_ROW.GONE);
      else setError(readRefusal(err, SLACK_ROW.REPLY_FAILED).form);
      return false;
    }
  }

  async function act(what: 'jira' | 'reply' | 'both') {
    if (working) return;
    // aria-disabled keeps the buttons focusable, so the guard is here.
    if (what !== 'reply' && !title.trim()) return;
    if (what !== 'jira' && !text.trim()) return;
    setError(null);
    setWorking(what);
    try {
      if (what === 'jira') await makeIssue();
      else if (what === 'reply') await postReply(text);
      else {
        const made = await makeIssue();
        if (made) await postReply(!edited && d.reply ? withIssue(d.reply.with_issue, made.key, made.url) : text);
      }
    } finally {
      setWorking(null);
    }
  }

  const context = d.context && item.record ? d.context : null;

  return (
    <li data-item={item.key} className={`flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {d.summary || item.title}
        </h3>
        <FeedRowMeta item={item} group={group} />
        {d.handed_to && d.handed_to.length > 0 ? (
          <p data-part="handed-to" className={TYPE.meta}>
            {handedToText(d.handed_to.map((person) => person.name))}
          </p>
        ) : null}
        <blockquote className={`max-w-[68ch] border-l-2 border-line pl-3 ${TYPE.bodyMuted}`}>
          <span className="sr-only">{SLACK_ROW.FROM} </span>
          <span className="font-semibold text-ink">{d.sender}</span>: {d.excerpt || d.text}
        </blockquote>

        {context && item.record ? (
          <div role="group" aria-label={SLACK_ROW.ABOUT(item.record.name)} className={`flex flex-col gap-0.5 ${TYPE.meta}`}>
            <p className={NUM}>
              {[
                context.health_score !== null ? SLACK_ROW.HEALTH(context.health_score.toFixed(1)) : '',
                context.arr !== null ? SLACK_ROW.ARR(compactMoney(context.arr)) : '',
                context.days_to_renewal !== null ? SLACK_ROW.RENEWS(context.days_to_renewal) : '',
                context.owner ? SLACK_ROW.OWNER(context.owner) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {(d.open_tickets ?? []).map((t) => (
              <p key={t.number || t.title} className={NUM}>
                {t.url ? (
                  <a href={t.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {SLACK_ROW.TICKET(t.number, t.title, t.days_open)}
                  </a>
                ) : (
                  SLACK_ROW.TICKET(t.number, t.title, t.days_open)
                )}
              </p>
            ))}
          </div>
        ) : null}

        {!d.jira && !d.reply && d.suggested_step ? <p className={TYPE.meta}>{SLACK_ROW.SUGGESTED(d.suggested_step.label)}</p> : null}

        {d.jira ? (
          <div className={SECTION}>
            <h4 className={TYPE.label}>{SLACK_ROW.JIRA_HEADING}</h4>
            {issue ? (
              <p className={`flex items-center gap-1.5 ${FORM_OK}`}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {SLACK_ROW.JIRA_MADE}{' '}
                <a href={issue.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                  {issue.key}
                </a>
              </p>
            ) : d.jira.available ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor={jiraId} className={TYPE.meta}>
                    {SLACK_ROW.JIRA_TITLE(d.jira.project)}
                  </label>
                  <input id={jiraId} className={INPUT} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <button type="button" onClick={() => void act('jira')} aria-disabled={working !== null || !title.trim() || undefined} className={BUTTON}>
                  {working === 'jira' ? SLACK_ROW.JIRA_CREATING : SLACK_ROW.JIRA_CREATE}
                </button>
              </div>
            ) : (
              <p className={TYPE.meta}>{SLACK_ROW.JIRA_NONE}</p>
            )}
          </div>
        ) : null}

        {d.reply ? (
          <div className={SECTION}>
            <h4 className={TYPE.label}>{SLACK_ROW.REPLY_HEADING}</h4>
            {replied !== null ? (
              <p className={`flex flex-wrap items-center gap-1.5 ${FORM_OK}`}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {SLACK_ROW.REPLIED(to)}
                {replied ? (
                  <a href={replied} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {SLACK_ROW.REPLY_VIEW}
                  </a>
                ) : null}
              </p>
            ) : (
              <>
                <label htmlFor={replyId} className={TYPE.meta}>
                  {SLACK_ROW.REPLY_LABEL(to)}
                </label>
                <textarea
                  id={replyId}
                  className={AREA}
                  value={text}
                  maxLength={3000}
                  onChange={(e) => {
                    setText(e.target.value);
                    setEdited(true);
                  }}
                />
                <div>
                  <button type="button" onClick={() => void act('reply')} aria-disabled={working !== null || !text.trim() || undefined} className={BUTTON}>
                    {working === 'reply' ? SLACK_ROW.REPLY_SENDING : SLACK_ROW.REPLY_SEND}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className={FORM_ALERT}>
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {canJira && canReply ? (
            <button type="button" onClick={() => void act('both')} aria-disabled={working !== null || !title.trim() || !text.trim() || undefined} className={BUTTON}>
              {SLACK_ROW.BOTH}
            </button>
          ) : null}
          {d.permalink ? (
            <a href={d.permalink} target="_blank" rel="noreferrer" aria-describedby={titleId} className={BUTTON}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {SLACK_ROW.OPEN}
            </a>
          ) : null}
          {item.actions.includes('dismiss') ? (
            <button type="button" onClick={() => void dismiss()} aria-disabled={busy || undefined} aria-describedby={titleId} className={QUIET}>
              {SLACK_ROW.DISMISS}
            </button>
          ) : null}
        </div>
      </article>
    </li>
  );
}
