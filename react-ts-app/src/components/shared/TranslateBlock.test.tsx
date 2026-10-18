import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranslateBlock } from './TranslateBlock';

// Integration tier: the real control against the fetch boundary.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function renderBlock(text = 'Pouvez-vous expliquer la facture ?') {
  render(<TranslateBlock kind="email" id={412} text={text} />);
}

describe('TranslateBlock', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('shows the original until asked, then the translation', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { text: 'Can you explain the invoice?', to: 'en', detected_language: 'fr', made_now: true }));
    renderBlock();
    expect(screen.getByText('Pouvez-vous expliquer la facture ?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText('Can you explain the invoice?')).toBeInTheDocument();
    expect(screen.getByText(/Translated from French/)).toBeInTheDocument();
    expect(screen.queryByText('Pouvez-vous expliquer la facture ?')).not.toBeInTheDocument();
  });

  it('puts the original back', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { text: 'Can you explain the invoice?', to: 'en', detected_language: 'fr', made_now: true }));
    renderBlock();
    await userEvent.click(screen.getByRole('button', { name: 'Translate' }));
    await screen.findByText('Can you explain the invoice?');
    await userEvent.click(screen.getByRole('button', { name: 'Show original' }));
    expect(screen.getByText('Pouvez-vous expliquer la facture ?')).toBeInTheDocument();
    // Going back and forth costs one request, not three.
    await userEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('translates into a language you pick', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { text: 'Können Sie die Rechnung erklären?', to: 'de', detected_language: 'fr', made_now: true }));
    renderBlock();
    await userEvent.selectOptions(screen.getByLabelText('Translate into'), 'de');
    await userEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText('Können Sie die Rechnung erklären?')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ kind: 'email', id: 412, to: 'de' });
  });

  it('says when it could not, and keeps the message readable', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { detail: 'This organisation has spent its monthly model budget.' }));
    renderBlock();
    await userEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/monthly model budget/);
    expect(screen.getByText('Pouvez-vous expliquer la facture ?')).toBeInTheDocument();
  });

  it('offers nothing when there is nothing to translate', { timeout: 15000 }, async () => {
    renderBlock('');
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument();
  });
});
