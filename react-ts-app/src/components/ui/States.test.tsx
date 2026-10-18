import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from './States';

describe('LoadingState (UI foundations spec §4.4)', () => {
  it('is a busy status region named for screen readers, never hidden', () => {
    render(<LoadingState label="Loading organizations" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading organizations');
    expect(screen.getByText('Loading organizations')).toHaveClass('sr-only');
    expect(status).not.toHaveAttribute('hidden');
    expect(status.className).not.toMatch(/\bhidden\b/);
    expect(status).toBeVisible();
  });

  it('draws rows divided like the list, three by default, pulsing only with motion allowed', () => {
    const { container } = render(<LoadingState label="Loading" />);
    const rows = container.querySelectorAll('[data-part="skeleton-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass('h-14', 'px-4');
    expect(rows[0].parentElement).toHaveClass('divide-y', 'divide-line-subtle');
    expect(rows[0].firstElementChild).toHaveClass('motion-safe:animate-pulse');
  });

  it('draws tiles or one block when asked', () => {
    const { container, rerender } = render(<LoadingState label="Loading" variant="tiles" count={4} />);
    expect(container.querySelectorAll('[data-part="skeleton-tile"]')).toHaveLength(4);
    rerender(<LoadingState label="Loading" variant="block" />);
    expect(container.querySelector('[data-part="skeleton-block"]')).toHaveClass('h-32');
  });
});

describe('EmptyState', () => {
  it('centres a title, a detail, the icon and one action, in neutral colours', () => {
    render(<EmptyState title="No organizations yet" detail="Add one to start." icon={Inbox} action={<button type="button">Add organization</button>} />);
    expect(screen.getByText('No organizations yet')).toHaveClass('text-[15px]', 'font-semibold', 'text-ink');
    expect(screen.getByText('Add one to start.')).toHaveClass('text-ink-muted', 'max-w-[48ch]');
    expect(screen.getByRole('button', { name: 'Add organization' })).toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(document.body.innerHTML).not.toMatch(/text-(success|warning|danger)/);
  });

  it('is one muted line when inline', () => {
    render(<EmptyState title="No open plans." size="inline" />);
    expect(screen.getByText('No open plans.')).toHaveClass('px-4', 'py-3', 'text-[13px]', 'text-ink-muted');
  });
});

describe('ErrorState', () => {
  it('is an alert with the message, the default detail and Try again', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Could not load organizations." onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load organizations.');
    expect(alert).toHaveTextContent('Nothing is shown rather than a partial list.');
    expect(screen.getByText('Could not load organizations.')).toHaveClass('text-danger-ink');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no retry without a handler', () => {
    render(<ErrorState message="Failed." detail="Ask an admin." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Ask an admin.')).toBeInTheDocument();
  });
});
