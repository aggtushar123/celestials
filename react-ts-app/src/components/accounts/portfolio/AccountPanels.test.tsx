import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DetailsProps } from '../../organizations/portfolio/portfolioKind';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { globexNa, initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountPanels } from './AccountPanels';

function renderPanels(props: Partial<DetailsProps<AccountPortfolioRow>> & { row: AccountPortfolioRow }) {
  return render(
    <MemoryRouter>
      <AccountPanels currency="USD" today="2026-09-29" {...props} />
    </MemoryRouter>,
  );
}
const panel = (key: string) => document.querySelector(`[data-panel="${key}"]`) as HTMLElement;

describe('AccountPanels', () => {
  it('shows the four panels, money in the workspace currency and an overdue renewal on its timeline', () => {
    renderPanels({ row: pizzaEmea });
    for (const title of ['Commercial', 'Voice of the customer', 'Profile', 'History']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(panel('commercial').querySelector('[data-field="arr"]')).toHaveTextContent('$69,600.00');
    const renewal = panel('commercial').querySelector('[data-field="renewalDate"]');
    expect(renewal).toHaveTextContent('9 Aug 2026');
    expect(renewal).toHaveClass('text-danger-ink');
    expect(panel('commercial').querySelector('[data-mark="renewalDate"]')).toHaveClass('bg-danger');
    expect(panel('commercial').querySelector('[data-mark="today"]')).not.toBeNull();
    expect(within(panel('voice')).getByText('Detractor')).toBeInTheDocument();
    expect(panel('voice').querySelector('[data-field="nps"]')).toHaveTextContent('−80');
    expect(panel('voice').querySelector('[data-field="csatScore"]')).toHaveTextContent('62%');
    expect(panel('voice').querySelector('blockquote')).toHaveTextContent('Usage fell after the admin left.');
    expect(panel('history').querySelector('[data-field="csmPulseModifiedAt"]')).toHaveTextContent('18 Sep 2026');
  });

  it('links each organisation the viewer may open, with this account chosen there', () => {
    renderPanels({ row: pizzaEmea });
    expect(within(panel('profile')).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7?account=12');
    expect(within(panel('profile')).getByRole('link', { name: 'Yum Brands' })).toHaveAttribute('href', '/organizations/9?account=12');
    expect(panel('profile').querySelector('[data-field="revenactId"]')).toHaveTextContent('12');
    expect(panel('profile').querySelector('[data-field="industry"]')).toHaveTextContent('Restaurants');
  });

  it('shows a dash for what is not known, and no timeline without a renewal date', () => {
    renderPanels({ row: initechApac });
    expect(panel('commercial').querySelector('[data-mark]')).toBeNull();
    expect(panel('commercial').querySelector('[data-field="renewalDate"]')).toHaveTextContent('—');
    expect(panel('profile').querySelector('[data-field="organizations"]')).toHaveTextContent('—');
    expect(panel('profile').querySelector('[data-field="domain"]')).toHaveTextContent('—');
    expect(within(panel('voice')).getByText('No NPS yet')).toBeInTheDocument();
  });

  it('offers Edit details only when given onEdit, and stacks in one column when asked', async () => {
    const onEdit = vi.fn();
    const { container } = renderPanels({ row: globexNa, onEdit, stacked: true, id: 'details-13' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledWith(13);
    expect(container.querySelector('#details-13')).not.toHaveClass('md:grid-cols-2');
  });

  it('has no Edit details without onEdit', () => {
    renderPanels({ row: globexNa });
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});
