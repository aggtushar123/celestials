import { useState } from 'react';
import { MoreHorizontal, Sparkles, Link2, Eye, MessageCircle, X, ChevronDown, Reply, Forward, Star, Paperclip, ExternalLink, Smile } from 'lucide-react';
import type { Email } from '../../../features/customers/customersSlice';
import { UserAvatar } from '../../layout/UserAvatar';

// "2026-03-05T18:20:00Z" -> "Mar 5th 6:20 PM" / "6:20 PM" / "5 Mar 2026" —
// the card's own date, the thread panel's time, and the day-group
// header, all derived from the one real sent_at timestamp rather than
// stored as separate strings (see the Email model's own docstring).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
}

function formatCardDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())} ${formatTime(iso)}`;
}

function formatGroupHeader(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Email Thread Panel ────────────────────────────────────────────────────────

interface ThreadMessage {
  id: number;
  sender: string;
  recipient: string;
  date: string;
  body: string;
}

function buildThread(email: Email): ThreadMessage[] {
  // A synced email (services/mail) is shown as itself: one real message.
  if (email.direction) {
    return [
      {
        id: 2,
        sender: email.sender_name,
        recipient: email.recipient_name,
        date: formatCardDate(email.sent_at),
        body: email.body,
      },
    ];
  }
  // Build a realistic back-and-forth thread from a single Email — the
  // first message is a synthetic kickoff note from the recipient, the
  // second is the real logged email.
  return [
    {
      id: 1,
      sender: email.recipient_name,
      recipient: email.sender_name,
      date: formatTime(email.sent_at),
      body: `Hi ${email.sender_name.split(' ')[0]},\n\nHope you're doing well. I'm excited to help you get started. To begin onboarding, I'd like to walk you through the core setup steps and ensure everything is aligned with your team's goals.\n\nCould we schedule a short call this week to kick things off?\n\nBest regards,\n${email.recipient_name}`,
    },
    {
      id: 2,
      sender: email.sender_name,
      recipient: email.recipient_name,
      date: formatCardDate(email.sent_at),
      body: email.body,
    },
  ];
}

export function EmailThreadPanel({ email, onClose }: { email: Email; onClose: () => void }) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set([1, 2]));
  const thread = buildThread(email);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <>

      {/* Panel */}
      <div
        className="h-full flex flex-col bg-surface"
        onClick={e => e.stopPropagation()}
      >
        {/* Panel Header */}
        <div className="px-5 py-4 border-b border-line-subtle shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-extrabold text-accent">Email Thread</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-subtle text-ink-faint hover:text-ink-muted transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subject line + link count */}
          <div className="flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold text-ink truncate flex-1 pr-3" title={email.subject}>
              {email.subject}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {email.links > 0 && (
                <span className="flex items-center gap-1 text-[11.5px] font-bold text-accent bg-transparent px-1 cursor-pointer">
                  {email.links} Links
                  <ChevronDown className="w-3.5 h-3.5 text-accent" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Thread messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {thread.map((msg, idx) => {
            const isExpanded = expandedIds.has(msg.id);
            const isLast = idx === thread.length - 1;

            return (
              <div key={msg.id} className={`border-b border-line-subtle ${isLast ? 'border-b-0' : ''}`}>
                {/* Message header — always visible */}
                <div
                  className="px-5 pt-4 pb-1 flex items-start justify-between cursor-pointer transition-colors"
                  onClick={() => toggleExpand(msg.id)}
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar name={msg.sender} className="w-8 h-8 rounded-full border border-line-subtle object-cover shrink-0" />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-ink">{msg.sender}</span>
                        <ChevronDown className={`w-3 h-3 text-ink-faint transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                      </div>
                      <span className="text-[11.5px] text-ink-faint">{msg.recipient}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11.5px] font-medium text-ink-faint whitespace-nowrap">{msg.date}</span>
                    <button
                      onClick={e => e.stopPropagation()}
                      className="p-0.5 rounded opacity-60 hover:opacity-100 text-ink-faint hover:text-ink-muted transition-opacity"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Message body — collapsible */}
                {isExpanded && (
                  <div className="px-5 pb-5">
                    {/* Emoji reaction row */}
                    <div className="flex justify-end mb-2">
                       <div className="w-6 h-6 rounded-full border border-success/40 bg-success-dim flex items-center justify-center text-success cursor-pointer">
                         <Smile className="w-3.5 h-3.5" />
                       </div>
                    </div>

                    {/* Body text */}
                    <div className="text-[12.5px] text-ink-muted leading-[1.6] whitespace-pre-line pl-11">
                      {msg.body}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-5 pl-11">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-subtle hover:bg-accent-dim border border-line hover:border-accent/40 rounded-lg text-[12px] font-semibold text-ink-muted hover:text-accent transition-all">
                        <Reply className="w-3.5 h-3.5" />
                        Reply
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-subtle hover:bg-subtle border border-line rounded-lg text-[12px] font-semibold text-ink-muted transition-all">
                        <Forward className="w-3.5 h-3.5" />
                        Forward
                      </button>
                    </div>
                  </div>
                )}

                {/* Collapsed preview */}
                {!isExpanded && (
                  <div className="px-5 pb-3 pl-16">
                    <p className="text-[12px] text-ink-faint truncate">{msg.body.split('\n')[0]}</p>
                  </div>
                )}

                {/* If there's another message in the thread, render the connecting line and circle */}
                {idx < thread.length - 1 && (
                  <div className="relative flex items-center py-4">
                     {/* Horizontal line extending through the circle */}
                     <div className="absolute left-6 right-6 h-px bg-subtle"></div>
                     <div className="relative left-[22px] w-8 h-8 bg-surface border border-line shadow-sm rounded-full flex items-center justify-center text-[12px] font-bold text-ink-muted z-10">
                        1
                     </div>
                  </div>
                )}
              </div>
            );
          })}


        </div>

        {/* Quick Reply Composer */}
        <div className="border-t border-line-subtle p-3 shrink-0 bg-subtle/30">
          <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden flex flex-col">
            <div className="px-3 py-1.5 border-b border-line-subtle flex items-center gap-2">
              <span className="text-[11px] font-bold text-ink-faint uppercase tracking-wider">Reply to</span>
              <span className="text-[12px] font-semibold text-ink-muted">{email.sender_name}</span>
            </div>
            <textarea
              placeholder="Write a reply..."
              rows={1}
              className="w-full px-3 py-2 text-[13px] text-ink-muted placeholder:text-ink-faint resize-none focus:outline-none bg-transparent min-h-[36px]"
            />
            <div className="px-3 py-1.5 border-t border-line-subtle flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button className="p-1 rounded-lg text-ink-faint hover:text-ink-muted hover:bg-subtle transition-all">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <button className="p-1 rounded-lg text-ink-faint hover:text-ink-muted hover:bg-subtle transition-all">
                  <Star className="w-3.5 h-3.5" />
                </button>
                <button className="p-1 rounded-lg text-ink-faint hover:text-ink-muted hover:bg-subtle transition-all">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
              <button className="px-3 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-[11px] font-bold transition-all shadow-sm active:scale-95">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── EmailsTab ─────────────────────────────────────────────────────────────────

