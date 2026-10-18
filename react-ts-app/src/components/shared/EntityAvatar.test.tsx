import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityAvatar } from './EntityAvatar';

describe('EntityAvatar', () => {
  it('always renders the initials, even before an image load attempt resolves', () => {
    render(<EntityAvatar name="Kraft Heinz" logoUrl="https://logo.clearbit.com/kraftheinz.com" className="w-9 h-9" />);

    expect(screen.getByText('KH')).toBeInTheDocument();
  });

  it('keeps showing the initials fallback after the image fails to load', () => {
    // The real-world case this component exists for: logo.clearbit.com
    // is unreachable outright right now, so every logo <img> fails —
    // this is what a viewer actually sees, not a rare edge case.
    render(<EntityAvatar name="Kraft Heinz" logoUrl="https://logo.clearbit.com/kraftheinz.com" className="w-9 h-9" />);

    const img = screen.getByAltText('Kraft Heinz');
    fireEvent.error(img);

    expect(screen.getByText('KH')).toBeInTheDocument();
    expect(screen.queryByAltText('Kraft Heinz')).not.toBeInTheDocument();
  });

  it('renders just the initials, no <img>, when there is no logo URL at all', () => {
    render(<EntityAvatar name="Kraft Heinz" className="w-9 h-9" />);

    expect(screen.getByText('KH')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to a single initial for a one-word name', () => {
    render(<EntityAvatar name="Oracle" className="w-9 h-9" />);

    expect(screen.getByText('O')).toBeInTheDocument();
  });

  it('picks the same color for the same name every render (deterministic, not random)', () => {
    const { unmount } = render(<EntityAvatar name="Stripe" className="w-9 h-9" />);
    const firstClass = screen.getByText('S').parentElement!.className;
    unmount();

    render(<EntityAvatar name="Stripe" className="w-9 h-9" />);
    const secondClass = screen.getByText('S').parentElement!.className;

    expect(firstClass).toBe(secondClass);
  });
});
