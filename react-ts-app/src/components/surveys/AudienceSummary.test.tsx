import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AudienceCounts } from '../../features/surveys/surveyTypes';
import { AudienceSummary } from './AudienceSummary';

const COUNTS: AudienceCounts = { audience: 42, organisations: 18, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0, hidden_count: 3, limit: 500 };

describe('AudienceSummary (spec §2.2)', () => {
  it("reads who it reaches, the skips and those the builder can't open, figures in tabular figures", () => {
    const { container } = render(<AudienceSummary state={{ status: 'ready', data: COUNTS }} kind="customer" />);
    const region = screen.getByRole('region', { name: 'Who it reaches' });
    expect(region.querySelector('[data-part="reach"]')).toHaveTextContent('42 people at 18 organisations');
    expect(region.querySelector('[data-part="skips"]')).toHaveTextContent('6 skipped (surveyed in the last 30 days) · 2 without an email');
    expect(region.querySelector('[data-part="hidden"]')).toHaveTextContent("3 in the segment you can't open aren't included");
    expect(region.querySelector('[data-part="blocker"]')).toBeNull();
    expect([...container.querySelectorAll('.tabular-nums')].map((node) => node.textContent)).toEqual(['42', '18', '6', '2', '3']);
  });

  it('says accounts for an account segment', () => {
    render(<AudienceSummary state={{ status: 'ready', data: { ...COUNTS, organisations: 1 } }} kind="account" />);
    expect(document.querySelector('[data-part="reach"]')).toHaveTextContent('42 people at 1 account');
  });

  it('says why nobody, or too many, can be sent to', () => {
    const { rerender } = render(<AudienceSummary state={{ status: 'ready', data: { ...COUNTS, audience: 0 } }} kind="contact" />);
    expect(document.querySelector('[data-part="blocker"]')).toHaveTextContent('Nobody to send to.');
    rerender(<AudienceSummary state={{ status: 'ready', data: { ...COUNTS, audience: 612 } }} kind="contact" />);
    expect(document.querySelector('[data-part="blocker"]')).toHaveTextContent('This survey would reach 612 people; the most is 500.');
  });

  it('asks for a segment first, dims the last count while a new one loads, and shows a refusal', () => {
    const { rerender } = render(<AudienceSummary state={{ status: 'incomplete' }} kind={null} />);
    expect(screen.getByText('Choose a segment, and who to ask at each organisation, to see who it reaches.')).toBeInTheDocument();
    rerender(<AudienceSummary state={{ status: 'loading', last: null }} kind="customer" />);
    expect(screen.getByRole('status', { name: 'Counting who it reaches' })).toBeInTheDocument();
    rerender(<AudienceSummary state={{ status: 'loading', last: COUNTS }} kind="customer" />);
    expect(screen.getByRole('region', { name: 'Who it reaches' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-part="reach"]')?.closest('.opacity-60')).not.toBeNull();
    rerender(<AudienceSummary state={{ status: 'error', message: 'Choose at least one role.' }} kind="customer" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one role.');
  });
});