export interface EmailsTabProps {
  emails: Email[];
  isLoading: boolean;
  error: string | null;
  selectedEmail?: Email | null;
  onSelectEmail?: (email: Email | null) => void;
  /** Opens the compose form; absent when this record cannot be emailed (mock data). */
  onCompose?: () => void;
}

export function EmailsTab({ emails, isLoading, error, selectedEmail, onSelectEmail, onCompose }: EmailsTabProps) {
  const [localSelected, setLocalSelected] = useState<Email | null>(null);
  const currentSelectedEmail = selectedEmail !== undefined ? selectedEmail : localSelected;
  const handleSelectEmail = onSelectEmail || setLocalSelected;

  // Group by calendar day (derived from sent_at, not a separate stored
  // field — see formatGroupHeader above).
  const grouped = emails.reduce<Record<string, Email[]>>((acc, email) => {
    const day = email.sent_at.slice(0, 10);
    if (!acc[day]) acc[day] = [];
    acc[day].push(email);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  const composeBar = onCompose ? (
    <div className="px-6 py-2 border-b border-line-subtle flex items-center justify-between gap-3 bg-surface">
      <span className="text-[11.5px] text-ink-faint">You see your own and your team's emails on this record.</span>
      <button type="button" onClick={onCompose} className="px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold">
        Compose
      </button>
    </div>
  ) : null;
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16 opacity-40">
        <span className="text-sm font-semibold text-ink-faint">Loading emails…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16">
        <span className="text-sm font-semibold text-danger">{error}</span>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col flex-1">
        {composeBar}
        <div className="flex flex-col items-center justify-center flex-1 py-16 opacity-40">
          <MessageCircle className="w-10 h-10 text-ink-faint mb-2" />
          <span className="text-sm font-semibold text-ink-faint">No emails found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
      {composeBar}
      {sortedGroups.map(([day, items]) => (
        <div key={day} className="flex flex-col">
          <div className="px-6 py-2 bg-subtle/80 border-b border-line-subtle sticky top-0 z-10">
            <span className="text-[11px] font-bold text-ink-faint uppercase tracking-wider">{formatGroupHeader(items[0].sent_at)}</span>
          </div>
          {items.map(email => (
            <EmailCard
              key={email.id}
              email={email}
              isSelected={currentSelectedEmail?.id === email.id}
              onClick={() => handleSelectEmail(currentSelectedEmail?.id === email.id ? null : email)}
            />
          ))}
        </div>
      ))}

    </div>
  );
}

// ── EmailCard ─────────────────────────────────────────────────────────────────

function EmailCard({
  email,
  isSelected,
  onClick,
}: {
  email: Email;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-6 py-4 border-b border-line-subtle cursor-pointer group transition-all ${
        isSelected
          ? 'bg-accent-dim/60 border-l-2 border-l-accent'
          : 'hover:bg-accent-dim/20 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className={`text-[14px] font-semibold leading-snug flex-1 pr-4 transition-colors ${
          isSelected ? 'text-accent' : 'text-ink group-hover:text-accent'
        }`}>
          {email.subject}
        </h4>
        <div className="flex items-center gap-2 shrink-0">
          {email.is_starred && (
            <Sparkles className="w-3.5 h-3.5 text-warning" />
          )}
          <span className="text-[11.5px] font-medium text-ink-faint whitespace-nowrap">{formatCardDate(email.sent_at)}</span>
          <button
            onClick={e => e.stopPropagation()}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-ink-faint hover:text-ink-muted"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <UserAvatar name={email.sender_name} className="w-6 h-6 rounded-full border border-line-subtle object-cover" />
        <div className="flex items-center gap-1.5">
          {email.direction && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                email.direction === 'sent' ? 'bg-accent-dim text-accent' : 'bg-info-dim text-info'
              }`}
            >
              {email.direction}
            </span>
          )}
          <span className="text-[12.5px] font-semibold text-ink-muted">{email.sender_name}</span>
          <span className="text-[11px] text-ink-faint">▸</span>
          <span className="text-[12px] text-ink-faint italic">{email.recipient_name}</span>
        </div>
      </div>
      <p className="text-[12.5px] text-ink-muted leading-relaxed mb-3 pl-8 line-clamp-2">{email.body}</p>
      <div className="flex items-center gap-4 pl-8">
        {email.watchers > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-faint">
            <Eye className="w-3 h-3" />
            <span>{email.watchers}</span>
          </div>
        )}
        {email.links > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-accent">
            <Link2 className="w-3 h-3" />
            <span>{email.links} Links</span>
          </div>
        )}
      </div>
    </div>
  );
}
