import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '../../../features/customers/customersSlice';
import { ACCOUNTS } from '../../../features/organizations/testStory';
import { AccountsSection } from './AccountsSection';

// EMEA's renewal_date is 2026-10-15 (testStory.ts); fixing `today` here keeps
// its "in Nd" text stable regardless of when the suite actually runs.
const TODAY = '2026-09-15';

function renderSection(props: Partial<ComponentProps<typeof AccountsSection>> = {}) {
  const handlers = { onRetry: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn() };
  render(
    <MemoryRouter>
      <AccountsSection items={ACCOUNTS} loading={false} error={null} currency="USD" today={TODAY} {...handlers} {...props} />
    </MemoryRouter>,
  );
  return handlers;
}

/** The deepest element whose whole text is `text` (its numbers may be their own elements). */
const whole = (text: string) => (_: string, el: Element | null) =>
  el?.textContent === text && [...el.children].every((child) => child.textContent !== text);

const item = (id: number) => document.querySelector(`[data-account="${id}"]`) as HTMLElement;

describe('AccountsSection (owner decision 2026-09-26: no account detail is lost)', () => {
  it('lists each connected account as an item, not a table, with what the accounts endpoint serves', () => {
    renderSection();
    const section = screen.getByRole('region', { name: 'Accounts' });
    expect(within(section).queryByRole('table')).not.toBeInTheDocument();
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    const emea = item(31);
    expect(within(emea).getByRole('link', { name: 'EMEA' })).toHaveAttribute('href', '/accounts/31');
    expect(within(emea).getByText('Carl CSM · emea.northwind.example')).toBeInTheDocument();
    expect(within(emea).getByText(whole('AI 4 · CSM 5'))).toBeInTheDocument();
    expect(within(emea).getByText('Satisfied')).toBeInTheDocument();
    expect(within(emea).getByRole('img', { name: 'Pulse history: good, good, mixed' })).toBeInTheDocument();
    expect(within(emea).getByText('Usage is steady and the renewal talks are friendly.')).toBeInTheDocument();
    // North America has no owner, domain, score or pulse: it says so, and invents nothing.
    const na = item(32);
    expect(within(na).getByRole('link', { name: 'North America' })).toHaveAttribute('href', '/accounts/32');
    expect(within(na).getByText('No owner')).toBeInTheDocument();
    expect(within(na).getByText(whole('AI — · CSM —'))).toBeInTheDocument();
    expect(within(na).queryByRole('img')).not.toBeInTheDocument();
  });

  // Round-1 fix, 2026-09-27: AccountSerializer's health, lifecycle, ARR,
  // renewal, NPS, CSAT and id were being dropped entirely — "don't lose
  // information". Each item now carries all of them, as a second meta line.
  it("carries every account's health, lifecycle, ARR, renewal, NPS, CSAT and Revenact ID", () => {
    renderSection();
    const emea = item(31);
    expect(emea.textContent).toContain('Health 8.6 Good');
    expect(emea.textContent).toContain('Expansion');
    expect(emea.textContent).toContain('$150.0K ARR');
    expect(emea.textContent).toContain('in 30d');
    expect(emea.textContent).toContain('NPS +42');
    expect(emea.textContent).toContain('CSAT 88.5%');
    expect(emea.textContent).toContain('ID 31');
  });

  // Round-2 fix, 2026-09-27: csm_pulse_score was missing from the frontend
  // Account type entirely, so it was dropped too — the List shows "AI n ·
  // CSM n" and this item should match that form exactly.
  it("shows the CSM pulse beside the AI pulse, in the List's own \"AI n · CSM n\" form", () => {
    renderSection();
    expect(within(item(31)).getByText(whole('AI 4 · CSM 5'))).toBeInTheDocument();
    expect(within(item(32)).getByText(whole('AI — · CSM —'))).toBeInTheDocument();
  });

  it('shows "—" for any blank health, lifecycle, renewal, NPS or CSAT value, never an invented one', () => {
    renderSection();
    const na = item(32);
    // North America's own defaults are real values, not blanks (average
    // health, live, $0.0 ARR) — only its renewal, NPS and CSAT are unset.
    expect(na.textContent).toContain('Health 5.0 Average');
    expect(na.textContent).toContain('Live');
    expect(na.textContent).toContain('$0.0 ARR');
    expect(na.textContent).toContain('NPS —');
    expect(na.textContent).toContain('CSAT —');
    expect(na.textContent).toContain('ID 32');
    // The one genuinely blank field this fixture has among the "always
    // present" ones is the renewal date — rendered as a bare "—", not
    // renewalText's own "No renewal date" (that phrase is for the org tile).
    expect(na.textContent).toContain('· —');
  });

  it('marks an overdue renewal', () => {
    // EMEA's renewal_date is 2026-10-15; 30 days after that is overdue by 30d.
    renderSection({ today: '2026-11-14' });
    expect(item(31).textContent).toContain('30d overdue');
    expect(item(31).querySelector('.text-danger-ink')).not.toBeNull();
  });

  it("replaces the old AccountsMetricsBanner with the same figures as compact text: N accounts, health, ARR, NPS, CSAT and the lifecycle breakdown", () => {
    renderSection();
    const section = screen.getByRole('region', { name: 'Accounts' });
    const text = section.textContent ?? '';
    // 2 accounts: EMEA (good, $150,000) and North America (average, $0).
    expect(text).toContain('2 accounts');
    expect(text).toContain('1 healthy');
    expect(text).toContain('1 average');
    expect(text).toContain('0 at risk');
    expect(text).toContain('ARR $150.0K');
    // NPS, CSAT and CSM average only the scored account (round-3 fix,
    // 2026-09-27): North America's own blanks are left out, not diluted in
    // as a passive/0 the way the old banner did. Only EMEA (nps 42, csat
    // 88.5, csm 5) counts, so every average equals its own single value.
    expect(text).toContain('NPS +100');
    expect(text).toContain('1 promoter');
    expect(text).toContain('0 passive');
    expect(text).toContain('0 detractors');
    expect(text).toContain('CSAT 89%');
    expect(text).toContain('avg CSM 5.0');
    // Lifecycle breakdown: Live (North America) before Expansion (EMEA) —
    // LIFECYCLE_LABELS' own declared order.
    expect(text).toContain('Live 1 · Expansion 1');
  });

  // Round-3 fix, 2026-09-27: confirmed bug — avg CSAT and avg CSM used to
  // add 0 for an unscored account and divide by every account, so one
  // account at 5 plus one blank read "avg CSM 2.5" instead of the scored
  // account's own 5.0.
  it('averages avg CSAT and avg CSM over only the accounts that have a score', () => {
    const scored: Account = { ...ACCOUNTS[0], id: 40, csat_score: '70', csm_pulse_score: 5 };
    const blank: Account = { ...ACCOUNTS[1], id: 41, csat_score: null, csm_pulse_score: null };
    renderSection({ items: [scored, blank] });
    const text = screen.getByRole('region', { name: 'Accounts' }).textContent ?? '';
    expect(text).toContain('avg CSM 5.0');
    expect(text).toContain('CSAT 70%');
  });

  it('shows "—" for avg CSAT, avg CSM and NPS when no account has a score', () => {
    const a: Account = { ...ACCOUNTS[1], id: 42, nps_score: null, csat_score: null, csm_pulse_score: null };
    const b: Account = { ...ACCOUNTS[1], id: 43, nps_score: null, csat_score: null, csm_pulse_score: null };
    renderSection({ items: [a, b] });
    const text = screen.getByRole('region', { name: 'Accounts' }).textContent ?? '';
    expect(text).toContain('NPS —');
    expect(text).toContain('CSAT —');
    expect(text).toContain('avg CSM —');
  });

  // Round-3 fix, 2026-09-27: an account with no nps_score must not count as
  // a passive — the promoter/passive/detractor split and the NPS score
  // itself are computed over scored accounts only.
  it('ignores accounts with no NPS score when computing the split and the NPS score', () => {
    const promoter: Account = { ...ACCOUNTS[0], id: 50, nps_score: 9 };
    const blank: Account = { ...ACCOUNTS[1], id: 51, nps_score: null };
    renderSection({ items: [promoter, blank] });
    const text = screen.getByRole('region', { name: 'Accounts' }).textContent ?? '';
    expect(text).toContain('NPS +100');
    expect(text).toContain('1 promoter');
    expect(text).toContain('0 passive');
    expect(text).toContain('0 detractors');
  });

  it('shows no summary when there are no accounts', () => {
    renderSection({ items: [] });
    expect(screen.queryByText(/accounts ·/)).not.toBeInTheDocument();
  });

  it('falls back an owner with a blank name to "No owner", same as a missing one', () => {
    const blankOwner: Account = { ...ACCOUNTS[0], id: 33, name: 'Blank Owner Co', owner: { id: 9, name: '' } as Account['owner'] };
    renderSection({ items: [blankOwner] });
    expect(within(item(33)).getByText(/^No owner/)).toBeInTheDocument();
  });

  it('adds an account, and edits each one', async () => {
    const { onAdd, onEdit } = renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).toHaveBeenCalledOnce();
    await userEvent.click(within(item(32)).getByRole('button', { name: 'Edit North America' }));
    expect(onEdit).toHaveBeenCalledWith(ACCOUNTS[1]);
  });

  it('gives every control a 44px target below sm', () => {
    renderSection();
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control).toHaveClass('min-h-11');
    }
  });

  it('shows a skeleton while the accounts load', () => {
    renderSection({ items: [], loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading accounts');
  });

  it('shows the error with Try again', async () => {
    const { onRetry } = renderSection({ items: [], error: 'Could not load accounts.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load accounts.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says when no account is connected yet, and still offers Add account', () => {
    renderSection({ items: [] });
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument();
  });

  it('sets only the numbers of the meta lines in DM Mono, the words in the body font', () => {
    renderSection();
    const mono = (el: Element) => el.closest('.tabular-nums') !== null;
    const emea = item(31);
    expect(mono(within(emea).getByText('8.6'))).toBe(true);
    expect(mono(within(emea).getByText(whole('Health 8.6 Good')))).toBe(false);
    expect(mono(within(emea).getByText('4'))).toBe(true);
    expect(mono(within(emea).getByText('5'))).toBe(true);
    expect(mono(within(emea).getByText(whole('AI 4 · CSM 5')))).toBe(false);
  });

  it('is one card titled Accounts, with its states inside it', () => {
    renderSection({ items: [] });
    const card = screen.getByRole('region', { name: 'Accounts' });
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.getByRole('heading', { level: 2, name: 'Accounts' })).toHaveClass('text-[15px]');
    expect(within(card).getByText('No accounts yet')).toHaveClass('text-[15px]', 'font-semibold');
    expect(within(card).getByRole('button', { name: /Add account/ })).toBeInTheDocument();
  });
});
