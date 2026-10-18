import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SizeSparkline } from './SizeSparkline';

describe('SizeSparkline', () => {
  it('labels the first and last size, and draws a solid line', () => {
    const { container } = render(<SizeSparkline sizes={[1, 2, 2, 3]} />);
    expect(screen.getByRole('img', { name: 'Size over 30 days: 1 to 3' })).toBeInTheDocument();
    expect(container.querySelector('polyline')).not.toBeNull();
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull();
  });

  it('labels a single point as today\'s size with no history, and draws the dashed line', () => {
    const { container } = render(<SizeSparkline sizes={[3]} />);
    expect(screen.getByRole('img', { name: 'Size today: 3, no history yet' })).toBeInTheDocument();
    expect(container.querySelector('line[stroke-dasharray]')).not.toBeNull();
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('says there is no history before the first evaluation', () => {
    const { container } = render(<SizeSparkline sizes={[]} />);
    expect(screen.getByRole('img', { name: 'No size history yet' })).toBeInTheDocument();
    expect(container.querySelector('line[stroke-dasharray]')).not.toBeNull();
  });
});
