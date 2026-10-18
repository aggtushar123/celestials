// The person's own mailbox, whole: what the Communications page shows when
// the sidebar source is their mailbox. Folders, filters and categories on
// the left; the Categories block and the conversations, or the open
// conversation, on the right.
//
// Two-way Gmail D2: an action shows at once and reaches Gmail through the
// server's outbox; a refusal puts it back and says why (Decision 3).
// Outlook and IMAP keep their changes in Revenact, as before.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronUp, RefreshCw, Search, SquarePen, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import {
  bulkMailAction,
  clearMailActionError,
  closeCompose,
  createMailLabel,
  discardDrafts,
  fetchMailLabels,
  fetchMailList,
  fetchMailSummary,
  fetchThread,
  loadMoreList,
  MESSAGE_FOLDERS,
  openCompose,
  replyToMailMessage,
  selectThread,
  setMailFolder,
  setMailLabel,
  setMailNotice,
  setChecked,
  setMailPriority,
  setMailSearch,
  setMailUnread,
  toggleChecked,
  toggleMailCategory,
  updateThread,
} from '../../features/mail/mailboxSlice';
import type { MailFolder, MailOp, MailThread, ThreadPatch } from '../../features/mail/mailboxSlice';
import { fetchMailbox, syncMailbox } from '../../features/mail/mailSlice';
import { useMailKeys } from './useMailKeys';
import { MailBulkBar } from './MailBulkBar';
import { leavesView } from '../../features/mail/mailOptimistic';
import { COMPOSE, DRAFT_DISCARDED, mailActionGate, MESSAGE_SENT, SEARCH_GMAIL, SEARCH_MAIL_LABEL, SEARCH_MAIL_PLACEHOLDER, WRITING_REGION } from '../../features/mail/mailText';
import { mailDraftParam } from '../../features/mail/mailDrafts';
import { AgentDraftsList } from '../../components/agents/AgentDraftsList';
import { DRAFTS } from '../../features/agents/draftsText';
import { BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, ICON_BUTTON, NUM, QUIET, RemovableChip, SearchInput, TYPE } from '../../components/ui';
import { useSearchText } from '../../components/organizations/portfolio/useSearchText';
import { CategoriesBlock, MailList } from './MailList';
import { GmailSearchResults } from './GmailSearchResults';
import { MailDetail } from './MailDetail';
import { MailComposer } from './MailComposer';
import { forwardTarget, replyTarget } from './mailWho';
import { MailboxPanel } from './MailboxPanel';
import { MailboxNotice } from './MailboxNotice';
import { useMailboxPolling } from '../../features/mail/useMailboxPolling';
import { CATEGORY_LABEL } from './mailCategories';

const FOLDER_TITLE: Record<MailFolder, string> = {
  inbox: 'Inbox',
  all: 'All mail',
  drafts: 'Drafts',
  sent: 'Sent',
  done: 'Done',
  muted: 'Muted',
  spam: 'Spam',
  trash: 'Trash',
  starred: 'Starred',
  important: 'Important',
};

/** A refusal that means the mailbox changed under the screen: read it again. */
const MAILBOX_CODES = new Set(['MAILBOX_PAUSED', 'TWO_WAY_OFF', 'NO_MAILBOX']);

