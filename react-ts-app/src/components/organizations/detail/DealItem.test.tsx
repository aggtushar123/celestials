import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { Opportunity, Risk } from '../../../features/customers/customersSlice';
import { OPPORTUNITIES, RISKS } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DealItem } from './DealItem';

function renderItem(deal: Opportunity | Risk) {
  const onOpen = vi.fn();
  render(
    <Provider store={makeDetailStore()}>
      <ul>
        <DealItem deal={deal} onOpen={onOpen} />
      </ul>
    </Provider>,
  );
  return onOpen;
}

describe('DealItem (spec 2026-09-27 §3)', () => {
  it('shows the title, stage, priority, department and account, with MRR in compact money', () => {
    renderItem(OPPORTUNITIES[0]);
    const row = screen.getByRole('listitem');
    expect(within(row).getByRole('button', { name: 'EMEA seat expansion' })).toBeInTheDocument();
    expect(within(row).getByText('$1.2K')).toHaveClass('tabular-nums');
    expect(within(row).getByText(/^Negotiation · High priority · Customer Success/)).toBeInTheDocument();
    expect(within(row).getByText('EMEA')).toBeInTheDocument();
    expect(row.querySelector('.font-mono-brand')).toBeNull();
  });

  it('says Whole company when the record has no department, and tags no account when it has none', () => {
    renderItem(OPPORTUNITIES[1]);
    expect(screen.getByText(/· Whole company ·/)).toBeInTheDocument();
    expect(screen.queryByText('Organization')).toBeNull();
  });

  it('renders a risk the same way', () => {
    renderItem(RISKS[0]);
    expect(screen.getByText(/^Open · /)).toBeInTheDocument();
    for (const text of ['$800.0', 'North America']) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('opens on select from its title, stretched over the row', async () => {
    const onOpen = renderItem(OPPORTUNITIES[0]);
    const button = screen.getByRole('button', { name: 'EMEA seat expansion' });
    expect(button).toHaveClass('after:absolute');
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('lines MRR up in its own column in compact money, priority in words, Overdue the only colour', () => {
    render(
      <Provider store={makeDetailStore()}>
        <ul>
          <DealItem deal={{ ...OPPORTUNITIES[0], mrr: '175000', expected_close: '2026-09-25' }} onOpen={vi.fn()} today="2026-09-30" />
        </ul>
      </Provider>,
    );
    const row = document.querySelector('[data-deal]') as HTMLElement;
    expect(row).toHaveClass('@min-[40rem]:grid-cols-[minmax(12rem,1fr)_7rem_15rem]');
    expect(within(row).getByText('$175.0K')).toHaveClass('tabular-nums');
    expect(within(row).getByText('Overdue')).toHaveClass('text-danger-ink');
    expect(within(row).queryByText(/priority$/, { selector: '.rounded-full' })).toBeNull();
  });

  it('adds the date line, and marks an open item past its date Overdue (pipelines spec §1)', () => {
    render(
      <Provider store={makeDetailStore()}>
        <ul>
          <DealItem deal={{ ...OPPORTUNITIES[0], expected_close: '2026-09-25' }} onOpen={vi.fn()} today="2026-09-30" />
          <DealItem deal={{ ...RISKS[0], due_by: '2026-10-20' }} onOpen={vi.fn()} today="2026-09-30" />
          <DealItem deal={OPPORTUNITIES[1]} onOpen={vi.fn()} today="2026-09-30" />
        </ul>
      </Provider>,
    );
    expect(screen.getByText(/· Overdue 5d$/)).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toHaveClass('bg-danger-dim');
    expect(screen.getByText(/· Due in 20d$/)).toBeInTheDocument();
    expect(screen.getByText(/· No date$/)).toBeInTheDocument();
    expect(screen.getAllByText('Overdue')).toHaveLength(1);
  });

  it('names the date a closed item passed, with no Overdue', () => {
    render(
      <Provider store={makeDetailStore()}>
        <ul>
          <DealItem
            deal={{ ...OPPORTUNITIES[1], stage: 'closed_lost', stage_display: 'Closed Lost', expected_close: '2026-09-05' }}
            onOpen={vi.fn()}
            today="2026-09-30"
          />
          <DealItem deal={{ ...RISKS[0], stage: 'mitigated', stage_display: 'Mitigated', due_by: '2026-09-05' }} onOpen={vi.fn()} today="2026-09-30" />
        </ul>
      </Provider>,
    );
    expect(screen.getByText(/· Expected 5 Sep 2026$/)).toBeInTheDocument();
    expect(screen.getByText(/· Due by 5 Sep 2026$/)).toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });
});
