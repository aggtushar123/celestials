import type { FeedGroupKey, FeedItem, QuestionFeedItem, TaskFeedItem } from '../../features/work/workTypes';
import { BundleRow } from './BundleRow';
import { DraftRow, QuestionRow, ReviewRow, type Settle } from './FeedDecideRows';
import { FeedSuggestionRow } from './FeedSuggestionRow';
import { FeedTaskRow } from './FeedTaskRow';
import { MeetingProposalRow } from './MeetingProposalRow';
import { EmailSuggestionRow } from './EmailSuggestionRow';
import { SlackMessageRow } from './SlackMessageRow';

export interface FeedRowProps {
  item: FeedItem;
  group: FeedGroupKey;
  isSm: boolean;
  me: number | null;
  /** A task's Done is being sent. */
  busy: boolean;
  /** A task's Done refusal. */
  error: string | null;
  onDone: (item: TaskFeedItem) => void;
  /** Decided here: the row leaves with this toast. */
  onSettled: (item: FeedItem, settle: Settle) => void;
  /** Decided elsewhere or expired: the row leaves saying so. */
  onGone: (item: FeedItem, text: string) => void;
  /** 404 or 403: the row leaves and `hidden` grows (Decision 6). */
  onLost: (item: FeedItem, text: string) => void;
  /** A question answered in place: the row leaves with this toast. */
  onAnswered: (item: QuestionFeedItem, settle: Settle) => void;
}

/** One feed item, by kind (spec §5 rows). */
export function FeedRow({ item, group, isSm, me, busy, error, onDone, onSettled, onGone, onLost, onAnswered }: FeedRowProps) {
  switch (item.kind) {
    case 'task':
    case 'todo':
      return <FeedTaskRow item={item} group={group} busy={busy} error={error} onDone={() => onDone(item)} onUndone={() => onSettled(item, { text: 'Task undone.' })} />;
    case 'bundle':
      return <BundleRow item={item} group={group} />;
    case 'rule_review':
      return <ReviewRow item={item} group={group} onSettled={onSettled} onGone={onGone} />;
    case 'question':
      return <QuestionRow item={item} group={group} onAnswered={onAnswered} />;
    case 'draft':
      return <DraftRow item={item} group={group} />;
    case 'suggestion':
      return <FeedSuggestionRow item={item} group={group} isSm={isSm} me={me} onSettled={onSettled} onGone={onGone} onLost={onLost} />;
    case 'slack_message':
      return <SlackMessageRow item={item} group={group} onSettled={onSettled} onLost={onLost} />;
    case 'meeting_proposal':
      return <MeetingProposalRow item={item} group={group} onSettled={onSettled} onLost={onLost} />;
    case 'email_suggestion':
      return <EmailSuggestionRow item={item} group={group} onSettled={onSettled} onLost={onLost} />;
  }
}
