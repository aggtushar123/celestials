import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { CARL_CSAT, DRAFT_CES, Q3_NPS, requestsOf, sendPayload, stubSurveys, type StoredSend, type StubInvite } from '../../features/surveys/testSurveys';
import { NO_VALUE } from '../../components/ui';
import { resetViewport } from '../../test/viewport';
import { renderSurveys } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const header = async () => {
  await screen.findByRole('heading', { level: 1 });
  return document.querySelector('[data-part="send-header"]') as HTMLElement;
};

/** Claimed, not finished yet: one invite queued, nobody answered. Matches
 *  the real backend's `claim()` (services/surveys/sending.py): `counts` is
 *  written at claim time, `sent`/`failed` both 0 until `finish` freezes
 *  them — never null while sending. */
const SENDING_NPS: StoredSend = {
  ...Q3_NPS,
  id: 9,
  status: 'sending',
  started_at: Q3_NPS.sent_at,
  sent_at: null,
  counts: { audience: 1, sent: 0, failed: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0 },
};
const SENDING_INVITE: StubInvite = {
  id: 90,
  send: 9,
  token: 'sending-90',
  contact: { id: 90, name: 'Pat Doe' },
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  state: 'pending',
  score: null,
  comment: '',
  answered_at: null,
  expires_at: '2026-10-17T12:00:00Z',
  failure: null,
  visible: true,
};
/** What the minute runner leaves once it has finished delivering. */
const SENT_NPS: StoredSend = { ...SENDING_NPS, status: 'sent', sent_at: '2026-10-04T14:05:00Z', counts: { audience: 1, sent: 1, failed: 0, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0 } };

