import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent, stubWork } from '../../features/work/testWork';
import { renderPage } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';

describe('comments in the panel (spec §1.5; contract POST /tasks/<id>/comments/)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('adds a comment once, however fast it is sent, and shows it in the trail', async () => {
    const { spy } = stubWork();
    renderPage(<p>Today</p>, '/work/today?task=41');
    const box = await screen.findByLabelText('Add a comment');
    await userEvent.type(box, 'Called, left a voicemail.');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Comment' }));
    const trail = within(screen.getByRole('list', { name: 'Activity' }));
    expect(await trail.findByText('Called, left a voicemail.')).toBeInTheDocument();
    expect(trail.getByText('You commented')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/comments/')).toEqual([{ body: 'Called, left a voicemail.' }]);
    expect(box).toHaveValue('');
  });

  it('refuses an empty comment in place, and shows the server’s refusal', async () => {
    const { spy } = stubWork({ refuseNextComment: { status: 400, body: { body: ['Keep a comment under 5,000 characters.'] } } });
    renderPage(<p>Today</p>, '/work/today?task=41');
    await userEvent.click(await screen.findByRole('button', { name: 'Comment' }));
    expect(await screen.findByText('Write a comment.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/comments/')).toEqual([]);
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Too long, says the server.');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(await screen.findByText('Keep a comment under 5,000 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment')).toHaveValue('Too long, says the server.');
  });

  it('lets a reader comment on a plan task they cannot otherwise change', async () => {
    const { spy } = stubWork();
    renderPage(<p>Today</p>, '/work/today?task=47');
    await userEvent.type(await screen.findByLabelText('Add a comment'), 'Booked for Thursday.');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(await screen.findByText('Booked for Thursday.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/comments/')).toEqual(['/tasks/47/comments/']);
  });
});
