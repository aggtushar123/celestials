import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';

// The one shared helper for a person's avatar (Navbar and Sidebar both used
// to inline this, Navbar's own copy falling back to a pravatar.cc network
// request — layout markup cleanup, owner-approved 2026-10-06). A real
// `avatarUrl` renders as an image; without one, a flat initials circle, no
// network request at all.
describe('UserAvatar', () => {
  it('renders the real avatar image when one is given', () => {
    render(<UserAvatar name="Alice Admin" avatarUrl="https://cdn.acme.io/alice.png" className="w-9 h-9 rounded-full" />);
    const img = screen.getByAltText('Alice Admin') as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.src).toBe('https://cdn.acme.io/alice.png');
  });

  it('falls back to the first letter of the name, with no third-party image request', () => {
    render(<UserAvatar name="Alice Admin" email="alice@acme.io" className="w-9 h-9 rounded-full" />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('falls back to the first letter of the email when there is no name', () => {
    render(<UserAvatar email="bob@acme.io" className="w-9 h-9 rounded-full" />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('falls back to "?" when there is neither a name nor an email', () => {
    render(<UserAvatar className="w-9 h-9 rounded-full" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('passes the caller\'s sizing/shape classes through to whichever element renders', () => {
    render(<UserAvatar name="Alice Admin" className="w-9 h-9 rounded-full shrink-0" />);
    expect(screen.getByText('A')).toHaveClass('w-9', 'h-9', 'rounded-full', 'shrink-0');
  });
});
