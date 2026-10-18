import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueueRail, QueueSelect } from './QueueRail';

describe('QueueRail', () => {
  it('marks the open queue and shows counts, none for History or a failed count', () => {
    render(
      <MemoryRouter>
        <QueueRail
          current="team"
          rows={[
            { key: 'mine', label: 'Mine', count: 4 },
            { key: 'team', label: 'My team', count: null },
            { key: 'history', label: 'History', count: null },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Mine 4' })).toHaveAttribute('href', '/work?queue=mine');
    expect(screen.getByRole('link', { name: 'My team' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'History' })).not.toHaveAttribute('aria-current');
  });

  it('counts what needs a customer in a routed queue (round 2 D3 Decision 5)', () => {
    render(
      <MemoryRouter>
        <QueueRail
          current="mine"
          rows={[
            { key: 'mine', label: 'Mine', count: 4, needs_customer: null },
            { key: 'department:cs', label: 'Customer Success', count: 2, needs_customer: 3 },
            { key: 'history', label: 'History', count: null, needs_customer: null },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Customer Success/ })).toHaveTextContent('5');
    expect(screen.getByRole('link', { name: /Customer Success/ })).not.toHaveTextContent('2');
  });

  it('shows the combined count in the phone select option', () => {
    render(
      <MemoryRouter>
        <QueueSelect
          current="mine"
          rows={[
            { key: 'mine', label: 'Mine', count: 4, needs_customer: null },
            { key: 'department:cs', label: 'Customer Success', count: 2, needs_customer: 3 },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('option', { name: 'Customer Success (5)' })).toBeInTheDocument();
  });
});
