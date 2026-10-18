import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailDetail } from './MailDetail';
import { GOOGLE, MAIL_DETAIL, MAIL_DRAFT_MESSAGE, MAIL_EARLIER, MAIL_LABELS, OUTLOOK, stubMail, threadOf } from '../../features/mail/testMail';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import type { MailFolder, MailMessageDetail } from '../../features/mail/mailboxSlice';
import { mailActionGate, OLDER_IN_GMAIL, TWO_WAY_OFF_TEXT, type MailActionGate } from '../../features/mail/mailText';

// Unit tier: the open conversation alone (D2 contract §2), handlers mocked.

const LIVE = mailActionGate(GOOGLE, null);

function renderThread(messages: MailMessageDetail[], { folder = 'inbox' as MailFolder, gate = LIVE as MailActionGate, truncated = false } = {}) {
  const handlers = { onAction: vi.fn(), onUnmute: vi.fn(), onReply: vi.fn(), onRetry: vi.fn(), onCreateLabel: vi.fn(async (): Promise<string | null> => null) };
  render(
    <MemoryRouter>
      <MailDetail thread={{ ...threadOf(messages), truncated }} loading={false} error={null} folder={folder} gate={gate} labels={MAIL_LABELS} replying={false} replyError={null} repliedId={null} {...handlers} />
    </MemoryRouter>,
  );
  return { pane: screen.getByRole('region', { name: 'Conversation' }), ...handlers };
}

