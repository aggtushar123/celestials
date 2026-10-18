import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Phone } from 'lucide-react';
import { IconChip, Initials } from './Avatar';
import { NO_VALUE } from './format';

describe('Avatar (UI foundations spec §3, §7)', () => {
  it('draws initials in the body font, 32px in rows and 44px in headers, hidden from screen readers', () => {
    const { rerender } = render(<Initials text="CB" />);
    const avatar = screen.getByText('CB');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('h-8', 'w-8', 'text-[11px]', 'font-semibold', 'bg-subtle');
    expect(avatar.className).not.toMatch(/font-mono-brand/);
    rerender(<Initials text="CB" size="lg" />);
    expect(screen.getByText('CB')).toHaveClass('h-11', 'w-11', 'text-[13px]');
  });

  it('draws a neutral icon chip', () => {
    const { container } = render(<IconChip icon={Phone} />);
    expect(container.firstElementChild).toHaveClass('h-8', 'w-8', 'rounded-full', 'bg-subtle', 'text-ink-muted');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('exports the no-value mark', () => {
    expect(NO_VALUE).toBe('\u2014');
  });
});
