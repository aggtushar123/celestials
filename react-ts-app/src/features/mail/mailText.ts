// Every sentence of two-way Gmail, delivery 1 (contract revenact-backend
// docs/superpowers/plans/2026-10-10-gmail-sync-api.md). No React here.
// Where the contract gives a sentence it is copied verbatim.

import { ApiError } from '../../lib/apiClient';
import { formatDate } from '../customers/formatters';
import { formatSize } from '../files/fileFormat';
import type { DraftKind, MailDraft } from './mailDrafts';
import type { DisconnectedMailbox, GmailGate, MailboxConnection, MailImport, PausedReason } from './mailSlice';

/** The pre-OAuth gates (contract §1), shown instead of Connect Google. */
export const GATE_COPY: Record<GmailGate, string> = {
  GMAIL_NOT_ENABLED: "Your workspace isn't enabled for Gmail yet: ask Revenact support.",
  MEMBER_SUSPENDED: "Your access to this workspace is suspended, so Gmail can't be connected.",
  NO_SEAT: 'You need a seat in this workspace to connect Gmail. Ask an admin.',
  NO_VERIFIED_DOMAIN: 'Your workspace has no verified domain yet, so no Google account can connect. An admin can verify one in Settings.',
};

const CALLBACK_COPY: Record<string, string> = {
  ...GATE_COPY,
  SCOPES_MISSING: 'Revenact needs all the Gmail permissions on the consent screen. Connect again and leave them all ticked.',
  ADDRESS_IN_USE: 'This Google account is already connected by someone else in Revenact.',
  GOOGLE_DENIED: "Google didn't grant access. Either you cancelled, or this Google account isn't on Revenact's test-user list yet: ask Revenact support.",
  // Google and Microsoft alike: the callback reached a browser that didn't start it.
  BROWSER_MISMATCH: 'Finish connecting in the same browser you started from. If someone sent you a connect link, start from your own Integrations page instead.',
};

export const REFUSED_FALLBACK = 'Google refused the connection.';
export const WRONG_DOMAIN_FALLBACK = "Connect a Google account on your workspace's verified domain.";

/** The server's WRONG_DOMAIN sentence names up to three verified domains. */
const WRONG_DOMAIN = /^Connect your [a-z0-9.-]+(?:(?:, | or )[a-z0-9.-]+){0,2} account\.$/;

/** `?mailbox=refused&code=&detail=` in this app's words (Decision 6). */
export function refusalCopy(code: string | null, detail: string | null): string {
  if (code === 'WRONG_DOMAIN') return detail && WRONG_DOMAIN.test(detail) ? detail : WRONG_DOMAIN_FALLBACK;
  return code && Object.hasOwn(CALLBACK_COPY, code) ? CALLBACK_COPY[code] : REFUSED_FALLBACK;
}

const PAUSED_COPY: Record<Exclude<PausedReason, 'token_revoked'>, string> = {
  workspace_off: "Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.",
  suspended: 'Sync is paused: your access to this workspace is suspended. Ask an admin.',
  no_seat: 'Sync is paused: you no longer hold a seat in this workspace. Ask an admin.',
};

/** The Connections card's status line; token_revoked has the banner instead. */
export function pausedLine(reason: PausedReason | null): string | null {
  if (!reason || reason === 'token_revoked') return null;
  return PAUSED_COPY[reason];
}

/** The mailbox header's notice, where there is no banner. */
export function pausedNotice(reason: PausedReason): string {
  return reason === 'token_revoked' ? 'Google access was revoked. Reconnect it in Settings › Connections.' : PAUSED_COPY[reason];
}

export const RECONNECT_TWO_WAY = 'Reconnect to turn on two-way';
export const RECONNECT_REVOKED = 'Google access was revoked: reconnect';

/** Contract §2: the banner comes from paused_reason. */
export function reconnectBanner(connection: Pick<MailboxConnection, 'needs_reconnect' | 'paused_reason'>): string | null {
  if (!connection.needs_reconnect) return null;
  return connection.paused_reason === 'token_revoked' ? RECONNECT_REVOKED : RECONNECT_TWO_WAY;
}

