import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DRAFT_CARLS, DRAFT_EMAIL, stubDrafts } from '../../features/agents/testDrafts';
import { Where } from '../../pages/organizations/testList';
import { DraftRoute } from './DraftPanel';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const where = () => screen.getByTestId('where').textContent;
const open = (url: string, onChanged = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <DraftRoute onChanged={onChanged} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return onChanged;
};

describe('DraftPanel (Decisions 1, 6, 7)', () => {
  it('shows a skeleton, then the draft with its heading focused, its agent, record and source', async () => {
    stubDrafts();
    open('/communications?draft=7');
    expect(screen.getByText('Loading the draft')).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Draft reply' });
    const heading = await within(region).findByRole('heading', { level: 2, name: 'Reply to Ann Lee' });
    await waitFor(() => expect(heading).toHaveFocus());
    const meta = region.querySelector('[data-part="meta"]') as HTMLElement;
    expect(meta).toHaveTextContent('The CS agent drafted a reply.');
    expect(within(meta).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(region.querySelector('[data-part="source"]')).toHaveTextContent('What it answers: Ann Lee <ann@x.com> wrote "Renewal terms" on 6 Oct 2026.');
    expect(within(region).getByRole('textbox', { name: 'Reply' })).toHaveValue(DRAFT_EMAIL.body);
  });

  it('shows the draft in a card under an h2 (the bar holds the page h1)', async () => {
    stubDrafts();
    open('/communications?draft=7');
    const region = screen.getByRole('region', { name: 'Draft reply' });
    expect(region).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(region.className).not.toMatch(/shadow/);
    expect(await within(region).findByRole('heading', { level: 2, name: 'Reply to Ann Lee' })).toBeInTheDocument();
  });

  it('says so when the draft is gone or not the reader to see', async () => {
    stubDrafts();
    open('/communications?draft=404');
    expect(await screen.findByText('Draft not found')).toBeInTheDocument();
    expect(screen.getByText("That draft isn't there any more, or you can't open it.")).toBeInTheDocument();
  });

  it('shows Try again after a failed read, then the draft', async () => {
    stubDrafts({ failRead: 1 });
    open('/communications?draft=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Reply to Ann Lee' })).toBeInTheDocument();
  });

  it('reads someone else draft as text, saying who may change it', async () => {
    stubDrafts();
    open(`/communications?draft=${DRAFT_CARLS.id}`);
    expect(await screen.findByText('Only Carl CSM can change or send this draft.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(document.querySelector('[data-part="body"]')).toHaveTextContent('Thanks for the note on the renewal terms.');
  });

  it('after Send, reads as sent, says so in a focused status line, and tells the page', async () => {
    stubDrafts();
    const onChanged = open('/communications?draft=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Send' }));
    const status = await screen.findByText('Sent to Ann Lee <ann@x.com>.');
    expect(status).toHaveAttribute('role', 'status');
    await waitFor(() => expect(status).toHaveFocus());
    // Figured sets the date's figures in their own spans, so read the line whole.
    expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Alice.');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('after ALREADY_SENT, shows the server sentence focused and reads the draft again', async () => {
    const { drafts } = stubDrafts();
    const onChanged = open('/communications?draft=7');
    await screen.findByRole('heading', { level: 2, name: 'Reply to Ann Lee' });
    Object.assign(drafts.get(7)!, { status: 'sent', sent_at: '2026-10-08T09:55:00Z', sent_by: { id: 3, name: 'Carl CSM' }, can_edit: false });
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const status = await screen.findByText('This draft has been sent.');
    await waitFor(() => expect(status).toHaveFocus());
    await waitFor(() => expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Carl CSM.'));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps its status line in the accessibility tree before any write', async () => {
    stubDrafts();
    open('/communications?draft=7');
    await screen.findByRole('heading', { level: 2, name: 'Reply to Ann Lee' });
    const line = document.querySelector('p[role="status"]') as HTMLElement;
    expect(line).toBeInTheDocument();
    expect(line).toBeEmptyDOMElement();
    expect(line.className).not.toMatch(/(^|\s)(empty:)?hidden(\s|$)/);
  });

  it('after Discard, says Discarded the draft. focused, and Back keeps the source', async () => {
    stubDrafts();
    const onChanged = open('/communications?source=mailbox%3Agoogle&draft=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    const status = await screen.findByText('Discarded the draft.');
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('link', { name: 'Back to the inbox' }));
    await waitFor(() => expect(where()).toBe('/communications?source=mailbox%3Agoogle'));
  });

  it('links a draft that is also a Gmail draft to the mailbox editor (two-way Gmail D3)', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, mail_draft_id: 55 }] });
    open('/communications?draft=7');
    const region = screen.getByRole('region', { name: 'Draft reply' });
    expect(await within(region).findByRole('link', { name: 'Edit it in your mailbox' })).toHaveAttribute('href', '/communications?source=mailbox:google&folder=drafts&draft=55');
  });

  it('renders nothing without a draft id', () => {
    stubDrafts();
    open('/communications');
    expect(screen.queryByRole('region', { name: 'Draft reply' })).toBeNull();
  });

  describe('a send in flight', () => {
    const midSend = (sending: 'pending' | 'unconfirmed', extra: Record<string, unknown> = {}) => ({
      ...DRAFT_EMAIL,
      status: 'sent' as const,
      sent_at: null,
      sent_by: null,
      can_edit: false,
      sending,
      ...extra,
    });
    const WORDS = "We couldn't confirm this was sent. Check your Sent folder.";

    it('pending reads Sending… as text, with no buttons or form', async () => {
      stubDrafts({ drafts: [midSend('pending')] });
      open('/communications?draft=7');
      expect(await screen.findByText('Sending…')).toBeInTheDocument();
      expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sending…');
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('unconfirmed shows the sentence and both buttons to the person who may send', async () => {
      stubDrafts({ drafts: [midSend('unconfirmed', { can_resolve: true })] });
      open('/communications?draft=7');
      expect(await screen.findByText(WORDS)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'It was sent' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Reopen draft' })).toBeEnabled();
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('unconfirmed shows only the sentence when the reader cannot resolve it, even as owner with can_edit', async () => {
      stubDrafts({ drafts: [midSend('unconfirmed', { can_edit: true, can_resolve: false })] });
      open('/communications?draft=7');
      expect(await screen.findByText(WORDS)).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('unconfirmed shows others only the sentence', async () => {
      stubDrafts({ drafts: [midSend('unconfirmed', { owner: { id: 3, name: 'Carl CSM' } })] });
      open('/communications?draft=7');
      expect(await screen.findByText(WORDS)).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('It was sent replaces the draft with the sent one and says so', async () => {
      stubDrafts({ drafts: [midSend('unconfirmed', { can_resolve: true })] });
      const onChanged = open('/communications?draft=7');
      await userEvent.click(await screen.findByRole('button', { name: 'It was sent' }));
      const status = await screen.findByText('Marked as sent.');
      expect(status).toHaveAttribute('role', 'status');
      await waitFor(() => expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Alice.'));
      expect(screen.queryByRole('button', { name: 'It was sent' })).toBeNull();
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('Reopen draft makes it editable again', async () => {
      stubDrafts({ drafts: [midSend('unconfirmed', { can_resolve: true })] });
      const onChanged = open('/communications?draft=7');
      await userEvent.click(await screen.findByRole('button', { name: 'Reopen draft' }));
      expect(await screen.findByRole('textbox', { name: 'Reply' })).toHaveValue(DRAFT_EMAIL.body);
      expect(await screen.findByText('Reopened the draft.')).toHaveAttribute('role', 'status');
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('shows the server detail on a failure, and on a 409 says why and reads the draft again', async () => {
      const { drafts } = stubDrafts({ drafts: [midSend('unconfirmed', { can_resolve: true })], failNextResolve: true });
      const onChanged = open('/communications?draft=7');
      await userEvent.click(await screen.findByRole('button', { name: 'It was sent' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Down.');
      // Someone else settled it meanwhile.
      Object.assign(drafts.get(7)!, { sending: null, can_resolve: false, sent_at: '2026-10-08T09:55:00Z', sent_by: { id: 3, name: 'Carl CSM' } });
      await userEvent.click(screen.getByRole('button', { name: 'Reopen draft' }));
      const status = await screen.findByText("This draft isn't waiting for confirmation.");
      expect(status).toHaveAttribute('role', 'status');
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Reopen draft' })).toBeNull());
      expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Carl CSM.');
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('reads a pending draft again every minute, shows the buttons once it is unconfirmed, then stops', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const { drafts, spy } = stubDrafts({ drafts: [midSend('pending')] });
      open('/communications?draft=7');
      expect(await screen.findByText('Sending…')).toBeInTheDocument();
      const reads = () => spy.mock.calls.filter(([url, init]) => String(url).endsWith('/communications/drafts/7/') && (init?.method ?? 'GET') === 'GET').length;
      expect(reads()).toBe(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(59000);
      });
      expect(reads()).toBe(1);
      Object.assign(drafts.get(7)!, { sending: 'unconfirmed', can_resolve: true });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(await screen.findByRole('button', { name: 'It was sent' })).toBeInTheDocument();
      expect(reads()).toBe(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180000);
      });
      expect(reads()).toBe(2);
    });

    it('shows the draft as gone and stops polling when a re-read is a 404', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const { drafts, spy } = stubDrafts({ drafts: [midSend('pending')] });
      open('/communications?draft=7');
      expect(await screen.findByText('Sending…')).toBeInTheDocument();
      drafts.delete(7);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(await screen.findByText('Draft not found')).toBeInTheDocument();
      const before = spy.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180000);
      });
      expect(spy.mock.calls.length).toBe(before);
    });

    it('stops polling when the panel unmounts', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const { spy } = stubDrafts({ drafts: [midSend('pending')] });
      const view = render(
        <MemoryRouter initialEntries={['/communications?draft=7']}>
          <DraftRoute />
        </MemoryRouter>,
      );
      await screen.findByText('Sending…');
      view.unmount();
      const before = spy.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180000);
      });
      expect(spy.mock.calls.length).toBe(before);
    });

    it('a 409 SEND_SUPERSEDED on Send shows the server sentence and reads the draft again', async () => {
      const { drafts } = stubDrafts();
      const onChanged = open('/communications?draft=7');
      await screen.findByRole('heading', { level: 2, name: 'Reply to Ann Lee' });
      Object.assign(drafts.get(7)!, { status: 'sent', sent_at: '2026-10-08T09:55:00Z', sent_by: { id: 3, name: 'Carl CSM' }, can_edit: false, supersede: true });
      await userEvent.click(screen.getByRole('button', { name: 'Send' }));
      const status = await screen.findByText('This reply already went out.', { selector: 'p[role="status"]' });
      await waitFor(() => expect(status).toHaveFocus());
      await waitFor(() => expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Carl CSM.'));
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('a 504 on Send shows the server sentence and then the unconfirmed state', async () => {
      stubDrafts({ unconfirmNextSend: true });
      open('/communications?draft=7');
      await userEvent.click(await screen.findByRole('button', { name: 'Send' }));
      const status = await screen.findByText(WORDS, { selector: 'p[role="status"]' });
      await waitFor(() => expect(status).toHaveFocus());
      // Reread: the draft is now unconfirmed, and Alice owns it.
      expect(await screen.findByRole('button', { name: 'It was sent' })).toBeInTheDocument();
    });
  });
});
