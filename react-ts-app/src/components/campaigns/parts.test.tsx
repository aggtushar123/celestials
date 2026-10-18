import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryStatus, SegmentName, StatusPill } from './parts';

describe('campaign row parts (no colour-only meaning)', () => {
  it('shows a status as a word and tinted only when live, no icon', () => {
    const { container } = render(<StatusPill status="active" />);
    const pill = container.querySelector('[data-status="active"]') as HTMLElement;
    expect(pill).toHaveTextContent('Active');
    expect(screen.getByText('Active')).toHaveClass('bg-success-dim', 'text-success-ink');
    expect(pill.querySelector('svg')).toBeNull();
  });

  it("names a segment with its kind's icon and words, or says there is none", () => {
    const { container, rerender } = render(<SegmentName segment={{ id: 7, name: 'Renewal risk', kind: 'organization' }} />);
    expect(container).toHaveTextContent('Organisations: Renewal risk');
    expect(container.querySelector('.sr-only')).toHaveTextContent('Organisations:');
    rerender(<SegmentName segment={{ id: 9, name: 'Champions', kind: 'contact' }} />);
    expect(container).toHaveTextContent('Contacts: Champions');
    rerender(<SegmentName segment={null} />);
    expect(screen.getByText('No segment')).toBeInTheDocument();
  });

  it("words a delivery's status with an icon", () => {
    const { container } = render(<DeliveryStatus status="skipped" />);
    expect(container).toHaveTextContent('Skipped');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
