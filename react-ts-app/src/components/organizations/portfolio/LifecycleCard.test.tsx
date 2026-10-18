import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setViewport } from '../../../test/viewport';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LifecycleCard } from './LifecycleCard';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio } from '../../../features/organizations/testPortfolio';

const base = buildPortfolio(new URLSearchParams()).summary;
const summary = {
  ...base,
  lifecycle: [
    { value: 'onboarding' as const, label: 'Onboarding', count: 4, arr: 0 },
    { value: 'adoption' as const, label: 'Adoption', count: 9, arr: 0 },
    { value: 'renewal' as const, label: 'Renewal', count: 2, arr: 0 },
    { value: 'expansion' as const, label: 'Expansion', count: 1, arr: 0 },
    { value: 'churn' as const, label: 'Churn', count: 0, arr: 0 },
  ],
};

afterEach(resetViewport);

describe('LifecycleCard (spec §4.3: more than three rows leave the tile row)', () => {
  it('lists every stage with a count as a filter, full labels, in one card', async () => {
    setViewport(1440);
    const onFilter = vi.fn();
    render(<LifecycleCard summary={summary} params={parseParams(new URLSearchParams())} onFilter={onFilter} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Lifecycle' })).toBeInTheDocument();
    const onboarding = screen.getByRole('button', { name: /Onboarding\s*4/ });
    expect(onboarding).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /Churn/ })).toBeNull();
    await userEvent.click(onboarding);
    expect(onFilter).toHaveBeenCalledWith({ lifecycle: ['onboarding'] });
  });

  it('is always open from sm, with no toggle', () => {
    setViewport(1440);
    render(<LifecycleCard summary={summary} params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Lifecycle' })).toBeNull();
    expect(screen.getByRole('button', { name: /Adoption\s*9/ })).toBeInTheDocument();
  });

  it('is a collapsed disclosure below sm, opened by its header', async () => {
    setViewport(390);
    render(<LifecycleCard summary={summary} params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Lifecycle' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(screen.queryByRole('button', { name: /Adoption/ })).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The controlled body exists while shown, one plain padded block.
    const body = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(body).not.toBeNull();
    expect(body).toHaveClass('px-4', 'pb-4');
    expect(body!.className).not.toMatch(/contents|pt-4/);
    expect(screen.getByRole('button', { name: /Adoption\s*9/ })).toBeInTheDocument();
  });
});
