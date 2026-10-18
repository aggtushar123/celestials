import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestPaths, storyQueries, stubOrganizationPage } from '../../../features/organizations/testStory';
import { EmailThread } from './EmailThread';

function renderThread() {
  const onClose = vi.fn();
  render(<EmailThread orgId={7} threadId="t-1" openedId={41} title="Re: Renewal pricing" isSm onClose={onClose} />);
  return onClose;
}

describe('EmailThread (spec §1.6 "Opening an email shows its thread")', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('reads the thread from the story with ?thread= and shows it oldest first, with no reply controls', async () => {
    const spy = stubOrganizationPage();
    renderThread();
    const dialog = screen.getByRole('dialog', { name: 'Re: Renewal pricing' });
    expect(within(dialog).getByRole('status', { name: 'Opening the email' })).toBeInTheDocument();
    const messages = await within(dialog).findAllByRole('listitem');
    expect(messages.map((message) => message.querySelector('p')?.textContent)).toEqual(['Carl CSM', 'Dana Buyer']);
    expect(messages[1]).toHaveAttribute('aria-current', 'true');
    expect(within(dialog).getByText('Sharing the renewal quote ahead of your board meeting.')).toBeInTheDocument();
    expect(within(dialog).getByText('Can we see the quote before the board meets on Friday?')).toBeInTheDocument();
    expect(within(dialog).getByText('Organization · via Gmail')).toBeInTheDocument();
    expect(within(dialog).getByText('EMEA · via Gmail')).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription('2 messages');
    expect(within(dialog).queryByRole('button', { name: /Reply|Forward/ })).not.toBeInTheDocument();
    expect(dialog.querySelector('img')).toBeNull();
    expect(requestPaths(spy)).toEqual(['GET /organizations/7/story/']);
    expect(Object.fromEntries(storyQueries(spy)[0])).toEqual({ thread: 't-1', limit: '100' });
  });

  it('says so when the email is no longer there for this viewer', async () => {
    stubOrganizationPage({ threads: { 't-1': [] } });
    renderThread();
    expect(await screen.findByText('This email is no longer available to you.')).toBeInTheDocument();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ failStory: 1 });
    renderThread();
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(requestPaths(spy)).toHaveLength(2);
  });

  it('closes from Close', async () => {
    stubOrganizationPage();
    const onClose = renderThread();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