const count = (n: number) => n.toLocaleString('en-GB');

/** The import line; "about" because the total is the whole mailbox. */
export function importLine(imp: MailImport | null): string | null {
  if (!imp) return null;
  if (imp.state === 'done') return 'Mail from the last 12 months is imported.';
  if (imp.total_estimate !== null && imp.total_estimate > imp.imported) {
    return `Importing mail: ${count(imp.imported)} of about ${count(imp.total_estimate)}`;
  }
  return `Importing mail: ${count(imp.imported)} so far`;
}

export const twoWayText = (on: boolean) => (on ? 'On' : 'Off: read-only');
export const pushText = (on: boolean) => (on ? 'On: new mail arrives within seconds' : 'Off: checked every minute');

export const DISCONNECT_GOOGLE =
  'Revenact stops syncing and gives up its access to this Google account. Mail already filed on customers stays. Your own copies of this mailbox are deleted after 30 days, unless you reconnect the same account before then.';
export const DISCONNECT_OTHER = 'Revenact stops syncing this mailbox and deletes your own copies of it now. Mail already filed on customers stays.';

export function disconnectedLine(d: DisconnectedMailbox): string {
  return `${d.address} was disconnected on ${formatDate(d.disconnected_at.slice(0, 10))}. Your copies of its mail are kept until ${formatDate(d.delete_after.slice(0, 10))}: reconnect the same account before then to keep them.`;
}

const PAUSED_NEXT: Record<PausedReason, string> = {
  workspace_off: 'Ask Revenact support to turn Gmail back on.',
  suspended: 'Ask an admin.',
  no_seat: 'Ask an admin for a seat.',
  token_revoked: 'Reconnect Google in Settings › Connections.',
};

export const PAUSED_SEND_FALLBACK = 'Your Gmail connection is paused, so nothing was sent.';

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A 409 MAILBOX_PAUSED from a send: the server's sentence and the next
 *  step (Decision 9); null for any other error. */
export function pausedSendMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409 || !isRecord(err.body) || err.body.code !== 'MAILBOX_PAUSED') return null;
  const detail = typeof err.body.detail === 'string' && err.body.detail ? err.body.detail : PAUSED_SEND_FALLBACK;
  const reason = err.body.paused_reason;
  const next = typeof reason === 'string' && Object.hasOwn(PAUSED_NEXT, reason) ? PAUSED_NEXT[reason as PausedReason] : '';
  return next ? `${detail} ${next}` : detail;
}

/** Any send's failure: the paused words, else the server's, else `fallback`. */
export function sendFailure(err: unknown, fallback: string): string {
  return pausedSendMessage(err) ?? (err instanceof ApiError ? err.message : fallback);
}

/** Shown above an HTML message while its remote images are blocked (Decision 2). */
export const IMAGES_HIDDEN = "Images from the internet are hidden, so the sender can't tell you opened this.";

// Two-way Gmail, delivery 2 (contract revenact-backend
// docs/superpowers/plans/2026-10-11-gmail-actions-api.md).

/** Contract §3 check 6, verbatim: shown before anyone tries, as the server would answer. */
export const TWO_WAY_OFF_TEXT = "Reconnect Google to turn on two-way: changes here can't reach Gmail yet.";

/** Contract §3 check 4, verbatim. */
export const NO_MAILBOX_TEXT = "This message's mailbox is no longer connected.";

/** Which mail actions this mailbox offers (contract §10, Decision 5). */
export interface MailActionGate {
  /** Gmail's own actions (delete, restore, spam, labels) are shown. */
  gmail: boolean;
  /** Why every action but Mute and Unmute is off; null when they work. */
  blocked: string | null;
  /** The reason comes with Open Connections. */
  reconnect: boolean;
}