describe('/surveys/:id (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetViewport();
  });

  it('heads my send: name, type, segment link, date, sender and sharing, with Edit', async () => {
    stubSurveys();
    renderSurveys('/surveys/3');
    expect(await screen.findByRole('heading', { level: 1, name: 'Q3 NPS' })).toBeInTheDocument();
    const head = await header();
    expect(within(head).getByText('NPS')).toBeInTheDocument();
    expect(within(head).getByRole('link', { name: 'Renewal risk' })).toHaveAttribute('href', '/segments/7');
    expect(head).toHaveTextContent('Sent 3 Oct 2026 · By you · Shared with the workspace');
    expect(within(head).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/surveys/3/edit');
    expect(within(head).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it("shows the tiles, the figure signed, the bands named, and the owner's frozen counts", async () => {
    stubSurveys();
    renderSurveys('/surveys/3');
    expect(within(await screen.findByRole('group', { name: 'Sent' })).getByText('5')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Answered' })).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Response rate' })).getByText('60%')).toBeInTheDocument();
    const nps = screen.getByRole('group', { name: 'NPS' });
    expect(nps).toHaveTextContent('+33');
    expect(nps).toHaveTextContent('Promoters minus detractors');
    // The bands are the NPS tile's breakdown rows, not a tile of their own.
    expect(screen.queryByRole('group', { name: 'Bands' })).toBeNull();
    const bands = [...nps.querySelectorAll('[data-part="band"]')];
    expect(bands.map((node) => node.children[0].textContent)).toEqual(['Detractors', 'Passives', 'Promoters']);
    expect(bands.map((node) => node.children[1].textContent)).toEqual(['1', '0', '2']);
    expect(document.querySelector('[data-part="counts"]')).toHaveTextContent(
      'At the send: 6 people · 5 sent · 1 not delivered · 6 skipped (surveyed in the last 30 days) · 2 without an email',
    );
  });

  it('shows a shared reader the figures over people they may open, and no Edit or frozen counts', async () => {
    stubSurveys();
    renderSurveys('/surveys/4');
    const head = await header();
    expect(head).toHaveTextContent('Sent 1 Oct 2026 · By Carl CSM · Shared with Alice');
    expect(within(head).queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('group', { name: 'CSAT' })).toHaveTextContent('100%');
    expect(within(screen.getByRole('group', { name: 'Sent' })).getByText('1')).toBeInTheDocument();
    expect(document.querySelector('[data-part="counts"]')).toBeNull();
  });

  it('names a segment the reader cannot open without linking it', async () => {
    stubSurveys({ sends: [{ ...CARL_CSAT, segment: { id: null, name: 'EMEA accounts', kind: 'account' } }] });
    renderSurveys('/surveys/4');
    const head = await header();
    expect(within(head).getByText('EMEA accounts')).toBeInTheDocument();
    expect(within(head).queryByRole('link', { name: 'EMEA accounts' })).toBeNull();
  });

  it('says a deleted segment without linking it', async () => {
    stubSurveys({ sends: [{ ...Q3_NPS, segment: null }] });
    renderSurveys('/surveys/3');
    await screen.findByRole('heading', { level: 1, name: 'Q3 NPS' });
    const head = await header();
    expect(within(head).getByText('a deleted segment').tagName).toBe('SPAN');
    expect(within(head).queryAllByRole('link').map((link) => link.textContent)).toEqual(['Edit']);
  });

  it('shows no response rate as a dash with a reason for screen readers, on the page and in the list', async () => {
    stubSurveys({ sends: [Q3_NPS], invites: [] });
    const first = renderSurveys('/surveys/3');
    const rate = await screen.findByRole('group', { name: 'Response rate' });
    expect(rate.querySelector('[aria-hidden="true"]')).toHaveTextContent('—');
    expect(within(rate).getByText('No response rate: nobody received it')).toHaveClass('sr-only');
    first.unmount();
    renderSurveys('/surveys');
    const row = (await screen.findByRole('link', { name: 'Q3 NPS' })).closest('li') as HTMLElement;
    expect(row.querySelector('[aria-hidden="true"]')).toHaveTextContent(NO_VALUE);
    expect(within(row).getByText('No response rate: nobody received it')).toHaveClass('sr-only');
  });

  it("gives a shared reader the reason in their own terms", async () => {
    stubSurveys({ sends: [CARL_CSAT], invites: [] });
    renderSurveys('/surveys/4');
    const rate = await screen.findByRole('group', { name: 'Response rate' });
    expect(within(rate).getByText('No response rate: nobody you can open received it')).toHaveClass('sr-only');
  });

  it('shows a draft as not sent yet, with Edit and send, and deletes it after confirming', async () => {
    const { spy } = stubSurveys();
    renderSurveys('/surveys/5');
    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit and send' })).toHaveAttribute('href', '/surveys/5/edit');
    // One way to edit a draft: the header's generic Edit stays off.
    expect(within(document.querySelector('[data-part="send-header"]') as HTMLElement).queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Sent' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete Onboarding effort?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement);
    await waitFor(() => expect(where()).toBe('/surveys'));
    expect(requestsOf(spy, 'DELETE', /^\/surveys\/sends\/5\/$/)).toHaveLength(1);
  });

  it('keeps the confirm open with the refusal when the delete fails', async () => {
    stubSurveys({ remove: () => ({ status: 409, body: { detail: "Only a draft can be deleted; a sent survey's answers feed the scores." } }) });
    renderSurveys('/surveys/5');
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement);
    expect(await screen.findByText("Only a draft can be deleted; a sent survey's answers feed the scores.")).toBeInTheDocument();
    expect(where()).toBe('/surveys/5');
  });

  it.each(['/surveys/6', '/surveys/999', '/surveys/abc'])('reads "Survey not found" for %s', async (url) => {
    stubSurveys();
    renderSurveys(url);
    expect(await screen.findByText('Survey not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All surveys' })).toHaveAttribute('href', '/surveys');
  });

  it('says when the send could not be read, and Try again reads it again', async () => {
    let reads = 0;
    stubSurveys({ read: () => (++reads === 1 ? { status: 500, body: { detail: 'Surveys are down.' } } : undefined) });
    renderSurveys('/surveys/3');
    expect(await screen.findByText('Surveys are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Q3 NPS' })).toBeInTheDocument();
  });

  it('shows Answers and a closed Not answered on a sent survey, and neither on a draft', async () => {
    stubSurveys();
    const first = renderSurveys('/surveys/3');
    expect(await screen.findByRole('list', { name: 'Answers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not answered' })).toHaveAttribute('aria-expanded', 'false');
    first.unmount();
    renderSurveys('/surveys/5');
    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Answers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not answered' })).toBeNull();
  });

  describe('a send still sending (send-now only claims; a minute runner delivers)', () => {
    it('shows Sending with the counts so far, polls every 5 seconds, then shows the final state', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let reads = 0;
      const { spy } = stubSurveys({
        sends: [SENDING_NPS],
        invites: [SENDING_INVITE],
        read: (id) => {
          if (id !== 9) return undefined;
          reads += 1;
          const send = reads === 1 ? SENDING_NPS : SENT_NPS;
          return { status: 200, body: sendPayload(send, [SENDING_INVITE]) };
        },
      });
      renderSurveys('/surveys/9');
      const head = await header();
      const status = within(head).getByRole('status');
      expect(status).toHaveTextContent('Sending now');
      // Said once: the meta line does not repeat it.
      expect(head.textContent!.match(/Sending now/g)).toHaveLength(1);
      // Counts so far: one invite claimed, nobody failed, none answered yet.
      expect(within(await screen.findByRole('group', { name: 'Sent' })).getByText('1')).toBeInTheDocument();
      expect(document.querySelector('[data-part="counts"]')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/9\/$/)).toHaveLength(2);
      await waitFor(() => expect(document.querySelector('[data-part="send-header"]')).not.toHaveTextContent('Sending'));
      expect(document.querySelector('[data-part="counts"]')).toHaveTextContent('1 person');
      // The live region is one node for the page's life: it empties, it is never swapped.
      expect(within(document.querySelector('[data-part="send-header"]') as HTMLElement).getByRole('status')).toBe(status);
      expect(status).toBeEmptyDOMElement();
    });

    it('stops polling once the component unmounts', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { spy } = stubSurveys({ sends: [SENDING_NPS], invites: [SENDING_INVITE] });
      const page = renderSurveys('/surveys/9');
      await header();
      page.unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/9\/$/)).toHaveLength(1);
    });
  });
});

