import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import { LUKAS, LUKAS_HISTORY, MIRA, emptyHistory, requested, stubContactsApi, type ContactsStub } from '../../features/contacts/testContacts';
import { ContactProfile } from './ContactProfile';

function renderProfile(id = 41, stub: ContactsStub = {}) {
  const spy = stubContactsApi(stub);
  const store = configureStore({ reducer: { customers: customersReducer } });
  const onDeleted = vi.fn();
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ContactProfile id={id} onDeleted={onDeleted} />
      </MemoryRouter>
    </Provider>,
  );
  return { spy, store, onDeleted };
}

describe('ContactProfile (spec 2026-09-28 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a skeleton, then who they are, where they sit and how to reach them', async () => {
    renderProfile();
    expect(screen.getByText('Loading this person')).toBeInTheDocument();
    const profile = await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(within(profile).getByRole('heading', { level: 2, name: 'Lukas Vermeer' })).toHaveClass('text-[22px]');
    expect(within(profile).getByText('Champion')).toBeInTheDocument();
    expect(within(profile).getByRole('link', { name: 'Kraft Heinz' })).toHaveAttribute('href', '/organizations/6');
    expect(within(profile).getByRole('link', { name: 'Kraft Heinz EMEA' })).toHaveAttribute('href', '/organizations/6?account=31');
    expect(within(profile).getByRole('link', { name: 'lukas@kraftheinz.example' })).toHaveAttribute('href', 'mailto:lukas@kraftheinz.example');
    expect(within(profile).getByRole('link', { name: '+44 20 7946 0001' })).toHaveAttribute('href', 'tel:+442079460001');
  });

  it('says whether they are active, when they were last contacted and when their sentiment was read, on phones too', async () => {
    renderProfile();
    const profile = await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(within(profile).getByText('Active')).toBeInTheDocument();
    const contacted = within(profile).getByText(/^Last contacted .+ ago$/);
    const read = within(profile).getByText(/^Sentiment read .+ ago$/);
    for (const el of [contacted, read]) {
      for (let node: Element | null = el; node && node !== profile; node = node.parentElement) {
        expect(node.className).not.toMatch(/(^|\s)hidden(\s|$)/);
      }
    }
  });

  it('a hand-set sentiment has no reading time; nobody in touch says so; inactive shows', async () => {
    renderProfile(MIRA.id, { people: [{ ...MIRA, status: 'inactive' }] });
    const profile = await screen.findByRole('article', { name: 'Mira Patel' });
    expect(within(profile).getByText('Inactive')).toBeInTheDocument();
    expect(within(profile).getByText('Not contacted yet')).toBeInTheDocument();
    expect(within(profile).queryByText(/^Sentiment read/)).toBeNull();
  });

  it('says what the sentiment rests on; "Why this sentiment?" waits for Ask (delivery 2)', async () => {
    renderProfile();
    const sentiment = await screen.findByRole('region', { name: 'Sentiment' });
    expect(sentiment).toHaveTextContent('Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep');
    expect(screen.queryByRole('button', { name: /why this sentiment/i })).toBeNull();
  });

  it('lists calls newest first with their reading, then emails and tickets', async () => {
    const { spy } = renderProfile();
    const calls = await screen.findByRole('region', { name: /^Calls/ });
    const items = within(calls).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual(['Renewal readiness', 'Call', 'Kick-off']);
    expect(within(items[0]).getByText('Positive')).toBeInTheDocument();
    expect(within(items[1]).getByText('Not enough to analyse')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /^Emails/ })).getByText('Thanks for the call')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /^Tickets/ })).getByText('ZD-1042')).toBeInTheDocument();
    expect(requested(spy)).toEqual(['/contacts/41/', '/contacts/41/history/']);
  });

  it('says when there is nothing yet, and when a hand-set sentiment rests on nothing', async () => {
    renderProfile(MIRA.id);
    await screen.findByRole('article', { name: 'Mira Patel' });
    expect(screen.getByText('Positive. Set by hand.')).toBeInTheDocument();
    for (const text of ['No calls with them yet.', 'No emails from them you can see.', 'No tickets from them you can see.']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it('a hand-set sentiment over analysed calls says they will be read again tonight', async () => {
    renderProfile(41, { people: [{ ...LUKAS, sentiment: 'negative', sentiment_source: 'manual', sentiment_computed_at: null }] });
    const sentiment = await screen.findByRole('region', { name: 'Sentiment' });
    expect(sentiment).toHaveTextContent('Negative. Set by hand; their calls will be read again tonight.');
    expect(sentiment).not.toHaveTextContent(/nothing of theirs/i);
  });

  it('says the sentiment also rests on records the viewer cannot open', async () => {
    renderProfile(41, { histories: { 41: { ...LUKAS_HISTORY, sentiment_readable: { ...LUKAS_HISTORY.sentiment_readable!, others: true } } } });
    const sentiment = await screen.findByRole('region', { name: 'Sentiment' });
    expect(sentiment).toHaveTextContent(
      "Neutral: 3 positive · 2 neutral · 1 negative across 6 calls and 2 emails, latest 12 Sep Also rests on records you can't open.",
    );
  });

  it('says a sentiment rests only on records the viewer cannot open, when nothing readable was analysed', async () => {
    renderProfile(41, {
      histories: {
        41: { ...LUKAS_HISTORY, sentiment_readable: { calls: 0, emails: 0, tickets: 0, positive: 0, neutral: 0, negative: 0, latest_at: null, others: true } },
      },
    });
    const sentiment = await screen.findByRole('region', { name: 'Sentiment' });
    expect(sentiment).toHaveTextContent("Neutral, from records you can't open.");
  });

  it('a person the viewer cannot open reads as not here', async () => {
    renderProfile(999);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open this person');
    expect(screen.getByRole('alert')).toHaveTextContent('on an account you cannot open');
  });

  it('a failed history read offers Try again', async () => {
    renderProfile(41, { failHistory: 1 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article', { name: 'Lukas Vermeer' })).toBeInTheDocument();
  });

  it('edits through the existing form', async () => {
    const { store } = renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Lukas V.');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Lukas V.' })).toBeInTheDocument();
    expect(store.getState().customers.selectedContact?.name).toBe('Lukas V.');
  });

  it('after a save the person stays on screen while they reload (no skeleton), and focus is back on Edit', async () => {
    const { spy } = renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    let skeleton = false;
    const observer = new MutationObserver(() => {
      if (screen.queryByText('Loading this person')) skeleton = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.selectOptions(screen.getByLabelText(/^Sentiment \(/), 'Negative');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sentiment' })).toHaveTextContent(/^Negative/));
    observer.disconnect();
    expect(skeleton).toBe(false);
    expect(requested(spy).filter((path) => path === '/contacts/41/history/')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
  });

  it('switching to a different person still shows the skeleton', async () => {
    stubContactsApi();
    const store = configureStore({ reducer: { customers: customersReducer } });
    const wrap = (id: number) => (
      <Provider store={store}>
        <MemoryRouter>
          <ContactProfile id={id} onDeleted={vi.fn()} />
        </MemoryRouter>
      </Provider>
    );
    const view = render(wrap(41));
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    view.rerender(wrap(42));
    expect(screen.getByText('Loading this person')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Lukas Vermeer' })).toBeNull();
    expect(await screen.findByRole('article', { name: 'Mira Patel' })).toBeInTheDocument();
  });

  it('deletes after confirming, then hands back to the page', async () => {
    const { spy, onDeleted } = renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Lukas Vermeer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByText('Delete Lukas Vermeer?').closest('div')!.parentElement!;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(spy.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true);
  });

  it('More actions offers Schedule meeting, with this person already invited', async () => {
    renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Lukas Vermeer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Schedule meeting' }));
    const sheet = screen.getByRole('dialog', { name: 'Schedule meeting' });
    expect(sheet).toHaveAccessibleDescription('With Lukas Vermeer, Kraft Heinz');
    expect(within(sheet).getByRole('checkbox', { name: /Lukas Vermeer/ })).toBeChecked();
  });

  it('no Schedule meeting for a person without an email', async () => {
    renderProfile(LUKAS.id, { people: [{ ...LUKAS, email: '' }] });
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Lukas Vermeer' }));
    expect(screen.queryByRole('menuitem', { name: 'Schedule meeting' })).toBeNull();
  });

  it('keeps 44px targets on phones', async () => {
    renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    for (const name of ['Edit', 'More actions for Lukas Vermeer']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-11', 'sm:min-h-9');
    expect(screen.getByRole('link', { name: 'Kraft Heinz' })).toHaveClass('min-h-11');
  });

  it('has no "Why this sentiment?" outside an Ask provider', async () => {
    renderProfile();
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(screen.queryByRole('button', { name: 'Why this sentiment?' })).toBeNull();
  });

  it('a phone telHref cannot use shows as plain text, like the email fallback (fix round 1, 2026-09-28)', async () => {
    renderProfile(41, { people: [{ ...LUKAS, phone: 'Ask reception' }] });
    const profile = await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(within(profile).queryByRole('link', { name: 'Ask reception' })).toBeNull();
    expect(within(profile).getByText('Ask reception')).toBeInTheDocument();
  });

  it("switching people: the previous person's stale error and history never show, and the new person's own history lands (fix round 1, 2026-09-28)", async () => {
    const attrIds = (attr: string) => [...document.querySelectorAll(`[${attr}]`)].map((el) => el.getAttribute(attr));
    let releaseLukasHistory: () => void = () => {};
    const heldLukasHistory = new Promise<void>((resolve) => {
      releaseLukasHistory = resolve;
    });
    const spy = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
      if (path === '/contacts/41/') return { ok: true, status: 200, json: async () => LUKAS };
      if (path === '/contacts/41/history/') {
        await heldLukasHistory;
        return { ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) };
      }
      if (path === '/contacts/42/') return { ok: true, status: 200, json: async () => MIRA };
      if (path === '/contacts/42/history/') return { ok: true, status: 200, json: async () => emptyHistory(MIRA) };
      return { ok: false, status: 404, json: async () => ({ detail: 'Not found.' }) };
    });
    vi.stubGlobal('fetch', spy);
    const store = configureStore({ reducer: { customers: customersReducer } });
    const wrap = (id: number) => (
      <Provider store={store}>
        <MemoryRouter>
          <ContactProfile id={id} onDeleted={vi.fn()} />
        </MemoryRouter>
      </Provider>
    );
    const view = render(wrap(41));
    // Lukas's contact loads, but his history is held: still the skeleton,
    // not his profile (which needs both) — the same moment a real user
    // could click away to another person.
    await screen.findByText('Loading this person');
    expect(screen.queryByRole('article')).toBeNull();

    // Move to Mira while Lukas's history is still in flight (and about to fail).
    view.rerender(wrap(42));
    await screen.findByRole('article', { name: 'Mira Patel' });
    expect(attrIds('data-history-call')).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();

    // Lukas's slow, failing history reply lands late: it must never surface.
    await act(async () => releaseLukasHistory());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(attrIds('data-history-call')).toEqual([]);
    expect(screen.getByRole('article', { name: 'Mira Patel' })).toBeInTheDocument();
  });

  it("says when they unsubscribed from campaigns, and re-subscribes them after asking (campaigns spec §2.5)", async () => {
    const { spy } = renderProfile(41, { people: [{ ...LUKAS, campaigns_unsubscribed_at: '2026-10-03T12:00:00Z' }] });
    const line = await screen.findByRole('region', { name: 'Campaign emails' });
    expect(line).toHaveTextContent('Unsubscribed from campaigns on 3 Oct 2026');
    expect(line.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(within(line).getByRole('button', { name: 'Re-subscribe' }));
    const dialog = screen.getByRole('dialog', { name: 'Re-subscribe Lukas Vermeer?' });
    expect(dialog).toHaveTextContent('They will get campaign emails again from the next send. Only do this if they asked.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Re-subscribe' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Campaign emails' })).toBeNull());
    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ campaigns_unsubscribed: false });
  });

  it('shows no campaign line for someone still subscribed, or from a backend without the field', async () => {
    renderProfile(41, { people: [{ ...LUKAS, campaigns_unsubscribed_at: null }] });
    await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(screen.queryByRole('region', { name: 'Campaign emails' })).toBeNull();
  });

  it('is one card with sections; Delete waits in the More actions menu as a destructive item', async () => {
    renderProfile();
    const card = await screen.findByRole('article', { name: 'Lukas Vermeer' });
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Lukas Vermeer' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('text-danger-ink');
    expect(screen.getByRole('heading', { level: 3, name: /^Calls/ }).className).not.toMatch(/uppercase/);
  });
});