export function mailActionGate(
  connection: Pick<MailboxConnection, 'provider' | 'two_way' | 'paused_reason'> | null,
  disconnected: Pick<DisconnectedMailbox, 'provider'> | null,
): MailActionGate {
  if (!connection) {
    if (!disconnected) return { gmail: false, blocked: null, reconnect: false };
    return { gmail: disconnected.provider === 'google', blocked: NO_MAILBOX_TEXT, reconnect: true };
  }
  if (connection.provider !== 'google') return { gmail: false, blocked: null, reconnect: false };
  if (connection.paused_reason) return { gmail: true, blocked: pausedNotice(connection.paused_reason), reconnect: connection.paused_reason === 'token_revoked' };
  if (!connection.two_way) return { gmail: true, blocked: TWO_WAY_OFF_TEXT, reconnect: true };
  return { gmail: true, blocked: null, reconnect: false };
}

/** Why an action did not take, in the server's words, and whether the way
 *  out is Settings › Connections. `code` lets the screen read the mailbox again. */
export interface ActionFailure {
  text: string;
  reconnect: boolean;
  code: string | null;
}

const RECONNECT_CODES = new Set(['TWO_WAY_OFF', 'NO_MAILBOX']);

export function actionFailure(err: unknown, fallback: string): ActionFailure {
  if (!(err instanceof ApiError)) return { text: fallback, reconnect: false, code: null };
  const body: Record<string, unknown> = isRecord(err.body) ? err.body : {};
  const code = typeof body.code === 'string' ? body.code : null;
  const paused = pausedSendMessage(err);
  if (paused) return { text: paused, reconnect: body.paused_reason === 'token_revoked', code };
  return { text: err.message, reconnect: code !== null && RECONNECT_CODES.has(code), code };
}

/** A label made here, before Gmail has it (contract decision 21). */
export const LABEL_PENDING = 'Not in Gmail yet';

export const LABELS_NONE = 'No labels yet.';
export const LABEL_CREATING = 'Creating…';

/** Over `MAIL_THREAD_MAX_MESSAGES`: the thread payload says `truncated`. */
export const OLDER_IN_GMAIL = 'Older messages in this conversation are only in Gmail.';

export function deletedMessages(n: number): string {
  return n === 1 ? '1 deleted message' : `${count(n)} deleted messages`;
}

/** Contract §6 ATTACHMENT_UNAVAILABLE, verbatim: an attachment chip that cannot be opened (`available: false`). */
export const ATTACHMENT_UNAVAILABLE = "This file hasn't been fetched from Gmail yet, and its mailbox isn't connected.";

/** The PDF viewer's fallback where the browser shows no PDFs inline. */
export const PDF_UNSHOWN = "This browser can't show the PDF here: use Download.";

/** A failed open or download: the server's words (413, 409, 410, 503), else the file's name. */
export function attachmentFailure(err: unknown, name: string): string {
  return err instanceof ApiError ? err.message : `Couldn't open ${name}.`;
}

/** Thrown when an attachment has no `download_url` to fetch. */
export const ATTACHMENT_NO_URL = 'This file is not available.';

// Fallbacks for the mailbox thunks, used only when the server gave no sentence.
export const LIST_FAILED = 'Could not load your mail.';
export const LIST_MORE_FAILED = 'Could not load more mail.';
export const COUNTS_FAILED = 'Could not load your counts.';
export const THREAD_FAILED = 'Could not open the conversation.';
export const UPDATE_FAILED = 'Could not update the conversation.';
export const BULK_FAILED = 'Could not change the selected conversations.';
export const LABELS_FAILED = 'Could not load your labels.';
export const LABEL_CREATE_FAILED = 'Could not create the label.';
export const REPLY_FAILED = 'Could not send the reply.';

// The open conversation (MailDetail, ThreadMessage).
export const CONVERSATION_UNOPENED = 'The conversation could not be opened.';
export const CONVERSATION_OPENING = 'Opening the conversation';
export const CONVERSATION_CHOOSE = 'Choose a conversation to read it.';
export const REPLY_PLACEHOLDER = 'Write your reply.';