describe('MailDetail: the open conversation (two-way Gmail D2)', () => {
  beforeEach(() => {
    stubMail();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    forgetInlineImages();
  });

  it('a customer conversation says it is private, and offers Add to Revenact', () => {
    const { pane } = renderThread([{ ...MAIL_DETAIL, shared: false }]);
    expect(within(pane).getByText('Only you can read this.')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Add to Revenact' })).toBeInTheDocument();
  });

  it('a shared conversation says so, and offers Remove', () => {
    const { pane } = renderThread([{ ...MAIL_DETAIL, shared: true }]);
    expect(within(pane).getByText(/Shared on Pizza Hut/)).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Remove from Revenact' })).toBeInTheDocument();
  });

  it('no share control for mail on no customer', () => {
    const { pane } = renderThread([{ ...MAIL_DETAIL, account: null, shared: false }]);
    expect(within(pane).queryByRole('button', { name: 'Add to Revenact' })).toBeNull();
  });

  it('names its keyboard shortcuts', () => {
    const { pane } = renderThread([MAIL_DETAIL]);
    expect(within(pane).getByRole('button', { name: 'Mark done' })).toHaveAttribute('aria-keyshortcuts', 'e');
    expect(within(pane).getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-keyshortcuts', '#');
  });

  it('folds the older message and opens the newest, with its Cc, the labels and its files', async () => {
    const { pane } = renderThread([MAIL_EARLIER, MAIL_DETAIL]);
    expect(within(pane).getByRole('heading', { level: 2, name: 'Renewal quote' })).toBeInTheDocument();
    const folded = within(pane).getByRole('button', { name: /You.*Could you send the renewal quote\?/ });
    expect(folded).toHaveAttribute('aria-expanded', 'false');
    const newest = within(pane).getByRole('article', { name: /^Ann Lee, / });
    expect(within(newest).getByText('Cc Sam Pizza')).toHaveAttribute('title', 'sam@pizzahut.com');
    expect(within(pane).getAllByRole('group', { name: 'Labels: Q4, Renewals, Vendors/Billing' }).length).toBeGreaterThan(0);
    expect(within(newest).getByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    expect(within(newest).queryByText('logo.png')).toBeNull();
    await userEvent.click(folded);
    expect(within(pane).getByRole('article', { name: /^You, / })).toHaveTextContent('Could you send the renewal quote?');
  });

  it('keeps a deleted message behind a line outside Trash, and shows it in Trash', async () => {
    const trashed = { ...MAIL_EARLIER, folder: 'trash' as const };
    const { pane } = renderThread([trashed, MAIL_DETAIL]);
    expect(within(pane).queryByRole('button', { name: /Could you send/ })).toBeNull();
    await userEvent.click(within(pane).getByRole('button', { name: '1 deleted message' }));
    expect(within(pane).getByRole('button', { name: /Could you send/ })).toBeInTheDocument();
  });

  it('says when the oldest messages are only in Gmail', () => {
    const { pane } = renderThread([MAIL_DETAIL], { truncated: true });
    expect(within(pane).getByText(OLDER_IN_GMAIL)).toBeInTheDocument();
  });

  it('stars, marks unread and marks done the conversation, and unmutes through its own route', async () => {
    const { pane, onAction, onUnmute } = renderThread([{ ...MAIL_DETAIL, state: 'muted' }]);
    await userEvent.click(within(pane).getByRole('button', { name: 'Star' }));
    expect(onAction).toHaveBeenLastCalledWith({ is_starred: true });
    await userEvent.click(within(pane).getByRole('button', { name: 'Mark unread' }));
    expect(onAction).toHaveBeenLastCalledWith({ is_read: false });
    await userEvent.click(within(pane).getByRole('button', { name: 'Mark done' }));
    expect(onAction).toHaveBeenLastCalledWith({ state: 'done' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Unmute' }));
    expect(onUnmute).toHaveBeenCalledOnce();
  });

  it('turns every action but Mute off while two-way is off, and says why', () => {
    const { pane } = renderThread([MAIL_DETAIL], { gate: mailActionGate({ ...GOOGLE, two_way: false }, null) });
    for (const name of ['Star', 'Mark unread', 'Mark done']) {
      const button = within(pane).getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', TWO_WAY_OFF_TEXT);
    }
    expect(within(pane).getByRole('button', { name: 'Mute' })).toBeEnabled();
  });

  it('replies to the newest message from the other side, and never from Trash', async () => {
    const later = { ...MAIL_EARLIER, sent_at: '2026-10-09T10:00:00Z' };
    const { pane, onReply } = renderThread([MAIL_DETAIL, later]);
    expect(within(pane).getByText(/filed on Pizza Hut/)).toBeInTheDocument();
    await userEvent.type(within(pane).getByLabelText('Reply'), 'Thanks, Ann.');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send reply' }));
    expect(onReply).toHaveBeenCalledWith(1, 'Thanks, Ann.');
  });

  it('keeps the toolbar on the newest live message once the deleted line is opened', async () => {
    const live = { ...MAIL_DETAIL, state: 'done' as const };
    const trashed = { ...MAIL_DETAIL, id: 5, sent_at: '2026-10-09T11:00:00Z', folder: 'trash' as const, state: 'open' as const };
    const { pane, onAction } = renderThread([live, trashed]);
    await userEvent.click(within(pane).getByRole('button', { name: '1 deleted message' }));
    const done = within(pane).getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(done);
    expect(onAction).toHaveBeenLastCalledWith({ state: 'open' });
  });

  it('keeps the toolbar and the category on the newest real message, never on a live draft after it', async () => {
    const real = { ...MAIL_DETAIL, state: 'done' as const, category: 'financial' as const };
    const draft = { ...MAIL_DRAFT_MESSAGE, state: 'open' as const, category: 'general' as const };
    const { pane, onAction } = renderThread([real, draft]);
    const done = within(pane).getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    expect(within(pane).getByText('Financial')).toBeInTheDocument();
    expect(within(pane).queryByText('General')).not.toBeInTheDocument();
    await userEvent.click(done);
    expect(onAction).toHaveBeenLastCalledWith({ state: 'open' });
  });

  it('never replies to a message in Trash, even once the deleted line is opened', async () => {
    const trashed = { ...MAIL_DETAIL, id: 5, snippet: 'Ignore my last.', body: 'Ignore my last.', html_body: '', attachments: [], sent_at: '2026-10-09T11:00:00Z', folder: 'trash' as const };
    const { pane, onReply } = renderThread([MAIL_DETAIL, trashed]);
    await userEvent.click(within(pane).getByRole('button', { name: '1 deleted message' }));
    // The trashed message is the newest from the other side, and is on screen.
    expect(within(pane).getByRole('article', { name: /^Ann Lee, / })).toHaveTextContent('Ignore my last.');
    await userEvent.type(within(pane).getByLabelText('Reply'), 'Thanks, Ann.');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send reply' }));
    expect(onReply).toHaveBeenCalledWith(1, 'Thanks, Ann.');
  });

  it('offers no reply in Trash', () => {
    const { pane } = renderThread([MAIL_DETAIL], { folder: 'trash' });
    expect(within(pane).queryByLabelText('Reply')).toBeNull();
  });

  it('shows the text body when there is no HTML', () => {
    const { pane } = renderThread([{ ...MAIL_DETAIL, html_body: '' }]);
    expect(within(pane).queryByTitle('Message: Renewal quote')).toBeNull();
    expect(within(pane).getByText(/Quote attached\.\s+Ann/)).toBeInTheDocument();
  });
  it("offers Gmail's own actions: Delete, Labels and Report spam; Restore in Trash, Not spam in Spam", async () => {
    const { pane, onAction } = renderThread([MAIL_DETAIL]);
    await userEvent.click(within(pane).getByRole('button', { name: 'Delete' }));
    expect(onAction).toHaveBeenLastCalledWith({ trashed: true });
    expect(within(pane).getByRole('button', { name: 'Labels' })).toBeEnabled();
    await userEvent.click(within(pane).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report spam' }));
    expect(onAction).toHaveBeenLastCalledWith({ spam: true });
  });

  it('restores from Trash and unmarks spam from Spam', async () => {
    const trash = renderThread([{ ...MAIL_DETAIL, folder: 'trash' }], { folder: 'trash' });
    await userEvent.click(within(trash.pane).getByRole('button', { name: 'Restore' }));
    expect(trash.onAction).toHaveBeenLastCalledWith({ trashed: false });
    cleanup();
    const spam = renderThread([{ ...MAIL_DETAIL, folder: 'spam' }], { folder: 'spam' });
    await userEvent.click(within(spam.pane).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not spam' }));
    expect(spam.onAction).toHaveBeenLastCalledWith({ spam: false });
  });

  it("shows none of Gmail's own actions for Outlook", () => {
    const { pane } = renderThread([MAIL_DETAIL], { gate: mailActionGate(OUTLOOK, null) });
    expect(within(pane).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'Labels' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(within(pane).getByRole('button', { name: 'Mark done' })).toBeEnabled();
  });

  it('shows a change that did not reach Gmail, quietly, on its message', () => {
    const issue = { text: "Couldn't archive in Gmail: the message no longer exists.", at: '2026-10-11T08:50:02Z' };
    const { pane } = renderThread([{ ...MAIL_DETAIL, sync_issue: issue }]);
    const line = within(pane).getByText(issue.text);
    expect(line).toHaveClass('text-ink-muted');
    expect(line.closest('article')).not.toBeNull();
  });

  it('offers Reply, Reply all and Forward to a Gmail two-way mailbox instead of the reply box', async () => {
    const onCompose = vi.fn();
    render(
      <MemoryRouter>
        <MailDetail thread={threadOf([MAIL_EARLIER, MAIL_DETAIL])} loading={false} error={null} folder="inbox" gate={LIVE} labels={MAIL_LABELS} replying={false} replyError={null} repliedId={null} onRetry={vi.fn()} onAction={vi.fn()} onUnmute={vi.fn()} onReply={vi.fn()} onCreateLabel={vi.fn(async () => null)} writer onCompose={onCompose} onEditDraft={vi.fn()} />
      </MemoryRouter>,
    );
    const pane = screen.getByRole('region', { name: 'Conversation' });
    expect(within(pane).queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Reply' })).toHaveAttribute('aria-keyshortcuts', 'r');
    expect(within(pane).getByRole('button', { name: 'Reply all' })).toHaveAttribute('aria-keyshortcuts', 'a');
    await userEvent.click(within(pane).getByRole('button', { name: 'Reply all' }));
    await userEvent.click(within(pane).getByRole('button', { name: 'Forward' }));
    expect(onCompose.mock.calls).toEqual([
      ['reply_all', 1],
      ['forward', 1],
    ]);
  });

  it('shows a live draft as a Draft line with Edit draft, and never answers it', async () => {
    const onCompose = vi.fn();
    const onEditDraft = vi.fn();
    render(
      <MemoryRouter>
        <MailDetail thread={threadOf([MAIL_DETAIL, MAIL_DRAFT_MESSAGE])} loading={false} error={null} folder="inbox" gate={LIVE} labels={MAIL_LABELS} replying={false} replyError={null} repliedId={null} onRetry={vi.fn()} onAction={vi.fn()} onUnmute={vi.fn()} onReply={vi.fn()} onCreateLabel={vi.fn(async () => null)} writer onCompose={onCompose} onEditDraft={onEditDraft} />
      </MemoryRouter>,
    );
    const pane = screen.getByRole('region', { name: 'Conversation' });
    expect(within(pane).getByText('Draft')).toBeInTheDocument();
    // The newest real message stays open; the draft does not take its place (P16).
    expect(within(pane).getByRole('article', { name: /^Ann Lee, / })).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Edit draft' }));
    expect(onEditDraft).toHaveBeenCalledWith(55);
    await userEvent.click(within(pane).getByRole('button', { name: 'Reply' }));
    expect(onCompose).toHaveBeenCalledWith('reply', 1);
  });
});
