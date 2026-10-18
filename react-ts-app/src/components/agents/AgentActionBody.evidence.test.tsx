import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ACT_LIFECYCLE } from '../../features/agents/testAgentsFixtures';
import { Figured } from '../brain/Figured';
import { AgentActionBody } from './AgentActionBody';

// UI broken-things fix 10: the evidence line read as a debug dump, its
// internal keys shown, its words run together and its text in columns.

describe('Figured', () => {
  it('wraps the sentence in one inline span, so a flex parent sees a single item', () => {
    const { container } = render(<Figured text="renews 2027-05-15, health good" />);
    expect(container.childNodes).toHaveLength(1);
    expect((container.firstChild as HTMLElement).tagName).toBe('SPAN');
    // The spaces around a figure survive as text.
    expect(container).toHaveTextContent('renews 2027-05-15, health good');
  });

  it('keeps trailing punctuation out of the figure', () => {
    const { container } = render(<Figured text="ARR USD 42,000, due 2026." />);
    const figures = [...container.querySelectorAll('.tabular-nums')].map((el) => el.textContent);
    expect(figures).toEqual(['42,000', '2026']);
  });
});

describe('AgentActionBody evidence', () => {
  it('shows the evidence without internal keys, as flowing text inside its link', () => {
    render(
      <MemoryRouter>
        <AgentActionBody
          action={{
            ...ACT_LIFECYCLE,
            evidence: [
              { label: '- account:11: "Oracle Cloud Division", renews 2027-05-15, health good', link: '/accounts/11' },
              { label: 'Seat utilisation [seat_utilisation]: 59.6%', link: null },
            ],
          }}
        />
      </MemoryRouter>,
    );
    const list = screen.getByRole('list', { name: 'Evidence' });
    const link = within(list).getByRole('link');
    expect(link).toHaveTextContent('Oracle Cloud Division, renews 2027-05-15, health good');
    expect(link).toHaveAttribute('href', '/accounts/11');
    // The link's only child is the one sentence span.
    expect(link.children).toHaveLength(1);
    expect(list).toHaveTextContent('Seat utilisation: 59.6%');
    expect(list.textContent).not.toMatch(/account:11|\[seat_utilisation\]/);
  });
});
