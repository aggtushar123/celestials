import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LabelChips } from './MailLabels';
import { MAIL_DETAIL } from '../../features/mail/testMail';

describe('LabelChips (Decision 4)', () => {
  it('names every label, with Gmail colour as the dot', () => {
    render(<LabelChips labels={MAIL_DETAIL.labels} />);
    const group = screen.getByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' });
    const renewals = within(group).getByText('Renewals');
    expect(renewals.previousElementSibling).toHaveStyle({ backgroundColor: 'rgb(22, 167, 102)' });
    expect(within(group).getByText('Q4').previousElementSibling).toHaveClass('bg-ink-faint');
  });

  it('shows at most max chips and the rest as +N', () => {
    render(<LabelChips labels={MAIL_DETAIL.labels} max={2} />);
    const group = screen.getByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' });
    expect(within(group).queryByText('Q4')).toBeNull();
    expect(within(group).getByText('+1')).toBeInTheDocument();
  });

  it('ignores a colour that is not #rrggbb, and renders nothing without labels', () => {
    const { container } = render(<LabelChips labels={[{ id: 1, name: 'Odd', color: { background: 'red;position:fixed', text: '' }, pending: false }]} />);
    expect(screen.getByText('Odd').previousElementSibling).not.toHaveAttribute('style');
    container.remove();
    const empty = render(<LabelChips labels={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it('draws a label that is not in Gmail yet with a dashed edge and says so', () => {
    render(<LabelChips labels={[{ id: 12, name: 'Pilot', color: null, pending: true }]} />);
    const chip = screen.getByText('Pilot').parentElement as HTMLElement;
    expect(chip).toHaveClass('border-dashed');
    expect(chip).toHaveAttribute('title', 'Not in Gmail yet');
  });
});