export function MailboxView({ panelOpen, onTogglePanel }: { panelOpen: boolean; onTogglePanel: () => void }) {
  const dispatch = useAppDispatch();
  const { folder, label, category, unread, priority, q, list, loading, loadingMore, error, summary, selectedId, thread, threadLoading, threadError, labels, checked, bulkBusy, actionError, replying, replyError, repliedId, compose, notice } =
    useAppSelector((state) => state.mailbox);
  const connection = useAppSelector((state) => state.mail?.connection ?? null);
  const disconnected = useAppSelector((state) => state.mail?.disconnected ?? null);
  const mailboxLoaded = useAppSelector((state) => state.mail?.loaded ?? false);
  const syncing = useAppSelector((state) => state.mail?.saving ?? false);
  const syncError = useAppSelector((state) => state.mail?.error ?? null);
  const syncQueued = useAppSelector((state) => state.mail?.syncQueued ?? false);
  const busySync = syncing || syncQueued;
  useMailboxPolling({ whileImporting: false });

  const gate = mailActionGate(connection, disconnected);
  // Who gets the composer (Decision 3): Gmail two-way, paused included.
  const writer = connection?.provider === 'google' && connection.two_way;
  // Search older mail in Gmail (Decision 12): Google only; off, with the reason, while paused.
  const gmailSearch: 'on' | 'paused' | 'off' = connection?.provider === 'google' ? (connection.paused_reason ? 'paused' : 'on') : 'off';
  const [gmailQuery, setGmailQuery] = useState<string | null>(null);
  const commitSearch = useCallback(
    (text: string) => {
      setGmailQuery(null);
      dispatch(setMailSearch(text));
    },
    [dispatch],
  );
  const [searchText, setSearchText] = useSearchText(q ?? '', commitSearch);
  const query = useMemo(() => ({ folder, label, category, unread, priority, q }), [folder, label, category, unread, priority, q]);
  const [params, setParams] = useSearchParams();
  const linked = params.get('message');
  const sectionRef = useRef<HTMLElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    dispatch(fetchMailSummary());
    dispatch(fetchMailList(query));
  }, [dispatch, query]);

  useEffect(() => {
    dispatch(fetchMailList(query));
  }, [dispatch, query]);

  // A queued Google sync (202) lands later: when the wait ends, read again.
  const wasQueued = useRef(false);
  useEffect(() => {
    if (wasQueued.current && !syncQueued) refresh();
    wasQueued.current = syncQueued;
  }, [syncQueued, refresh]);

  useEffect(() => {
    dispatch(fetchMailSummary());
    dispatch(fetchMailLabels());
  }, [dispatch]);

  // Which actions work comes from the connection (Decision 5); the sidebar
  // has usually read it, a deep link may not have.
  useEffect(() => {
    if (!mailboxLoaded) dispatch(fetchMailbox());
  }, [dispatch, mailboxLoaded]);

  useEffect(() => {
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }, [dispatch, selectedId]);

  // The bell's link (Decision 12): ?message=<id> opens that conversation, once.
  useEffect(() => {
    if (linked === null) return;
    const id = Number(linked);
    if (Number.isInteger(id) && id > 0) dispatch(selectThread(id));
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('message');
        return next;
      },
      { replace: true },
    );
  }, [linked, dispatch, setParams]);

  // The failure notice's link: ?folder=drafts&draft=<id> opens that draft in Drafts, once.
  const linkedDraft = mailDraftParam(params);
  useEffect(() => {
    if (linkedDraft === null) return;
    dispatch(setMailFolder('drafts'));
    dispatch(openCompose({ kind: 'draft', draftId: linkedDraft }));
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('draft');
        next.delete('folder');
        return next;
      },
      { replace: true },
    );
  }, [linkedDraft, dispatch, setParams]);

  // A change Gmail refused is put back on the server; when its notice
  // arrives, read the list and the open conversation again (Decision 12).
  const newestFailure = useAppSelector((state) => state.notifications?.items.find((n) => n.kind === 'mail_action_failed')?.id ?? null);
  const seenFailure = useRef(newestFailure);
  useEffect(() => {
    if (newestFailure === seenFailure.current) return;
    seenFailure.current = newestFailure;
    if (newestFailure === null) return;
    refresh();
    dispatch(fetchMailLabels());
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }, [newestFailure, refresh, dispatch, selectedId]);

  /** After an action took: the counts, the labels' unread numbers, and the list when rows moved. */
  function settled(listChanged: boolean) {
    dispatch(fetchMailSummary());
    dispatch(fetchMailLabels());
    if (listChanged) dispatch(fetchMailList(query));
  }

  function refused(code: string | null) {
    if (code === null || !MAILBOX_CODES.has(code)) return;
    dispatch(fetchMailbox());
    dispatch(fetchMailSummary());
  }

  /** The composer closed: a draft may have been saved, so Drafts, the counts and the conversation move. */
  const composeClosed = useCallback(() => {
    dispatch(closeCompose());
    dispatch(fetchMailSummary());
    dispatch(fetchMailList(query));
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }, [dispatch, query, selectedId]);

  const composeSent = useCallback(() => {
    composeClosed();
    dispatch(setMailNotice(MESSAGE_SENT));
    dispatch(fetchMailLabels());
  }, [composeClosed, dispatch]);

  const composeDiscarded = useCallback(() => {
    composeClosed();
    dispatch(setMailNotice(DRAFT_DISCARDED));
  }, [composeClosed, dispatch]);

  async function act(patch: ThreadPatch, id: number | null = selectedId) {
    if (id === null) return;
    const leaving = leavesView(query, patch);
    // Gmail goes back to the list when the conversation leaves the view.
    if (leaving && id === selectedId) dispatch(selectThread(null));
    const result = await dispatch(updateThread({ id, patch }));
    if (updateThread.fulfilled.match(result)) settled(leaving);
    else if (updateThread.rejected.match(result)) refused(result.payload?.code ?? null);
  }

  /** Creates a label and applies it (Decision 13); a refusal comes back as the menu's sentence. */
  async function createLabel(name: string, apply: (id: number) => void): Promise<string | null> {
    const result = await dispatch(createMailLabel(name));
    if (createMailLabel.fulfilled.match(result)) {
      apply(result.payload.id);
      return null;
    }
    const failure = createMailLabel.rejected.match(result) ? result.payload : undefined;
    refused(failure?.code ?? null);
    return failure ? failure.text : null;
  }

  async function bulk(op: MailOp, ids: number[], labelId?: number) {
    if (ids.length === 0) return;
    const result = await dispatch(bulkMailAction({ op, ids, labelId }));
    if (bulkMailAction.fulfilled.match(result)) {
      settled(true);
      if (selectedId !== null && ids.includes(selectedId)) dispatch(fetchThread(selectedId));
    } else if (bulkMailAction.rejected.match(result)) {
      refused(result.payload?.code ?? null);
    }
  }

  /** Delete in Drafts discards only the drafts (Decision 11), also while paused. */
  async function discard(rowIds: number[]) {
    const chosen = rows.filter((row) => rowIds.includes(row.id) && row.draft);
    if (chosen.length === 0) return;
    const draftIds = chosen.flatMap((row) => (row.draft ? [row.draft.id] : []));
    const result = await dispatch(discardDrafts({ rowIds: chosen.map((row) => row.id), draftIds }));
    if (discardDrafts.fulfilled.match(result)) {
      dispatch(setMailNotice(DRAFT_DISCARDED));
      dispatch(fetchMailSummary());
      dispatch(fetchMailList(query));
    } else if (discardDrafts.rejected.match(result)) {
      refused(result.payload?.code ?? null);
    }
  }

  function open(row: MailThread) {
    // A live draft row opens the editor (Decision 11); nothing is marked read.
    // Only where the list is of messages (Drafts, Sent): a conversation row
    // elsewhere whose newest message is a draft opens the conversation, which
    // shows the draft as its own line with Edit draft.
    if (row.draft && writer && MESSAGE_FOLDERS.has(folder)) {
      dispatch(openCompose({ kind: 'draft', draftId: row.draft.id }));
      return;
    }
    dispatch(selectThread(row.id));
    // Opening reads it (contract §10); GET never does. Not while it can't reach Gmail.
    if (row.unread_count > 0 && !gate.blocked) void act({ is_read: true }, row.id);
  }

  async function reply(messageId: number, body: string) {
    const result = await dispatch(replyToMailMessage({ id: messageId, body }));
    // A reply marks the original read and adds to Sent: the counts move.
    if (result.meta.requestStatus !== 'fulfilled') return;
    dispatch(fetchMailSummary());
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }

  async function sync() {
    const result = await dispatch(syncMailbox());
    // Google answers 202 and the tick lands later (the effect above reads
    // again then); Outlook and IMAP synced inline.
    if (!syncMailbox.fulfilled.match(result) || result.payload.queued) return;
    refresh();
  }

  const rows = list?.results ?? [];

  const rowButton = (id: number) => regionRef.current?.querySelector<HTMLButtonElement>(`[data-thread-id="${id}"] button[title]`) ?? null;
  const focusedRow = () => {
    const li = document.activeElement instanceof HTMLElement ? document.activeElement.closest('[data-thread-id]') : null;
    return li ? Number(li.getAttribute('data-thread-id')) : null;
  };

  useMailKeys(sectionRef, (key) => {
    // The composer owns the keyboard (Decision 13).
    if (compose) return;
    const ids = rows.map((row) => row.id);
    if (key === 'compose') {
      if (writer) dispatch(openCompose({ kind: 'new' }));
      return;
    }
    if (key === 'next' || key === 'previous') {
      if (selectedId !== null) {
        // Only from a conversation that is on this page, and never onto itself.
        const current = ids.indexOf(selectedId);
        const to = key === 'next' ? current + 1 : current - 1;
        if (current === -1 || to < 0 || to >= ids.length) return;
        open(rows[to]);
        return;
      }
      const at = ids.indexOf(focusedRow() ?? -1);
      const to = key === 'next' ? at + 1 : Math.max(at - 1, 0);
      if (to >= ids.length) return;
      rowButton(ids[to])?.focus();
      return;
    }
    if (key === 'reply' || key === 'replyAll' || key === 'forward') {
      if (selectedId === null) return;
      if (!writer) {
        if (key === 'reply') regionRef.current?.querySelector('textarea')?.focus();
        return;
      }
      if (!thread || folder === 'trash' || folder === 'spam') return;
      const live = thread.messages.filter((m) => m.folder !== 'trash');
      const answered = key === 'forward' ? forwardTarget(live) : replyTarget(live);
      if (answered) dispatch(openCompose({ kind: key === 'reply' ? 'reply' : key === 'replyAll' ? 'reply_all' : 'forward', messageId: answered.id }));
      return;
    }
    const target = selectedId ?? focusedRow();
    if (target === null) return;
    if (folder === 'drafts' && writer) {
      // # discards only the draft, also while paused; e does nothing here (Decision 11).
      if (key !== 'delete') return;
      const at = ids.indexOf(target);
      const neighbour = ids[at + 1] ?? ids[at - 1];
      void discard([target]);
      if (neighbour !== undefined) window.setTimeout(() => rowButton(neighbour)?.focus(), 0);
      return;
    }
    if (gate.blocked) return;
    if (key === 'delete' && (!gate.gmail || folder === 'trash')) return;
    const at = ids.indexOf(target);
    const neighbour = ids[at + 1] ?? ids[at - 1];
    void act(key === 'archive' ? { state: 'done' } : { trashed: true }, target);
    // The keyboard keeps its place: the row that moved up takes focus.
    if (neighbour !== undefined) window.setTimeout(() => rowButton(neighbour)?.focus(), 0);
  });
  const title = label === null ? FOLDER_TITLE[folder] : (labels.find((l) => l.id === label)?.name ?? FOLDER_TITLE.all);
  const narrowed = folder !== 'inbox' || label !== null || category !== null || unread || priority || Boolean(q);
  const shownOf = list ? (rows.length < list.count ? `${rows.length} of ${list.count}` : `${list.count}`) : '';

  return (
    <section ref={sectionRef} aria-label="Mailbox" className="flex-1 min-w-0 rv-card-glass flex flex-col overflow-hidden">
      <div className={`h-14 shrink-0 flex items-center gap-2 px-3 ${compose ? 'max-sm:hidden' : ''}`}>
        <button type="button" onClick={onTogglePanel} aria-label={panelOpen ? 'Hide folders' : 'Show folders'} aria-expanded={panelOpen} className={`${ICON_BUTTON} border border-line`}>
          <ChevronUp className={`h-4 w-4 transition-transform duration-[var(--dur-fast)] ${panelOpen ? '' : 'rotate-180'}`} aria-hidden="true" />
        </button>
        <h2 className={TYPE.title}>{title}</h2>
        {summary?.address ? <span className={`truncate ${TYPE.meta}`}>{summary.address}</span> : null}
        {category ? <RemovableChip label={CATEGORY_LABEL[category]} onRemove={() => dispatch(toggleMailCategory(category))} /> : null}
        {syncError ? (
          <span role="alert" className="ml-auto truncate text-[11px] leading-4 text-danger-ink">
            {syncError}
          </span>
        ) : null}
        <span className={`${syncError ? '' : 'ml-auto'} ${TYPE.meta} ${NUM}`}>{summary && !narrowed ? `${summary.unread} unread` : shownOf}</span>
        {writer ? (
          <button type="button" onClick={() => dispatch(openCompose({ kind: 'new' }))} aria-label={COMPOSE} title={COMPOSE} aria-keyshortcuts="c" className={ICON_BUTTON}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" onClick={sync} disabled={busySync || Boolean(summary?.paused_reason)} aria-label="Sync now" title={summary?.last_synced_at ? `Last synced ${new Date(summary.last_synced_at).toLocaleString()}` : 'Sync now'} className={ICON_BUTTON}>
          <RefreshCw className={`h-4 w-4 ${busySync ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <MailboxNotice summary={summary} gate={gate} />
      <div className={`shrink-0 px-3 pb-2 ${compose ? 'max-sm:hidden' : ''}`}>
        <SearchInput label={SEARCH_MAIL_LABEL} value={searchText} onChange={setSearchText} placeholder={SEARCH_MAIL_PLACEHOLDER} width="full" />
      </div>
      {actionError ? (
        <div role="alert" className="mx-4 mb-2 flex shrink-0 flex-wrap items-center gap-2 text-[13px] leading-5 text-danger-ink">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{actionError.text}</span>
          {actionError.reconnect ? (
            <Link to="/settings/connections" className={QUIET}>
              Open Connections
            </Link>
          ) : null}
          <button type="button" onClick={() => dispatch(clearMailActionError())} aria-label="Dismiss" className={ICON_BUTTON}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <p role="status" className={`mx-4 shrink-0 ${notice ? 'mb-2' : ''} ${TYPE.meta}`}>
        {notice ?? ''}
      </p>

      <div className="flex-1 min-h-0 flex px-3 pb-3">
        {panelOpen ? (
          <MailboxPanel
            folder={folder}
            category={category}
            unread={unread}
            priority={priority}
            label={label}
            summary={summary}
            labels={labels}
            onFolder={(f) => {
              setGmailQuery(null);
              dispatch(setMailFolder(f));
            }}
            onCategory={(c) => dispatch(toggleMailCategory(c))}
            onUnread={(next) => dispatch(setMailUnread(next))}
            onPriority={(next) => dispatch(setMailPriority(next))}
            onLabel={(id) => {
              setGmailQuery(null);
              dispatch(setMailLabel(id));
            }}
          />
        ) : null}

        <div ref={regionRef} className="flex-1 min-w-0 min-h-0 overflow-y-auto custom-scrollbar pl-0 @container" role="region" aria-label={compose ? WRITING_REGION : selectedId !== null ? 'Reading' : 'Mail'}>
          {compose ? (
            <div className="h-full flex">
              <MailComposer key={JSON.stringify(compose)} target={compose} onClose={composeClosed} onSent={composeSent} onDiscarded={composeDiscarded} />
            </div>
          ) : error ? (
            <UiErrorState message="Could not load your mail" detail={error} onRetry={() => dispatch(fetchMailList(query))} />
          ) : selectedId !== null ? (
            <div className="h-full flex flex-col">
              <button type="button" onClick={() => dispatch(selectThread(null))} className={`-ml-3 self-start ${QUIET}`}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {title}
              </button>
              <div className="flex-1 min-h-0 flex">
                <MailDetail
                  key={selectedId}
                  thread={thread}
                  loading={threadLoading}
                  error={threadError}
                  folder={folder}
                  gate={gate}
                  labels={labels}
                  replying={replying}
                  replyError={replyError}
                  repliedId={repliedId}
                  onRetry={() => dispatch(fetchThread(selectedId))}
                  onAction={(patch) => void act(patch)}
                  onUnmute={() => void bulk('unmute', [selectedId])}
                  onReply={(id, body) => void reply(id, body)}
                  onCreateLabel={(name) => createLabel(name, (id) => void act({ add_labels: [id] }))}
                  writer={writer}
                  onCompose={(kind, messageId) => dispatch(openCompose({ kind, messageId }))}
                  onEditDraft={(draftId) => dispatch(openCompose({ kind: 'draft', draftId }))}
                />
              </div>
            </div>
          ) : gmailQuery !== null ? (
            <GmailSearchResults q={gmailQuery} onOpen={(id) => dispatch(selectThread(id))} onBack={() => setGmailQuery(null)} />
          ) : (
            <>
              {folder === 'inbox' && !unread && !priority ? <CategoriesBlock blocks={summary?.categories ?? []} active={category} onPick={(c) => dispatch(toggleMailCategory(c))} /> : null}
              {folder === 'drafts' ? (
                <>
                  {/* Agents delivery 2: Revenact's own drafts first, then the provider's. */}
                  <AgentDraftsList />
                  <h3 className={`px-4 pt-4 pb-2 ${TYPE.label}`}>{DRAFTS.MAILBOX_TITLE}</h3>
                </>
              ) : null}
              {rows.length > 0 ? (
                <MailBulkBar
                  rows={rows}
                  checked={checked}
                  folder={folder}
                  gate={gate}
                  writer={writer}
                  labels={labels}
                  busy={bulkBusy}
                  onCheck={(ids) => dispatch(setChecked(ids))}
                  onDiscard={() => void discard([...checked])}
                  onBulk={(op, labelId) => void bulk(op, [...checked], labelId)}
                  onCreateLabel={(name) => createLabel(name, (id) => void bulk('label_add', [...checked], id))}
                />
              ) : null}
              <MailList
                checked={checked}
                onToggleCheck={(id) => dispatch(toggleChecked(id))}
                monthLevel={folder === 'drafts' ? 'h4' : 'h3'}
                rows={rows}
                isLoading={loading}
                footer={
                  list?.next ? (
                    <button type="button" onClick={() => dispatch(loadMoreList(list.next as string))} disabled={loadingMore} className={`mt-4 ml-4 ${BUTTON}`}>
                      {loadingMore ? (
                        'Loading…'
                      ) : (
                        <>
                          Load more (<span className={NUM}>{rows.length}</span> of <span className={NUM}>{list.count}</span>)
                        </>
                      )}
                    </button>
                  ) : null
                }
                onSelect={(id) => {
                  const row = rows.find((r) => r.id === id);
                  if (row) open(row);
                }}
                emptyState={
                  folder === 'inbox' && label === null && !category && !unread && !priority ? (
                    summary && !summary.has_mailbox ? (
                      <UiEmptyState title="No mailbox" detail="Connect one from Settings › Connections and your mail appears here." />
                    ) : (
                      <UiEmptyState title="Inbox zero" detail="Nothing between you and the rest of the day." />
                    )
                  ) : (
                    <UiEmptyState title="Nothing here" detail="Nothing in this view." />
                  )
                }
              />
              {q && gmailSearch !== 'off' ? (
                <button
                  type="button"
                  onClick={() => setGmailQuery(q)}
                  disabled={gmailSearch === 'paused'}
                  title={gmailSearch === 'paused' ? (gate.blocked ?? undefined) : undefined}
                  className={`mt-2 ml-1 self-start ${QUIET}`}
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {SEARCH_GMAIL}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
