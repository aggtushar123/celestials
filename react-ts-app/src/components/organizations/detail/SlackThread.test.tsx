import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlackThread } from './SlackThread';
import { SLACK_THREAD, SLACK_THREAD_LINKED, stubSlackConversation } from '../../../features/organizations/testSlack';

afterEach(() => vi.unstubAllGlobals());

function open() {
  const onClose = vi.fn();
  render(<SlackThread id={41} title={SLACK_THREAD.title} isSm={false} onClose={onClose} />);
  return { onClose };
}

describe('SlackThread (Slack escalations D1 Decision 2)', () => {
  it('shows every message oldest first, the app marked, and why it is filed here', async () => {
    stubSlackConversation();
    open();
    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByText(/Mohd faiz|Jesh|alfiee/).textContent)).toEqual(['Mohd faiz', 'Jesh', 'alfiee']);
    expect(within(rows[2]).getByText('App')).toBeInTheDocument();
    expect(screen.getByText('#all-alfiee · 3 messages')).toBeInTheDocument();
    expect(screen.getByText('Filed under Globex (QA) because the message names it.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Slack/ })).toHaveAttribute('href', SLACK_THREAD.url);
  });

  it('lists its Jira issues and counts the ones the reader may not see', async () => {
    stubSlackConversation({ detail: SLACK_THREAD_LINKED });
    open();
    expect(await screen.findByText('Jira issues')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KAN-2 · In progress · Faiz Jamal/ })).toHaveAttribute('href', 'https://alfiee.atlassian.net/browse/KAN-2');
    expect(screen.getByText("Linked to 1 item you can't see")).toBeInTheDocument();
  });

  it('says so when the thread is gone for this reader', async () => {
    stubSlackConversation({ status: 404 });
    open();
    expect(await screen.findByText('This Slack thread is no longer available to you.')).toBeInTheDocument();
  });

  it('offers Try again after a failed read', async () => {
    stubSlackConversation({ failFirst: 1 });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Down.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Looking now.')).toBeInTheDocument();
  });
});
