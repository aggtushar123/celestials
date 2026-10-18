import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReplyBox } from './ReplyBox';

const sources = [
  { type: 'note', id: 7, label: 'Billing preference', date: '2026-09-01', company: 'Pizza Hut', company_type: 'customer', company_id: 3 },
  { type: 'email', id: 9, label: 'Re: pricing', date: '2026-08-20', company: 'Pizza Hut', company_type: 'customer', company_id: 3 },
];

function mockDraft(status = 200, body: unknown = { draft: 'Hi Sam,\n\nYes, the multi-year option is available.', sources }) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url} ${init?.body ?? ''}`);
      return Promise.resolve({ ok: status < 400, status, json: async () => body });
    })
  );
  return calls;
}

function renderBox(onSend = vi.fn()) {
  render(
    <MemoryRouter>
      <ReplyBox label="Reply" placeholder="Write your reply." hint="Sends from your mailbox" sendLabel="Send reply" draftSource={{ kind: 'email', id: 412 }} onSend={onSend} sending={false} />
    </MemoryRouter>
  );
  return onSend;
}

describe('ReplyBox', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('Draft with Copilot fills the box and cites its sources', async () => {
    const calls = mockDraft();
    renderBox();
    await userEvent.click(screen.getByRole('button', { name: /draft with copilot/i }));
    expect(await screen.findByDisplayValue(/multi-year option/)).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST') && c.includes('/copilot/draft-reply/') && c.includes('"kind":"email"') && c.includes('"id":412'))).toBe(true);
    expect(screen.getByText('2 sources used')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /view sources/i }));
    expect(screen.getByRole('link', { name: /Billing preference/ })).toHaveAttribute('href', '/organizations/3');
    expect(screen.getByRole('link', { name: /Re: pricing/ })).toBeInTheDocument();
  });

  it('a failed draft says why and leaves the box alone', async () => {
    mockDraft(429, { detail: 'Monthly budget reached.' });
    renderBox();
    await userEvent.type(screen.getByLabelText('Reply'), 'my own words');
    await userEvent.click(screen.getByRole('button', { name: /draft with copilot/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Monthly budget reached.');
    expect(screen.getByLabelText('Reply')).toHaveValue('my own words');
  });

  it('sends what is in the box', async () => {
    mockDraft();
    const onSend = renderBox();
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reply'), 'Thursday works.');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(onSend).toHaveBeenCalledWith('Thursday works.');
  });
});

describe('ReplyBox in their language', () => {
  function renderIn(language?: string) {
    render(
      <MemoryRouter>
        <ReplyBox label="Reply" placeholder="Write your reply." hint="" sendLabel="Send reply" theirLanguage={language} onSend={vi.fn()} />
      </MemoryRouter>
    );
  }

  it('offers to put the draft into the language they write in', { timeout: 15000 }, async () => {
    const calls = mockDraft(201, { text: 'Bonjour, voici la facture.', to: 'fr', detected_language: 'en', made_now: true });
    renderIn('fr');
    await userEvent.type(screen.getByRole('textbox'), 'Hello, here is the invoice.');
    await userEvent.click(screen.getByRole('button', { name: /Write in French/ }));
    expect(await screen.findByDisplayValue('Bonjour, voici la facture.')).toBeInTheDocument();
    expect(calls[0]).toContain('/translations/');
    expect(calls[0]).toContain('"to":"fr"');
  });

  it('says nothing about a language nobody knows', () => {
    mockDraft();
    renderIn(undefined);
    expect(screen.queryByRole('button', { name: /Write in/ })).not.toBeInTheDocument();
  });

  it('keeps the draft when a translation fails', { timeout: 15000 }, async () => {
    mockDraft(429, { detail: 'This organisation has spent its monthly model budget.' });
    renderIn('fr');
    await userEvent.type(screen.getByRole('textbox'), 'Hello there');
    await userEvent.click(screen.getByRole('button', { name: /Write in French/ }));
    expect(await screen.findByText(/monthly model budget/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hello there')).toBeInTheDocument();
  });
});

describe('ReplyBox protects what the person typed', () => {
  it('keeps their words when a translation lands after they kept typing', { timeout: 15000 }, async () => {
    let release: ((value: unknown) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ok: true, status: 201, json: async () => ({ text: 'Bonjour.', to: 'fr', detected_language: 'en', made_now: true }) });
        })
      )
    );
    render(
      <MemoryRouter>
        <ReplyBox label="Reply" placeholder="Write." hint="" sendLabel="Send" theirLanguage="fr" onSend={vi.fn()} />
      </MemoryRouter>
    );
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /Write in French/ }));
    await userEvent.type(box, ' again');
    release!(undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByDisplayValue('Hello again')).toBeInTheDocument();
  });

  it('keeps one status node mounted and swaps only its words when the reply is sent', () => {
    const box = (sent: boolean) => (
      <MemoryRouter>
        <ReplyBox label="Reply" placeholder="Write your reply." hint="Sends from your mailbox" sendLabel="Send reply" onSend={vi.fn()} sent={sent} />
      </MemoryRouter>
    );
    const { rerender } = render(box(false));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Sends from your mailbox');
    rerender(box(true));
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Sent from your mailbox.');
    rerender(box(false));
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Sends from your mailbox');
  });

  it('shows a draft error even when the send error is an empty string', async () => {
    mockDraft(429, { detail: 'Monthly budget reached.' });
    render(
      <MemoryRouter>
        <ReplyBox label="Reply" placeholder="Write your reply." hint="Sends from your mailbox" sendLabel="Send reply" draftSource={{ kind: 'email', id: 412 }} onSend={vi.fn()} error="" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /draft with copilot/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Monthly budget reached.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('labels the composer in sentence case and sends with the one primary', () => {
    render(
      <MemoryRouter>
        <ReplyBox label="Reply" placeholder="Write your reply." hint="Sends from your connected mailbox" sendLabel="Send reply" onSend={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Reply')).toHaveClass('text-[13px]', 'font-semibold');
    expect(screen.getByText('Reply')).not.toHaveClass('uppercase');
    expect(screen.getByRole('button', { name: 'Send reply' })).toHaveClass('bg-accent', 'min-h-11');
    expect(document.querySelector('.rv-glass-inner')).toBeNull();
  });
});
