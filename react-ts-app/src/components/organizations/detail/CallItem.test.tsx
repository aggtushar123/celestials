import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Call } from '../../../features/calls/callsSlice';
import { CALLS, FILES } from '../../../features/organizations/testStory';
import { CallItem } from './CallItem';

function renderItem(call: Call) {
  render(
    <ul>
      <CallItem call={call} />
    </ul>,
  );
  return screen.getByRole('listitem');
}

describe('CallItem (spec 2026-09-27 §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows title, time, a one-line summary, then the account, host and duration, and sentiment as a badge', () => {
    const item = renderItem(CALLS[1]);
    expect(within(item).getByRole('heading', { name: 'EMEA renewal call' })).toBeInTheDocument();
    expect(within(item).getByText('Quote accepted in principle.')).toHaveClass('truncate');
    expect(within(item).getByText('EMEA')).toBeInTheDocument();
    expect(within(item).getByText(/^Carl CSM · 45 min/)).toBeInTheDocument();
    expect(within(item).getByText('Positive')).toHaveClass('rounded-full', 'bg-success-dim');
    expect(item.querySelector('time')).toHaveClass('tabular-nums');
    expect(item.querySelector('.font-mono-brand')).toBeNull();
  });

  it('says "Not enough to analyse" for a call with nothing to read, and nothing while one waits (spec 2026-09-28 §5)', () => {
    const empty = renderItem({ ...CALLS[1], analysis: 'not_analysable', sentiment: '' });
    expect(within(empty).getByText('Not enough to analyse')).toHaveClass('rounded-full', 'bg-subtle', 'text-ink-muted');
    document.body.innerHTML = '';
    // A pending call still carries the model's default "neutral": not a reading.
    const pending = renderItem({ ...CALLS[1], analysis: 'pending', sentiment: 'neutral' });
    for (const text of ['Neutral', 'Positive', 'Not enough to analyse']) expect(within(pending).queryByText(text)).toBeNull();
    document.body.innerHTML = '';
    expect(within(renderItem({ ...CALLS[1], analysis: 'analysed' })).getByText('Positive')).toHaveClass('bg-success-dim');
  });

  it('opens the whole summary in place from its title', async () => {
    const item = renderItem(CALLS[0]);
    const title = within(item).getByRole('button', { name: 'Quarterly check-in' });
    expect(title).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(within(item).getByText('The admin left and usage fell. Agreed a retraining session.')).toHaveClass('whitespace-pre-line');
  });

  it('names who was on it once the title opens, and links the recording in a new tab', async () => {
    const item = renderItem({ ...CALLS[1], participants: CALLS[0].participants });
    expect(within(item).queryByText(/^With /)).toBeNull();
    await userEvent.click(within(item).getByRole('button', { name: 'EMEA renewal call' }));
    expect(within(item).getByText('With Pat Finance · Finance Manager')).toBeInTheDocument();
    const recording = within(item).getByRole('link', { name: 'Recording' });
    expect(recording).toHaveAttribute('href', 'https://recordings.example/13');
    expect(recording).toHaveAttribute('target', '_blank');
  });

  it("names each person's role in visible text, and leaves out a role it does not have", async () => {
    const item = renderItem({
      ...CALLS[1],
      participants: [
        { id: 51, name: 'Dana Buyer', role_display: 'Decision Maker', sentiment: 'positive' },
        { id: 54, name: 'Lee Guest', role_display: '', sentiment: '' },
      ],
    });
    await userEvent.click(within(item).getByRole('button', { name: 'EMEA renewal call' }));
    expect(within(item).getByText('With Dana Buyer · Decision Maker, Lee Guest')).not.toHaveClass('truncate');
  });

  it('stays one height: who it was with opens with the title, transcript and recording wait in the row actions', async () => {
    const item = renderItem({
      ...CALLS[1],
      participants: [{ id: 52, name: 'Connor Blake', role_display: 'Decision Maker', sentiment: 'positive' }],
      ai_category: 'account_management',
      transcript: { ...FILES[0], name: 'Transcript.vtt', source: 'transcript' },
    });
    expect(within(item).queryByText(/^With /)).toBeNull();
    expect(within(item).getByText(/account management/)).toBeInTheDocument();
    await userEvent.click(within(item).getByRole('button', { name: CALLS[1].title }));
    expect(within(item).getByText('With Connor Blake · Decision Maker')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Transcript' }).parentElement).toHaveClass('sm:opacity-0');
  });

  it('says who logged a call by hand, and which recorder brought one in', () => {
    const logged = renderItem({ ...CALLS[1], logged_by: { id: 3, name: 'Rita Rep' } });
    expect(within(logged).getByText(/logged by Rita Rep/)).toBeInTheDocument();
    document.body.innerHTML = '';
    const synced = renderItem({ ...CALLS[1], connector_name: 'Gong', connector_provider: 'gong', logged_by: null });
    expect(within(synced).getByText(/via Gong/)).toBeInTheDocument();
    expect(within(synced).queryByText(/logged by/)).not.toBeInTheDocument();
  });

  it("shows the AI's classification, humanised, the category before the area", () => {
    const item = renderItem({ ...CALLS[1], ai_area: 'Adoption', ai_category: 'Training gap' });
    const label = within(item).getByText('Training gap');
    expect(label.closest('[data-ai]')).toHaveTextContent('AI classification: Training gap');
    document.body.innerHTML = '';
    expect(within(renderItem({ ...CALLS[1], ai_area: 'Adoption' })).getByText(/Adoption/)).toBeInTheDocument();
    document.body.innerHTML = '';
    expect(renderItem(CALLS[1]).querySelector('[data-ai]')).toBeNull();
  });

  it('never links a recording that is not http(s), and says when there is no summary', () => {
    const item = renderItem({ ...CALLS[1], recording_url: 'javascript:alert(1)', summary: '' });
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
    expect(within(item).getByText('No summary yet.')).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'EMEA renewal call' })).not.toBeInTheDocument();
  });

  it('downloads the transcript, and says when that fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) })));
    const item = renderItem({ ...CALLS[0], transcript: { ...FILES[0], name: 'Transcript.vtt', source: 'transcript' } });
    await userEvent.click(within(item).getByRole('button', { name: 'Transcript' }));
    expect(await within(item).findByRole('alert')).toHaveTextContent('Could not download the transcript.');
  });
});