/** Under the reply box: where it sends from, and the record it is filed on. */
export function replyHint(accountName: string | null): string {
  return `Sends from your connected mailbox${accountName ? `, filed on ${accountName}` : ''}`;
}

/** The fold button's name on an unfolded older message. */
export const foldMessageLabel = (from: string) => `Fold the message from ${from}`;

/** The bulk bar's names (spec §4, Decision 14). */
export const BULK_TOOLBAR = 'Selected conversations';
export const BULK_SELECT_ALL = 'Select every conversation on this page';
export const BULK_SELECTED = 'selected';

// Two-way Gmail, delivery 3 (contract revenact-backend
// docs/superpowers/plans/2026-10-11-gmail-writing-api.md). Where the
// contract gives a sentence it is copied verbatim.

export const COMPOSE = 'Compose';
export const REPLY = 'Reply';
export const REPLY_ALL = 'Reply all';
export const FORWARD = 'Forward';
export const DRAFT_BADGE = 'Draft';
export const EDIT_DRAFT = 'Edit draft';
export const BACK = 'Back';

const COMPOSE_TITLE: Record<DraftKind, string> = { new: 'New message', reply: 'Reply', reply_all: 'Reply all', forward: 'Forward' };
export const composeTitle = (kind: DraftKind): string => COMPOSE_TITLE[kind];
export const COMPOSE_OPENING = 'Opening the message';

export const FIELD_FROM = 'From';
export const FIELD_TO = 'To';
export const FIELD_CC = 'Cc';
export const FIELD_BCC = 'Bcc';
export const FIELD_SUBJECT = 'Subject';
export const FIELD_MESSAGE = 'Message';
export const ADD_CC = 'Add Cc';
export const ADD_BCC = 'Add Bcc';
export const removeRecipient = (address: string): string => `Remove ${address}`;
export const badAddress = (text: string): string => `Check this address: ${text}`;
/** The chips' list name; the field itself keeps the bare label. */
export const chipsLabel = (field: string): string => `${field} addresses`;

// The editor (Decision 1).
export const FORMATTING = 'Formatting';
export const BOLD = 'Bold';
export const ITALIC = 'Italic';
export const BULLETS = 'Bulleted list';
export const NUMBERS = 'Numbered list';
export const LINK = 'Link';
export const LINK_ADDRESS = 'Link address';
export const ADD_LINK = 'Add link';
export const CANCEL_LINK = 'Cancel';
export const BAD_LINK = 'Use a web or email address.';
export const QUOTE_SHOW = 'Show the quoted message';
export const QUOTE_HIDE = 'Hide the quoted message';
export const QUOTE_TITLE = 'The quoted message';

// Saving (contract §2 gmail.state, §11 DRAFT_CHANGED; Decisions 5 and 6).
export const SAVING = 'Saving…';
export const SAVED_GMAIL = 'Saved to Gmail';
export const SAVED_HERE = 'Saved';
export const NOT_IN_GMAIL_YET = "Not saved to Gmail yet. It's kept here and tries again with your next edit.";
/** Contract §11, verbatim. */
export const CHANGED_IN_GMAIL = 'This draft changed in Gmail.';
export const CHANGED_CHOICE = 'Use the version from Gmail, or keep what you wrote here and save it over that one.';
export const USE_GMAIL = 'Use the Gmail version';
export const KEEP_MINE = 'Keep mine';
export const CLOSE_UNSAVED = "This message isn't saved yet.";
export const CLOSE_ANYWAY = 'Close anyway';

/** The line by the composer's title: where the draft is (Decision 5). */
export function saveLine(draft: Pick<MailDraft, 'gmail' | 'sync_issue'> | null): string {
  if (!draft) return '';
  if (draft.gmail.state === 'failed') return draft.sync_issue?.text ?? NOT_IN_GMAIL_YET;
  if (draft.gmail.state === 'saving') return SAVING;
  return draft.gmail.state === 'saved' ? SAVED_GMAIL : SAVED_HERE;
}

