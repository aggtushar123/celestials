// The open conversation (two-way Gmail D2, spec §4): its subject, record
// and labels; what can be done to it; every message oldest first with the
// older ones folded; and a reply to the newest message from the other side.
// An action changes the screen at once (the slice puts it back if refused);
// what this mailbox cannot do is off, with the reason as the button's title
// (Decision 5).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArchiveRestore, ArrowUpRight, Check, Forward, MailOpen, Reply, ReplyAll, Star, Trash2, VolumeX } from 'lucide-react';
import type { MailFolder, MailLabelEntry, MailThreadDetail, ThreadPatch } from '../../features/mail/mailboxSlice';
import {
  ANSWER_GROUP,
  CONVERSATION_CHOOSE,
  CONVERSATION_OPENING,
  CONVERSATION_UNOPENED,
  deletedMessages,
  FORWARD,
  OLDER_IN_GMAIL,
  REPLY,
  REPLY_ALL,
  REPLY_PLACEHOLDER,
  replyHint,
  type MailActionGate,
} from '../../features/mail/mailText';
import { Figured } from '../../components/brain/Figured';
import { Badge, BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, FOCUS, ICON_BUTTON, INLINE_TARGET, LoadingState, NUM, OverflowMenu, QUIET, TYPE } from '../../components/ui';
import { CATEGORY_LABEL } from './mailCategories';
import { ReplyBox } from './ReplyBox';
import { forwardTarget, isLiveDraft, replyTarget } from './mailWho';
import { labelState } from '../../features/mail/mailOptimistic';
import { LabelMenu } from './LabelMenu';
import { LabelChips } from './MailLabels';
import { ThreadMessage } from './ThreadMessage';
import { ShareToRevenact } from '../../components/mail/ShareToRevenact';

