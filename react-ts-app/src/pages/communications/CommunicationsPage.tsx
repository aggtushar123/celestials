// Communications, arranged as an inbox.
//
//   [ inbox: folders + filters | grouped list or the open item ] [ Copilot rail ]
//
// The sources (the mailbox, each connector, calls) live in the main sidebar's
// Communications group and arrive here as ?source=.
//
// It sits under the shared top bar (UI foundations spec §6.1): the page
// titles itself, and the Copilot controls (new chat, history, the switch
// that hides the Copilot) portal into the bar's actions slot from lg.
// Search and Compose left the bar: the open conversation has its own
// composer, and the search box lives on as
// `components/shared/ConversationSearch` for whoever needs it next.
//
// On the person's own mailbox source the card is MailboxView instead: their
// mail whole, in the provider's folders, with this product's triage on top.
//
// Everything in the list is real: the four kinds of waiting the backend
// computes (questions for you, replies owed, open tickets, calls to wrap up),
// the counts beside the folders, the two filters (the queue versus everything;
// mine versus my team). The Copilot in the rail is the same Copilot, with the source you picked as its
// context.
// With ?draft=<id> (an agent's reply draft: from Activity, the bell, a queue
// row or the mailbox's Drafts) the card is the draft instead; the rail stays
// (Agents delivery 2, Decision 1).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronUp, Info } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import {
  fetchCommunications,
  fetchCommunicationsStats,
  replyToEmail,
  selectRow,
  setMode,
  setScope,
  setSearch,
  toggleKind,
} from '../../features/communications/communicationsSlice';
import type { CommunicationKind } from '../../features/communications/communicationsSlice';
import type { Conversation } from '../copilot/types';
import { DetailPane } from './DetailPane';
import { InboxList } from './InboxList';
import { InboxPanel } from './InboxPanel';
import { MailboxView } from './MailboxView';
import { sourcesFrom } from './sources';
import { CopilotRail } from '../../components/copilot/CopilotRail';
import type { RailContext } from '../../components/copilot/railContext';
import { ScheduledCard } from '../../components/work/ScheduledCard';
import { DraftRoute } from '../../components/agents/DraftPanel';
import { draftParam } from '../../features/agents/draftsText';
import { mailDraftParam } from '../../features/mail/mailDrafts';
import { LG, SM, useMediaQuery } from '../../lib/useMediaQuery';
import { EmptyState as UiEmptyState, ErrorState as UiErrorState, ICON_BUTTON, NUM, PageHeader, QUIET, RemovableChip, TYPE } from '../../components/ui';
import { AskControls } from '../dashboard/ask/AskControls';

const COPILOT_KEY = 'revenact_comms_copilot';

function readCopilotPreference(): boolean {
  try {
    return localStorage.getItem(COPILOT_KEY) !== 'off';
  } catch {
    return true;
  }
}

