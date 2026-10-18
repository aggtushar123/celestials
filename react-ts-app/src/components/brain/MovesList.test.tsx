import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { AT_RISK_SIGNAL, COMPANY, COMPANY_EXPLANATION, ME_BASELINE, TEAM } from '../../features/brain/testBrainFixtures';
import type { ChangedPayload } from '../../features/brain/brainTypes';
import { MovesList } from './MovesList';

const rows = () => within(screen.getByRole('list', { name: SAY.MOVED })).getAllByRole('listitem');

const renderList = (changed: ChangedPayload, onRefused: (err: unknown) => boolean = () => false) =>
  render(
    <MemoryRouter>
      <MovesList changed={changed} onRefused={onRefused} />
    </MemoryRouter>,
  );

describe('What moved (spec §2.3 item 3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists one row per signal in the server’s order, bad news first, with words for the direction', () => {
    stubBrain();
    renderList(COMPANY, () => false);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent('ARR at risk');
    expect(rows()[0]).toHaveTextContent('$64.1K → to $114.5K');
    expect(within(rows()[0]).getByText('up $50.5K')).toHaveClass('text-danger-ink', 'tabular-nums');
    expect(rows()[0]).toHaveTextContent('most of it: Analytics Suite');
    expect(within(rows()[1]).getByText('up $12.0K')).toHaveClass('text-success-ink');
  });

  it('carries the handover on a team’s money signal', () => {
    stubBrain();
    renderList(TEAM, () => false);
    expect(rows()[0]).toHaveTextContent('most of it: Analytics Suite · includes 2 customers handed to Dana CSM');
  });

  it('says nothing moved since the day compared with', () => {
    stubBrain();
    renderList(ME_BASELINE, () => false);
    expect(screen.getByText('Nothing moved materially since 5 Oct.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: SAY.MOVED })).toBeNull();
  });

  it('opens the kept explanation under the row, one at a time', async () => {
    const { spy } = stubBrain();
    renderList(COMPANY, () => false);
    const why = screen.getByRole('button', { name: 'Why? ARR at risk' });
    await userEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    expect(await within(panel).findByText(COMPANY_EXPLANATION.text)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: SAY.EXPLAIN })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Why? Expansion ARR' }));
    expect(screen.queryByRole('region', { name: 'Why ARR at risk moved' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Why Expansion ARR moved' })).toBeInTheDocument();
    expect(requests(spy, 'GET', '/explanations/')).toEqual([
      '/brain/explanations/arr_at_risk/?scope=company',
      '/brain/explanations/expansion/?scope=company',
    ]);
  });

  it('offers Explain this when none is kept, sends it once, and names how many accounts are hidden', async () => {
    const { spy, releaseWrites } = stubBrain({ hidden: 2, holdWrites: true });
    renderList(TEAM, () => false);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const panel = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    const explain = await within(panel).findByRole('button', { name: SAY.EXPLAIN });
    expect(within(panel).getByText(SAY.CREDITS)).toBeInTheDocument();
    await userEvent.dblClick(explain);
    expect(within(panel).getByRole('button', { name: SAY.EXPLAINING })).toBeDisabled();
    releaseWrites();
    expect(await within(panel).findByText('Why arr_at_risk moved for My team.')).toBeInTheDocument();
    expect(within(panel).getByText("2 more organizations you can't open")).toBeInTheDocument();
    expect(requests(spy, 'POST', '/explanations/')).toEqual(['/brain/explanations/arr_at_risk/?scope=team']);
  });

  it('shows the server’s refusal under the button', async () => {
    stubBrain({ refuseNextWrite: { status: 503, detail: 'The AI assistant is not configured.' } });
    renderList(TEAM, () => false);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    await userEvent.click(await screen.findByRole('button', { name: SAY.EXPLAIN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI assistant is not configured.');
    expect(screen.getByRole('button', { name: SAY.EXPLAIN })).toBeEnabled();
  });

  it('offers Explain again on a stale explanation (Decision 10)', async () => {
    stubBrain({ explanations: [{ ...COMPANY_EXPLANATION, stale: true }] });
    renderList(COMPANY, () => false);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    expect(await screen.findByText(SAY.STALE_EXPLANATION)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SAY.EXPLAIN_AGAIN })).toBeInTheDocument();
  });

  it('says it could not load the explanation and never offers to explain beside the error (I1)', async () => {
    const { revoke } = stubBrain();
    renderList(TEAM, () => false);
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const panel = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    expect(await within(panel).findByText(SAY.LOAD_EXPLANATION)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: SAY.EXPLAIN })).toBeNull();
    expect(within(panel).queryByRole('button', { name: SAY.EXPLAIN_AGAIN })).toBeNull();
  });

  it('keys evidence lines so a duplicate line causes no React key warning (M6)', async () => {
    stubBrain({ explanations: [{ ...COMPANY_EXPLANATION, evidence: ['Two renewals slipped', 'Two renewals slipped'] }] });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderList(COMPANY, () => false);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const panel = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    expect(await within(panel).findAllByText('Two renewals slipped')).toHaveLength(2);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    errorSpy.mockRestore();
  });

  it('marks the arrow between then and now decorative, with a spoken "to" (M4)', () => {
    stubBrain();
    renderList(COMPANY, () => false);
    const arrow = within(rows()[0]).getByText('→');
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
    expect(rows()[0].querySelector('.sr-only')).toHaveTextContent('to');
  });

  it('hands a 403 SCOPE_NOT_ALLOWED to the page instead of showing it', async () => {
    const { revoke } = stubBrain();
    const onRefused = vi.fn(() => true);
    renderList(TEAM, onRefused);
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(SAY.LOAD_EXPLANATION)).toBeNull();
  });

  it('links a product or owner driver to the graph in the same scope, and leaves other drivers as words (customers Decision 5)', () => {
    stubBrain();
    renderList(COMPANY);
    const link = within(rows()[0]).getByRole('link', { name: 'Analytics Suite on the knowledge graph' });
    expect(link).toHaveAttribute('href', '/brain/graph?scope=company&product=product%3A4');
    expect(rows()[0]).toHaveTextContent('most of it: Analytics Suite');
    expect(within(rows()[1]).queryByRole('link')).toBeNull();
    expect(rows()[1]).toHaveTextContent('most of it: Enterprise');
  });

  it('leaves Unassigned and No product recorded as words, never a broken graph link (final review #1)', () => {
    stubBrain();
    const payload: ChangedPayload = {
      ...COMPANY,
      signals: [{ ...AT_RISK_SIGNAL, drivers: [{ dimension: 'owner', member: 'unassigned', label: 'Unassigned', change: 50450 }] }],
    };
    renderList(payload);
    expect(rows()[0]).toHaveTextContent('most of it: Unassigned');
    expect(within(rows()[0]).queryByRole('link')).toBeNull();
  });
});
