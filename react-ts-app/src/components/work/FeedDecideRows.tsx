import { useId, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { reviewCountsText } from '../../features/brain/deskText';
import { campaignPath } from '../../features/campaigns/campaignText';
import { FEED, approvedText, draftHref } from '../../features/work/feed';
import type { DraftFeedItem, FeedGroupKey, FeedItem, QuestionFeedItem, ReviewFeedItem } from '../../features/work/workTypes';
import type { ApproveAnswer } from '../../features/rules/ruleTypes';
import { REVIEW_DECIDED, ReviewDecision } from '../rules/ReviewDecision';
import { BUTTON, NUM, TYPE } from '../ui';
import { InlineAnswer } from './InlineAnswer';
import { FeedRowMeta, KIND_ICON, ROW_FOCUS } from './FeedRowParts';
import { feedChanged } from './taskChanges';

/** What a decided row hands up for the toast. */
export interface Settle {
  text: string;
  link?: { label: string; to: To; state?: unknown };
}

/** Every decide row's frame: the kind's icon, then an article named by its
 *  title, the meta line and the row's own body. Flat inside the list. */
function DecideShell({ item, group, children }: { item: FeedItem; group: FeedGroupKey; children: ReactNode }) {
  const titleId = useId();
  const Icon = KIND_ICON[item.kind];
  return (
    <li data-item={item.key} className={`flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {item.title}
        </h3>
        <FeedRowMeta item={item} group={group} />
        {children}
      </article>
    </li>
  );
}

/** `reviewCountsText` with each figure in its own tabular span. */
function Counts({ detail }: { detail: ReviewFeedItem['detail'] }) {
  return (
    <>
      {reviewCountsText(detail)
        .split(/(\d+)/)
        .map((part, index) => (/^\d+$/.test(part) ? <span key={index} className={NUM}>{part}</span> : part))}
    </>
  );
}

/** A rule's review (spec §5): its counts, then Approve or Skip
 *  (ReviewDecision, unchanged). Approving stays here and links the send
 *  (Decision 8). Decided elsewhere (a 409, or a 404: never counted as
 *  lost, Decision 6) reads as the feed's "Already decided." (R13). */
export function ReviewRow({
  item,
  group,
  onSettled,
  onGone,
}: {
  item: ReviewFeedItem;
  group: FeedGroupKey;
  onSettled: (item: FeedItem, settle: Settle) => void;
  onGone: (item: FeedItem, text: string) => void;
}) {
  const d = item.detail;
  const approved = (answer: ApproveAnswer) => {
    feedChanged();
    if ('campaign_send_id' in answer) {
      const campaign = d.review && 'campaign' in d.review ? d.review.campaign : null;
      onSettled(item, { text: approvedText(item.title), link: { label: FEED.OPEN_CAMPAIGN, to: campaign ? campaignPath(campaign.id, answer.campaign_send_id) : '/campaigns' } });
    } else {
      onSettled(item, { text: approvedText(item.title), link: { label: FEED.OPEN_SURVEY, to: `/surveys/${answer.survey_send_id}` } });
    }
  };
  return (
    <DecideShell item={item} group={group}>
      <p data-part="counts" className={TYPE.body}>
        <Counts detail={d} />
      </p>
      {item.actions.length > 0 ? (
        <ReviewDecision
          reviewId={item.id}
          kind={d.review_kind}
          ruleName={d.rule_name}
          runOn={d.review?.run_on}
          storedRefusal={d.review?.result?.error}
          onApproved={approved}
          onGone={(message) => {
            feedChanged();
            onGone(item, message === REVIEW_DECIDED ? FEED.ALREADY : message);
          }}
        />
      ) : (
        <p className={TYPE.bodyMuted}>{FEED.READ_ONLY}</p>
      )}
    </DecideShell>
  );
}

/** A question for the reader: its full text when the title cut it, and
 *  Answer in place where the reader may answer (`actions`, the server's rule). */
export function QuestionRow({
  item,
  group,
  onAnswered,
}: {
  item: QuestionFeedItem;
  group: FeedGroupKey;
  onAnswered: (item: QuestionFeedItem, settle: Settle) => void;
}) {
  return (
    <DecideShell item={item} group={group}>
      {item.detail.text !== item.title ? <p className={`max-w-[68ch] break-words ${TYPE.bodyMuted}`}>{item.detail.text}</p> : null}
      {item.actions.includes('answer') ? <InlineAnswer item={item} onAnswered={onAnswered} /> : null}
    </DecideShell>
  );
}

/** A reply the agent drafted for the reader: Open draft in Communications. */
export function DraftRow({ item, group }: { item: DraftFeedItem; group: FeedGroupKey }) {
  return (
    <DecideShell item={item} group={group}>
      <p className={TYPE.bodyMuted}>{item.detail.channel === 'email' ? FEED.EMAIL_REPLY : FEED.TICKET_REPLY}</p>
      <Link to={draftHref(item)} className={`${BUTTON} self-start`}>
        {FEED.OPEN_DRAFT}
      </Link>
    </DecideShell>
  );
}