export default function CommunicationsPage() {
  const dispatch = useAppDispatch();
  const { page, isLoading, error, stats, scope, mode, kind, search, selectedId, replying, replyError, repliedId } = useAppSelector((state) => state.communications);
  const mailbox = useAppSelector((state) => state.mail?.connection ?? null);
  const connectors = useAppSelector((state) => state.connectors?.items ?? []);

  // The source comes from the sidebar's group as ?source=; the page never
  // owns it, so the sidebar and the inbox can never disagree.
  const [params, setParams] = useSearchParams();
  const source = params.get('source') ?? 'all';
  // The folders start folded on a phone (fix 8), so the queue gets the
  // width; the chevron still opens them. No matchMedia (jsdom) reads as wide.
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia(SM).matches,
  );
  const [copilotOpen, setCopilotOpen] = useState(readCopilotPreference);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [contextCleared, setContextCleared] = useState(false);
  const wide = useMediaQuery(LG);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // The person's own mailbox is a different page inside the same card: their
  // mail whole, not the queue narrowed to email. Keyed on the URL, not on the
  // resolved source, so it never flashes the queue while the connection loads.
  const mailboxSource = source.startsWith('mailbox:');
  // A draft takes the card whatever the source, so its link works from
  // anywhere; a mailbox draft link (Drafts on a mailbox source, D3 Decision
  // 14) is the mailbox's to open.
  const draftOpen = draftParam(params) !== null && mailDraftParam(params) === null;

  useEffect(() => {
    if (mailboxSource) return;
    dispatch(fetchCommunications({ scope, mode, kind, search }));
  }, [dispatch, scope, mode, kind, search, mailboxSource]);

  useEffect(() => {
    if (mailboxSource) return;
    dispatch(fetchCommunicationsStats(scope));
  }, [dispatch, scope, mailboxSource]);

  useEffect(() => {
    try {
      localStorage.setItem(COPILOT_KEY, copilotOpen ? 'on' : 'off');
    } catch {
      /* a private window forgets; the default is on */
    }
  }, [copilotOpen]);

  const sources = useMemo(() => sourcesFrom(mailbox, connectors), [mailbox, connectors]);
  const activeSource = sources.find((s) => s.id === source) ?? sources[0];

  const rows = useMemo(() => page?.results ?? [], [page]);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  // A source maps to a kind; arriving on one narrows the folder to match.
  useEffect(() => {
    setContextCleared(false);
    if (!activeSource || activeSource.id === 'all' || mailboxSource) return;
    if (activeSource.kind !== kind) dispatch(toggleKind(activeSource.kind ?? (kind as CommunicationKind)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the source changes, not when the folder does
  }, [source, sources.length]);

  function chooseFolder(next: CommunicationKind | null) {
    if (next === kind) return;
    if (next === null) dispatch(toggleKind(kind as CommunicationKind));
    else dispatch(toggleKind(next));
    if (source !== 'all') setParams({});
  }

  const context: RailContext | null =
    activeSource && activeSource.id !== 'all' && !contextCleared
      ? { kind: 'label', label: activeSource.label, icon: <span className="w-3.5 h-3.5 inline-flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">{activeSource.icon}</span> }
      : null;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <PageHeader title="Communications" />
      {/* The Copilot controls drive a rail that shows from lg only (UI
          broken-things fix 8), so they join the bar from lg too. */}
      {wide ? (
        <AskControls
          open={copilotOpen}
          historyOpen={historyOpen}
          onNewChat={() => {
            setConversation(null);
            setCopilotOpen(true);
          }}
          onToggleHistory={() => setHistoryOpen((o) => !o)}
          onCloseHistory={() => setHistoryOpen(false)}
          onOpenConversation={(c) => {
            setConversation(c);
            setCopilotOpen(true);
          }}
          onToggle={() => setCopilotOpen((o) => !o)}
          toggleRef={toggleRef}
        />
      ) : null}

      <div className="flex-1 min-h-0 flex gap-3 px-4 pb-4">
        {/* Inbox */}
        {draftOpen ? (
          <DraftRoute
            onChanged={() => {
              // A sent reply is no longer owed: the queue and its counts read again.
              if (mailboxSource) return;
              dispatch(fetchCommunications({ scope, mode, kind, search }));
              dispatch(fetchCommunicationsStats(scope));
            }}
          />
        ) : mailboxSource ? (
          <MailboxView panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((o) => !o)} />
        ) : (
          <section aria-label="Inbox" className="flex-1 min-w-0 rv-card-glass flex flex-col overflow-hidden">
          <div className="h-14 shrink-0 flex items-center gap-2 px-3">
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              aria-label={panelOpen ? 'Hide folders' : 'Show folders'}
              aria-expanded={panelOpen}
              className={`${ICON_BUTTON} border border-line`}
            >
              <ChevronUp className={`h-4 w-4 transition-transform duration-[var(--dur-fast)] ${panelOpen ? '' : 'rotate-180'}`} aria-hidden="true" />
            </button>
            <h2 className={TYPE.title}>Inbox</h2>
            {mode === 'needs' ? <RemovableChip label="Needs you" onRemove={() => dispatch(setMode('everything'))} /> : null}
            {/* A term set elsewhere (the slice outlives the page) stays
                visible here so it can be cleared. */}
            {search.trim() ? <RemovableChip label={`“${search}”`} onRemove={() => dispatch(setSearch(''))} /> : null}
            <span className={`ml-auto ${TYPE.meta} ${NUM}`}>
              {page ? (page.truncated && stats ? `${rows.length} shown of ${stats.total} waiting` : `${rows.length} of ${page.count}`) : ''}
            </span>
          </div>

          <div className="flex-1 min-h-0 flex px-3 pb-3">
            {panelOpen ? (
              <InboxPanel
                kind={kind}
                stats={stats}
                needsOnly={mode === 'needs'}
                mineOnly={scope === 'mine'}
                hasMailbox={stats?.has_mailbox ?? true}
                onKind={chooseFolder}
                onNeedsOnly={(next) => dispatch(setMode(next ? 'needs' : 'everything'))}
                onMineOnly={(next) => dispatch(setScope(next ? 'mine' : 'team'))}
              />
            ) : null}

            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto custom-scrollbar pl-0 @container" role="region" aria-label={selected ? 'Conversation' : 'Queue'}>
              {error ? (
                <UiErrorState
                  message="Could not load your inbox"
                  detail={`${error} Nothing is shown rather than part of it, so you do not act on half a picture.`}
                  onRetry={() => dispatch(fetchCommunications({ scope, mode, kind, search }))}
                />
              ) : selected ? (
                <div className="h-full flex flex-col">
                  <button type="button" onClick={() => dispatch(selectRow(''))} className={`-ml-3 self-start ${QUIET}`}>
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Inbox
                  </button>
                  <div className="flex-1 min-h-0 flex">
                    <DetailPane
                      row={selected}
                      onReply={(body) =>
                        dispatch(replyToEmail({ rowId: selected.id, body })).then((result) => {
                          // A sent reply is no longer owed: the counts move now, the row leaves on the next fetch.
                          if (result.meta.requestStatus === 'fulfilled') dispatch(fetchCommunicationsStats(scope));
                        })
                      }
                      replying={replying}
                      replied={repliedId === selected.id}
                      replyError={replyError}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {page?.truncated ? (
                    <p className={`mb-1 flex items-center gap-2 px-4 py-2 ${TYPE.bodyMuted}`}>
                      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                      More than we show is outstanding in one of these. Clear some, or narrow the inbox.
                    </p>
                  ) : null}
                  <InboxList
                    rows={rows}
                    selectedId={null}
                    isLoading={isLoading}
                    onSelect={(id) => dispatch(selectRow(id))}
                    emptyState={
                      search.trim() ? (
                        <UiEmptyState title={`No match for “${search}”`} detail="Try an account name, or search everything instead of the queue." />
                      ) : mode === 'needs' ? (
                        <UiEmptyState title="Inbox zero" detail="Nothing between you and the rest of the day." />
                      ) : (
                        <UiEmptyState title="Nothing here" detail="No conversations across the accounts you can see." />
                      )
                    }
                  />
                </>
              )}
            </div>
          </div>
          </section>
        )}

        {copilotOpen ? (
          // The inbox (and a draft) needs a phone's whole width: the rail steps
          // aside below lg, always, and returns on desktop (fix 8: it used to
          // only when a draft was open, squeezing the inbox to 10px).
          <CopilotRail className="hidden lg:flex w-[320px]" top={<ScheduledCard onWork={false} />} context={context} onClearContext={() => setContextCleared(true)} conversation={conversation} onConversation={setConversation} />
        ) : null}
      </div>

    </div>
  );
}