export function MailDetail({
  thread,
  loading,
  error,
  folder,
  gate,
  labels,
  replying,
  replyError,
  repliedId,
  onRetry,
  onAction,
  onUnmute,
  onReply,
  onCreateLabel,
  writer = false,
  onCompose,
  onEditDraft,
}: {
  thread: MailThreadDetail | null;
  loading: boolean;
  /** Why the conversation could not be opened. */
  error: string | null;
  /** The view it was opened from: Trash shows deleted messages and offers no reply. */
  folder: MailFolder;
  gate: MailActionGate;
  /** The mailbox's labels, for the label menu. */
  labels: MailLabelEntry[];
  replying: boolean;
  replyError: string | null;
  repliedId: number | null;
  onRetry: () => void;
  onAction: (patch: ThreadPatch) => void;
  /** Unmuting goes through the bulk route (Decision 4). */
  onUnmute: () => void;
  onReply: (messageId: number, body: string) => void;
  /** Creates a label and applies it here; resolves to a refusal or null. */
  onCreateLabel: (name: string) => Promise<string | null>;
  /** Gmail two-way: Reply, Reply all and Forward open the composer (D3 Decision 3); otherwise today's reply box. */
  writer?: boolean;
  onCompose?: (kind: 'reply' | 'reply_all' | 'forward', messageId: number) => void;
  onEditDraft?: (draftId: number) => void;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [unfolded, setUnfolded] = useState<ReadonlySet<number>>(() => new Set());

  if (!thread) {
    return (
      <section aria-label="Conversation" aria-busy={loading} className="flex grow min-w-0 flex-col">
        {error ? (
          <UiErrorState message={error} detail={CONVERSATION_UNOPENED} onRetry={onRetry} />
        ) : loading ? (
          <LoadingState label={CONVERSATION_OPENING} variant="block" />
        ) : (
          <UiEmptyState size="inline" title={CONVERSATION_CHOOSE} />
        )}
      </section>
    );
  }

  const inTrash = folder === 'trash';
  const live = thread.messages.filter((m) => m.folder !== 'trash');
  const shown = inTrash || showDeleted || live.length === 0 ? thread.messages : live;
  const deleted = thread.messages.length - shown.length;
  // A live draft is a line of its own (D3): the newest real message stays open.
  const newest = shown.filter((m) => !m.draft).at(-1) ?? shown[shown.length - 1];
  // The toolbar speaks for the newest live message, even while deleted ones
  // are shown, and never for a draft not sent yet.
  const current = live.filter((m) => !isLiveDraft(m)).at(-1) ?? live.at(-1) ?? newest;
  const state = current.state;
  const starred = thread.messages.some((m) => m.is_starred);
  const target = replyTarget(shown);
  const canReply = !inTrash && folder !== 'spam' && target !== null;
  const forwardable = !inTrash && folder !== 'spam' ? forwardTarget(shown) : null;
  const off = Boolean(gate.blocked);
  const offTitle = gate.blocked ?? undefined;
  const href = thread.account ? (thread.account.type === 'customer' ? `/organizations/${thread.account.id}` : `/accounts/${thread.account.id}`) : null;

  function toggle(id: number) {
    setUnfolded((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section aria-label="Conversation" className="flex grow min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line-subtle px-4 pb-3 pt-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <div className="grow min-w-0">
            <h2 className={`mb-1 ${TYPE.title}`}>{thread.subject}</h2>
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
              {shown.length > 1 ? (
                <span>
                  <span className={NUM}>{shown.length}</span> messages
                </span>
              ) : null}
              <Badge>{CATEGORY_LABEL[current.category]}</Badge>
              <LabelChips labels={thread.labels} />
              {thread.account && href ? (
                <Link to={href} className={`inline-flex items-center gap-1 font-semibold text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`}>
                  {thread.account.name}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            {thread.account && current.shared !== undefined ? (
              // Remounts per conversation: its shared state is the thread's own.
              <div className="mt-2">
                <ShareToRevenact key={thread.thread_id} messageId={current.id} shared={thread.messages.some((m) => m.shared)} customerName={thread.account.name} />
              </div>
            ) : null}
          </div>
          <div role="toolbar" aria-label="Conversation actions" className="shrink-0 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onAction({ is_starred: !starred })}
              disabled={off}
              aria-pressed={starred}
              aria-label={starred ? 'Unstar' : 'Star'}
              title={offTitle ?? (starred ? 'Unstar' : 'Star')}
              className={ICON_BUTTON}
            >
              <Star className={`h-4 w-4 ${starred ? 'text-warning' : ''}`} fill={starred ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onAction({ is_read: false })} disabled={off} aria-label="Mark unread" title={offTitle ?? 'Mark unread'} className={ICON_BUTTON}>
              <MailOpen className="h-4 w-4" aria-hidden="true" />
            </button>
            {gate.gmail ? (
              <LabelMenu
                variant="icon"
                labels={labels}
                stateOf={(id) => labelState(thread.messages, id)}
                disabled={off}
                disabledReason={gate.blocked}
                onToggle={(id, add) => onAction(add ? { add_labels: [id] } : { remove_labels: [id] })}
                onCreate={onCreateLabel}
              />
            ) : null}
            {gate.gmail ? (
              inTrash ? (
                <button type="button" onClick={() => onAction({ trashed: false })} disabled={off} aria-label="Restore" title={offTitle ?? 'Restore'} className={ICON_BUTTON}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button type="button" onClick={() => onAction({ trashed: true })} disabled={off} aria-label="Delete" aria-keyshortcuts="#" title={offTitle ?? 'Delete'} className={ICON_BUTTON}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )
            ) : null}
            {gate.gmail && !off ? (
              <OverflowMenu
                items={[
                  folder === 'spam'
                    ? { key: 'not-spam', label: 'Not spam', onSelect: () => onAction({ spam: false }) }
                    : { key: 'spam', label: 'Report spam', onSelect: () => onAction({ spam: true }) },
                ]}
              />
            ) : null}
            <button
              type="button"
              onClick={() => (state === 'muted' ? onUnmute() : onAction({ state: 'muted' }))}
              aria-pressed={state === 'muted'}
              aria-label={state === 'muted' ? 'Unmute' : 'Mute'}
              title={state === 'muted' ? 'Unmute' : 'Mute'}
              className={`${ICON_BUTTON} ${state === 'muted' ? 'bg-subtle text-ink' : ''}`}
            >
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onAction({ state: state === 'done' ? 'open' : 'done' })} disabled={off} title={offTitle} aria-pressed={state === 'done'} aria-keyshortcuts="e" className={BUTTON}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {state === 'done' ? 'Done' : 'Mark done'}
            </button>
          </div>
        </div>
      </div>

      <div className="grow overflow-y-auto custom-scrollbar">
        {thread.truncated ? <p className={`px-4 pt-3 ${TYPE.meta}`}>{OLDER_IN_GMAIL}</p> : null}
        {deleted > 0 ? (
          <button type="button" onClick={() => setShowDeleted(true)} className={`ml-1 mt-1 ${QUIET}`}>
            <Figured text={deletedMessages(deleted)} />
          </button>
        ) : null}
        <ol aria-label="Messages" className="divide-y divide-line-subtle">
          {shown.map((message) =>
            message.id === newest.id ? (
              <ThreadMessage key={message.id} message={message} open onEditDraft={writer ? onEditDraft : undefined} />
            ) : (
              <ThreadMessage key={message.id} message={message} open={unfolded.has(message.id)} onToggle={() => toggle(message.id)} onEditDraft={writer ? onEditDraft : undefined} />
            ),
          )}
        </ol>
      </div>

      {writer && onCompose ? (
        (canReply && target) || forwardable ? (
          <div role="group" aria-label={ANSWER_GROUP} className="flex shrink-0 flex-wrap gap-2 border-t border-line-subtle px-4 py-3">
            {canReply && target ? (
              <>
                <button type="button" onClick={() => onCompose('reply', target.id)} aria-keyshortcuts="r" className={BUTTON}>
                  <Reply className="h-4 w-4" aria-hidden="true" />
                  {REPLY}
                </button>
                <button type="button" onClick={() => onCompose('reply_all', target.id)} aria-keyshortcuts="a" className={BUTTON}>
                  <ReplyAll className="h-4 w-4" aria-hidden="true" />
                  {REPLY_ALL}
                </button>
              </>
            ) : null}
            {forwardable ? (
              <button type="button" onClick={() => onCompose('forward', forwardable.id)} aria-keyshortcuts="f" className={BUTTON}>
                <Forward className="h-4 w-4" aria-hidden="true" />
                {FORWARD}
              </button>
            ) : null}
          </div>
        ) : null
      ) : canReply && target ? (
        <ReplyBox
          key={target.id}
          label="Reply"
          placeholder={REPLY_PLACEHOLDER}
          hint={replyHint(thread.account?.name ?? null)}
          sendLabel="Send reply"
          draftSource={{ kind: 'mail_message', id: target.id }}
          onSend={(body) => onReply(target.id, body)}
          sending={replying}
          sent={repliedId === target.id}
          error={replyError}
        />
      ) : null}
    </section>
  );
}
