import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummaryTiles } from './SummaryTiles';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio } from '../../../features/organizations/testPortfolio';

const summary = buildPortfolio(new URLSearchParams()).summary;

function renderTiles(search = '', onFilter = vi.fn()) {
  render(<SummaryTiles summary={summary} currency="USD" params={parseParams(new URLSearchParams(search))} onFilter={onFilter} />);
  return onFilter;
}

describe('SummaryTiles', () => {
  it('shows the four tiles', () => {
    renderTiles();
    for (const name of ['Health', 'NPS', 'Accounts · ARR']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
    const accounts = screen.getByRole('group', { name: 'Accounts · ARR' });
    expect(accounts).toHaveTextContent('2');
    expect(accounts).toHaveTextContent('$189.6K ARR');
    expect(accounts).not.toHaveTextContent('exchange rate');
  });

  it('says how many accounts have no exchange rate', () => {
    render(<SummaryTiles summary={{ ...summary, unconverted_count: 2 }} currency="USD" params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Accounts · ARR' })).toHaveTextContent('2 without an exchange rate, left out of ARR');
  });

  it('filters to a health band on click, and clears it on a second click', async () => {
    const onFilter = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: 'Average 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ health: ['average'] });

    const again = vi.fn();
    render(<SummaryTiles summary={summary} currency="USD" params={parseParams(new URLSearchParams('health=average'))} onFilter={again} />);
    const pressed = screen.getAllByRole('button', { name: 'Average 1' }).find((b) => b.getAttribute('aria-pressed') === 'true')!;
    await userEvent.click(pressed);
    expect(again).toHaveBeenCalledWith({ health: [] });
  });

  it('switches health between count, MRR and ARR', async () => {
    renderTiles();
    const health = screen.getByRole('group', { name: 'Health' });
    await userEvent.click(within(health).getByRole('button', { name: 'ARR' }));
    expect(within(health).getByRole('button', { name: 'Average $69.6K' })).toBeInTheDocument();
    await userEvent.click(within(health).getByRole('button', { name: 'MRR' }));
    expect(within(health).getByRole('button', { name: 'Average $5.8K' })).toBeInTheDocument();
  });

  it('filters by NPS band', async () => {
    const onFilter = renderTiles();
    expect(screen.getByRole('group', { name: 'NPS' })).toHaveTextContent('+44');
    // A meta line like the other tiles: how many responses the score rests on.
    expect(screen.getByRole('group', { name: 'NPS' })).toHaveTextContent('9 responses');
    expect(within(screen.getByRole('group', { name: 'NPS' })).getByText('9')).toHaveClass('tabular-nums');
    await userEvent.click(screen.getByRole('button', { name: 'Detractors 2' }));
    expect(onFilter).toHaveBeenLastCalledWith({ nps: 'detractor' });
  });

  it('counts renewals in 30 or 90 days and filters to that window', async () => {
    const onFilter = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: '90d' }));
    await userEvent.click(screen.getByRole('button', { name: 'Renewing within 90 days: 1' }));
    expect(onFilter).toHaveBeenLastCalledWith({ renews_within: '90' });
  });

  it('names each tile as a group, not a landmark region', () => {
    renderTiles();
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    expect(screen.getByRole('group', { name: 'NPS' })).toBeInTheDocument();
  });

  it('shows the 180-day window when that filter is active', () => {
    renderTiles('renews_within=180');
    expect(screen.getByRole('button', { name: '180d' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Renewing within 180 days/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says the summary is unavailable after a failed first load, instead of loading forever', () => {
    render(<SummaryTiles summary={null} failed currency="USD" params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
  });

  it('shows tile-shaped skeletons while loading', () => {
    render(<SummaryTiles summary={null} currency="USD" params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading summary');
  });

  it('draws four standard tiles in a container-sized row, and no Lifecycle tile', () => {
    renderTiles();
    expect(screen.queryByRole('group', { name: 'Lifecycle' })).toBeNull();
    const row = screen.getByRole('group', { name: 'Health' }).parentElement!;
    expect(row).toHaveClass('@min-[50rem]:grid-cols-4', 'items-start');
    expect(row.children).toHaveLength(4);
  });

  it('makes Renewing a filter tile whose window switch sits outside its button', async () => {
    const onFilter = vi.fn();
    renderTiles('', onFilter);
    const button = screen.getByRole('button', { name: /^Renewing within \d+ days/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toContainElement(screen.getByRole('group', { name: 'Renewal window' }));
    await userEvent.click(button);
    expect(onFilter).toHaveBeenCalledWith({ renews_within: expect.any(String) });
  });
});