describe('a send on the primitives (Impact PR)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('names it once with Edit visible, and four tiles: the NPS tile carries its three bands', async () => {
    stubSurveys();
    renderSurveys(`/surveys/${Q3_NPS.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: Q3_NPS.name })).toHaveClass('text-[22px]');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/surveys/${Q3_NPS.id}/edit`);
    const tiles = document.querySelectorAll('[data-part="tile"]');
    expect(tiles).toHaveLength(4);
    const nps = tiles[3] as HTMLElement;
    expect(within(nps).getByText('Promoters')).toHaveClass('text-[11px]');
    expect(nps.querySelector('.text-\\[15px\\]')).toBeNull();
  });

  it("puts a draft's Delete in the menu in the danger tone, and says Not sent yet inside a card", async () => {
    stubSurveys();
    renderSurveys(`/surveys/${DRAFT_CES.id}`);
    await screen.findByRole('heading', { level: 1, name: DRAFT_CES.name });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('text-danger-ink');
    expect(screen.getByText('Not sent yet').closest('section')).toHaveClass('rounded-xl', 'border-line');
  });

  it('lists the answers in one card with the filter beside the heading', async () => {
    stubSurveys();
    renderSurveys(`/surveys/${Q3_NPS.id}`);
    const answers = await screen.findByRole('list', { name: 'Answers' });
    expect(answers.parentElement).toHaveClass('rounded-xl', 'border-line');
    expect(screen.getByRole('group', { name: 'Show answers' })).toBeInTheDocument();
    for (const link of within(answers).getAllByRole('link')) {
      expect(link.className).toContain('before:h-11');
      expect(link.className).not.toMatch(/\bmin-h-11\b/);
    }
  });
});
