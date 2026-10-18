import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { COMPANY_BRIEF, ME_STALE_BRIEF } from '../../features/brain/testBrainFixtures';
import { ScopeBriefCard } from './ScopeBriefCard';

const card = () => screen.getByRole('region', { name: SAY.BRIEF });

describe('The scope’s brief (spec §2.3 item 2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a kept brief: headline, paragraphs, Watch next and who wrote it for which view', async () => {
    const { spy } = stubBrain();
    render(<ScopeBriefCard scope="company" scopeLabel="Company" onRefused={() => false} />);
    expect(await within(card()).findByRole('heading', { name: COMPANY_BRIEF.headline })).toBeInTheDocument();
    expect(within(card()).getByText('Enterprise expansion offset part of it.')).toBeInTheDocument();
    expect(within(card()).getByRole('heading', { name: SAY.WATCH })).toBeInTheDocument();
    expect(within(card()).getByText('Analytics Suite renewals in November')).toBeInTheDocument();
    expect(within(card()).getByText('Written 5 Oct by Alice Admin for Company')).toBeInTheDocument();
    expect(within(card()).queryByRole('button')).toBeNull();
    expect(requests(spy, 'POST', '/brain/brief/')).toEqual([]);
  });

  it('puts the title above the card at 15px, with Write again in the title row (fix wave item 1)', async () => {
    stubBrain();
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={() => false} />);
    const write = await screen.findByRole('button', { name: SAY.WRITE_AGAIN });
    const heading = screen.getByRole('heading', { name: SAY.BRIEF });
    expect(heading).toHaveClass('text-[15px]', 'font-semibold');
    expect(heading.parentElement).toContainElement(write);
    expect(heading.compareDocumentPosition(write) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives the title row the shared heading-row shape (so it matches What moved’s), with only the title and the button in it (fix wave follow-up a)', async () => {
    stubBrain();
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={() => false} />);
    const write = await screen.findByRole('button', { name: SAY.WRITE_AGAIN });
    const heading = screen.getByRole('heading', { name: SAY.BRIEF });
    const row = heading.parentElement as HTMLElement;
    expect(row).toHaveClass('min-h-9', 'flex-wrap', 'items-center', 'justify-between');
    // "Uses AI credits." no longer shares the title row with the button:
    // it still appears, just elsewhere in the card.
    expect(within(row).queryByText(SAY.CREDITS)).toBeNull();
    expect(row).toContainElement(write);
    expect(screen.getByText(SAY.CREDITS)).toBeInTheDocument();
  });

  it('marks a stale brief and offers Write again', async () => {
    stubBrain();
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={() => false} />);
    expect(await screen.findByText(ME_STALE_BRIEF.headline)).toBeInTheDocument();
    expect(screen.getByText(SAY.STALE_BRIEF)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SAY.WRITE_AGAIN })).toBeInTheDocument();
  });

  it('offers Write my brief when none is kept, and sends it once however fast it is clicked', async () => {
    const { spy, releaseWrites } = stubBrain({ holdWrites: true });
    render(<ScopeBriefCard scope="team" scopeLabel="My team" onRefused={() => false} />);
    const write = await screen.findByRole('button', { name: SAY.WRITE_MINE });
    expect(screen.getByText(SAY.CREDITS)).toBeInTheDocument();
    await userEvent.dblClick(write);
    await userEvent.click(write);
    expect(screen.getByRole('button', { name: SAY.WRITING })).toBeDisabled();
    releaseWrites();
    expect(await screen.findByRole('heading', { name: 'A fresh brief for My team' })).toBeInTheDocument();
    expect(screen.getByText('Written 5 Oct by Alice Admin for My team')).toBeInTheDocument();
    expect(requests(spy, 'POST', '/brain/brief/')).toEqual(['/brain/brief/?scope=team']);
  });

  it('says Write the company brief for Company', async () => {
    stubBrain({ briefs: {} });
    render(<ScopeBriefCard scope="company" scopeLabel="Company" onRefused={() => false} />);
    expect(await screen.findByRole('button', { name: SAY.WRITE_COMPANY })).toBeInTheDocument();
  });

  it('shows the server’s refusal under the button and keeps the old brief', async () => {
    stubBrain({ refuseNextWrite: { status: 422, detail: 'There is nothing to brief on yet.' } });
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={() => false} />);
    await userEvent.click(await screen.findByRole('button', { name: SAY.WRITE_AGAIN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There is nothing to brief on yet.');
    expect(screen.getByText(ME_STALE_BRIEF.headline)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SAY.WRITE_AGAIN })).toBeEnabled();
  });

  it('says it could not load the brief, tries again, and never offers to write beside the error (I1)', async () => {
    const { revoke } = stubBrain();
    const onRefused = vi.fn(() => false);
    revoke('company');
    render(<ScopeBriefCard scope="company" scopeLabel="Company" onRefused={onRefused} />);
    expect(await screen.findByText(SAY.LOAD_BRIEF)).toBeInTheDocument();
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SAY.WRITE_COMPANY })).toBeNull();
    expect(screen.queryByRole('button', { name: SAY.WRITE_AGAIN })).toBeNull();
  });

  it('keys watch items so a duplicate line causes no React key warning (M6)', async () => {
    stubBrain({ briefs: { me: { ...ME_STALE_BRIEF, watch: ['Renewals next month', 'Renewals next month'] } } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={() => false} />);
    expect(await screen.findAllByText('Renewals next month')).toHaveLength(2);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    errorSpy.mockRestore();
  });

  it('hands a 403 SCOPE_NOT_ALLOWED on writing to the page', async () => {
    const { revoke } = stubBrain();
    const onRefused = vi.fn(() => true);
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={onRefused} />);
    const write = await screen.findByRole('button', { name: SAY.WRITE_AGAIN });
    revoke('me');
    await userEvent.click(write);
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
