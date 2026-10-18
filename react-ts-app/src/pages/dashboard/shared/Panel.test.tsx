import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from './Panel';

describe('Panel (UI foundations spec §8: drawn by Card, same look)', () => {
  it('renders a flat card with its title and action', () => {
    render(
      <Panel title="Needs attention" action={<a href="/x">Open</a>}>
        Rows
      </Panel>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Needs attention' });
    expect(heading).toHaveClass('text-[15px]', 'font-semibold', 'text-ink');
    const card = heading.closest('section')!;
    expect(card).toHaveClass('rounded-xl', 'border', 'border-line', 'bg-surface', 'p-4');
    expect(card.className).not.toMatch(/shadow/);
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByText('Rows')).toBeInTheDocument();
  });

  it('renders no header when it has neither title nor action', () => {
    const { container } = render(<Panel>Only rows</Panel>);
    expect(container.querySelector('header')).toBeNull();
  });
});
