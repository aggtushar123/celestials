import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KAN_2 } from '../../../features/organizations/testSlack';
import { FromSlackLine, TicketLines } from './LinkLines';

describe('TicketLines (frontend Decision 6)', () => {
  it('links each ticket to Jira in a new tab', () => {
    render(<TicketLines tickets={[KAN_2]} hidden={0} />);
    const link = screen.getByRole('link', { name: /KAN-2 · In progress · Faiz Jamal/ });
    expect(link).toHaveAttribute('href', 'https://alfiee.atlassian.net/browse/KAN-2');
    expect(link).toHaveAttribute('target', '_blank');
  });
  it('a ticket with no https link is words, and what the reader may not see is counted', () => {
    render(<TicketLines tickets={[{ ...KAN_2, url: null }]} hidden={2} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('KAN-2 · In progress · Faiz Jamal')).toBeInTheDocument();
    expect(screen.getByText("Linked to 2 items you can't see")).toBeInTheDocument();
  });
  it('says nothing with nothing linked', () => {
    const { container } = render(<TicketLines tickets={[]} hidden={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FromSlackLine (frontend Decision 6)', () => {
  it('opens the thread', async () => {
    const onOpen = vi.fn();
    const from = { id: 41, channel: '#all-alfiee', started_by: 'Faiz Jamal' };
    render(<FromSlackLine from={from} hidden={0} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'From Slack: Faiz Jamal in #all-alfiee' }));
    expect(onOpen).toHaveBeenCalledWith(from);
  });
  it('a thread the reader may not read is counted, never named', () => {
    render(<FromSlackLine from={null} hidden={1} onOpen={vi.fn()} />);
    expect(screen.getByText("Linked to 1 item you can't see")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
