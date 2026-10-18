// One message of the open conversation (two-way Gmail D2, Decision 6).
// Folded: one line of who, what and when, which unfolds on press.
// Unfolded: who and when, To, Cc and Bcc, the files, then the body (HTML in
// the sandboxed frame, else the text).

import { ChevronUp, Pencil } from 'lucide-react';
import type { MailMessageDetail } from '../../features/mail/mailboxSlice';
import { Badge, BUTTON, FOCUS, ICON_BUTTON, NUM, TYPE } from '../../components/ui';
import { DRAFT_BADGE, EDIT_DRAFT, foldMessageLabel } from '../../features/mail/mailText';
import { dayOf, people, who } from './mailWho';
import { MailAttachments } from './MailAttachments';
import { MailHtmlBody } from './MailHtmlBody';
import { SyncIssueLine } from './MailSyncIssue';

function whenOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const addresses = (list: [string, string][]) => list.map(([, address]) => address).join(', ');

export function ThreadMessage({ message, open, onToggle, onEditDraft }: { message: MailMessageDetail; open: boolean; onToggle?: () => void; onEditDraft?: (draftId: number) => void }) {
  // A live draft (D3): one line, continued in the composer.
  if (message.draft) {
    const draftId = message.draft.id;
    return (
      <li>
        <div className="flex min-h-11 items-center gap-3 px-4 py-2">
          <Badge>{DRAFT_BADGE}</Badge>
          <span className={`min-w-0 flex-1 truncate ${TYPE.bodyMuted}`}>{message.snippet}</span>
          {onEditDraft ? (
            <button type="button" onClick={() => onEditDraft(draftId)} className={BUTTON}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {EDIT_DRAFT}
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  const from = message.direction === 'sent' ? 'You' : who(message);

  if (!open) {
    return (
      <li>
        <button type="button" onClick={onToggle} aria-expanded={false} className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS}`}>
          <span className={`w-28 shrink-0 truncate sm:w-40 ${TYPE.body} ${message.is_read ? '' : 'font-semibold'}`}>{from}</span>
          <span className={`min-w-0 flex-1 truncate ${TYPE.bodyMuted}`}>{message.snippet}</span>
          <span className={`shrink-0 ${TYPE.meta} ${NUM}`}>{dayOf(message.sent_at)}</span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <article aria-label={`${from}, ${whenOf(message.sent_at)}`} className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-start gap-2">
          <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
            <span className="font-semibold text-ink">{from}</span>
            {message.direction === 'received' && message.from_name ? <span>{message.from_address}</span> : null}
            <span className="whitespace-nowrap">
              <span aria-hidden="true">·</span> {whenOf(message.sent_at)}
            </span>
          </div>
          {onToggle ? (
            <button type="button" onClick={onToggle} aria-expanded={true} aria-label={foldMessageLabel(from)} className={ICON_BUTTON}>
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <SyncIssueLine issue={message.sync_issue} />
        {message.to.length > 0 ? (
          <p className={`truncate ${TYPE.meta}`} title={addresses(message.to)}>
            To {people(message.to)}
          </p>
        ) : null}
        {message.cc.length > 0 ? (
          <p className={`truncate ${TYPE.meta}`} title={addresses(message.cc)}>
            Cc {people(message.cc)}
          </p>
        ) : null}
        {message.bcc.length > 0 ? (
          <p className={`truncate ${TYPE.meta}`} title={addresses(message.bcc)}>
            Bcc {people(message.bcc)}
          </p>
        ) : null}
        {message.attachments.length > 0 ? <MailAttachments attachments={message.attachments} /> : null}
        {message.html_body ? (
          <div className="h-[70dvh] min-h-80">
            <MailHtmlBody html={message.html_body} title={message.subject} attachments={message.attachments} />
          </div>
        ) : (
          <p className={`max-w-[68ch] whitespace-pre-line ${TYPE.body}`}>{message.body || message.snippet}</p>
        )}
      </article>
    </li>
  );
}