// Attachments (contract §3, decisions 20 and 21; Decision 9).
export const ATTACH = 'Attach files';
export const CHOOSE_FILES = 'Choose files to attach';
export const ATTACHMENTS_LABEL = 'Attachments';
export const FROM_ORIGINAL = 'From the original';
export const removeFile = (name: string): string => `Remove ${name}`;
export const uploadingLabel = (name: string): string => `Uploading ${name}`;
/** Contract §3 DRAFT_TOO_LARGE, verbatim: said before the upload starts. */
export const DRAFT_TOO_LARGE_TEXT = 'Attachments are limited to 25 MB in total.';
// customers.files.validate_upload's sentences, so the pre-check and the server agree.
export const FILE_EMPTY = 'The file is empty.';
export const FILE_TOO_LARGE = 'Files are limited to 25 MB.';
export const typeRefused = (ext: string): string => `${ext || 'that type'} is not an accepted file type.`;
/** The message's size against its limit (contract decision 20: files and
 *  bodies together), shown once there are files. A whole limit reads "25 MB". */
const MB = 1024 * 1024;
export const sizeUsed = (bytes: number, max: number): string => `${formatSize(bytes)} of ${max % MB === 0 ? `${max / MB} MB` : formatSize(max)} used`;

// Where it is filed (contract decision 25; Decision 8).
export const filedOn = (name: string): string => `Filed on ${name}`;
export const NOT_FILED = 'Not filed on a record';
export const RECORD_SUGGESTED = 'Suggested from the recipients';
export const RECORD_PICKER_LABEL = 'File on';
export const CHANGE_RECORD = 'Change';
export const DONT_FILE = "Don't file";
export const CANCEL = 'Cancel';
/** Contract §3, verbatim. */
export const AGENT_RECORD_FIXED = 'An agent draft stays on its record.';

// Sending (contract §4; Decision 10).
export const SEND = 'Send';
export const SENDING = 'Sending…';
export const MESSAGE_SENT = 'Message sent.';
export const DISCARD_DRAFT = 'Discard draft';
export const DRAFT_DISCARDED = 'Draft discarded.';
/** Contract §4 step 4, verbatim: said before anything is saved. */
export const NO_RECIPIENT = 'Add someone to send it to.';

// Fallbacks for the D3 calls, used only when the server gave no sentence.
export const PREFILL_FAILED = 'Could not start this message.';
export const DRAFT_OPEN_FAILED = 'Could not open the draft.';
export const DRAFT_SAVE_FAILED = 'Could not save the draft.';
export const SEND_FAILED = 'Could not send the message.';
export const UPLOAD_FAILED = 'Could not attach the file.';
export const DISCARD_FAILED = 'Could not discard the draft.';

// Search (contract §6, decision 28; Decision 12).
export const SEARCH_MAIL_LABEL = 'Search your mail';
export const SEARCH_MAIL_PLACEHOLDER = 'Search mail';
export const SEARCH_GMAIL = 'Search older mail in Gmail';
export const GMAIL_RESULTS = 'Results from Gmail';
export const GMAIL_SEARCHING = 'Searching Gmail';
export const GMAIL_NONE = 'Gmail found nothing for this search.';
export const GMAIL_MORE = 'More from Gmail';
export const HELD = 'In Revenact';
export const BACK_TO_MAIL = 'Back to your mail';
export const GMAIL_SEARCH_FAILED = 'Could not search Gmail.';
export const GMAIL_OPEN_FAILED = 'Could not open this message.';
export const gmailEstimate = (n: number): string => `About ${count(n)} in Gmail`;

/** The mailbox region's name while the composer is open. */
export const WRITING_REGION = 'Writing';
/** The group of Reply, Reply all and Forward under a conversation. */
export const ANSWER_GROUP = 'Reply or forward';
