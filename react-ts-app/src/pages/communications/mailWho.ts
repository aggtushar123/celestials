// Who a mail row is with: the sender, or for sent mail the people it went to
// (names only; the caller adds "To" where it reads as a heading). D2 adds a
// conversation's people, the message a reply answers, and the short day
// a row and a folded message show.

import type { MailMessage, MailMessageDetail, MailThread } from '../../features/mail/mailboxSlice';

export function who(row: MailMessage): string {
  if (row.direction === 'sent') {
    const names = row.to.map(([name, address]) => name || address).filter(Boolean);
    return names.length ? names.join(', ') : 'nobody';
  }
  return row.from_name || row.from_address;
}

/** A day as "9 Oct": the list's Date column and a folded message. */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Cc or Bcc as names (the address when there is no name). */
export function people(list: [string, string][]): string {
  return list.map(([name, address]) => name || address).join(', ');
}

/** A conversation row's people: its senders (a Sent or Drafts row: its
 *  recipients), with "+N" past the three the server names. */
export function threadWho(row: Pick<MailThread, 'participants' | 'more_participants'>): string {
  const names = row.participants.map((p) => p.name || p.address).filter(Boolean);
  const shown = names.length ? names.join(', ') : 'nobody';
  return row.more_participants > 0 ? `${shown} +${row.more_participants}` : shown;
}

const NO_REPLY_FOLDERS = new Set(['drafts', 'spam', 'trash']);

/** A message not sent yet (D3): a live draft, or anything in Drafts. It is
 *  never answered, forwarded, or read as the conversation's newest message. */
export function isLiveDraft(m: Pick<MailMessageDetail, 'draft' | 'folder'>): boolean {
  return Boolean(m.draft) || m.folder === 'drafts';
}

/** The message a reply answers (Decision 7): the newest one from someone
 *  else, else the newest, replied to its recipients. None from Drafts, Spam
 *  or Trash: a draft has not been sent, spam is not a correspondent. */
export function replyTarget(messages: MailMessageDetail[]): MailMessageDetail | null {
  const open = messages.filter((m) => !isLiveDraft(m) && !NO_REPLY_FOLDERS.has(m.folder));
  const target = open.filter((m) => m.direction === 'received' && m.from_address).at(-1) ?? open.at(-1) ?? null;
  if (!target) return null;
  if (target.direction === 'received') return target.from_address ? target : null;
  return target.to.length > 0 ? target : null;
}

/** The message Forward sends on (D3): the newest that is neither a draft
 *  nor deleted. */
export function forwardTarget(messages: MailMessageDetail[]): MailMessageDetail | null {
  return messages.filter((m) => !isLiveDraft(m) && m.folder !== 'trash').at(-1) ?? null;
}
