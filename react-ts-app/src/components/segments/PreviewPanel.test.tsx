import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { summaryOf } from '../../features/segments/testSegments';
import { PreviewPanel } from './PreviewPanel';

const data = {
  kind: 'customer' as const,
  count: 41,
  results: [
    { id: 7, name: 'Pizza Hut', owner: { id: 4, name: 'Carl CSM' }, health: { score: 4.9, category: 'average' as const } },
    { id: 2, name: 'Initech', owner: null, health: { score: 3, category: 'poor' as const } },
  ],
  summary: { ...summaryOf(41, 'customer'), entered_7d: null, left_7d: null },
};

describe('PreviewPanel', () => {
  it('says how many match, lists the first ones, the rest as a number, and the totals', () => {
    render(<PreviewPanel kind="customer" state={{ status: 'ready', data }} />);
    expect(document.querySelector('[data-part="match-count"]')).toHaveTextContent('41 organisations match');
    const first = screen.getByRole('list', { name: 'First matches' });
    expect(within(first).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Pizza HutCarl CSM', 'InitechUnassigned']);
    expect(screen.getByText('39')).toHaveClass('tabular-nums');
    expect(screen.getByText('ARR covered').nextSibling).toHaveTextContent('$512.0K');
    expect(screen.queryByText('Last 7 days')).not.toBeInTheDocument();
    // The count says how many already, so there is no Members figure.
    expect(screen.queryByText('Members')).not.toBeInTheDocument();
  });

  it('says nothing matches when the count is nought', () => {
    render(<PreviewPanel kind="customer" state={{ status: 'ready', data: { ...data, count: 0, results: [] } }} />);
    expect(document.querySelector('[data-part="match-count"]')).toHaveTextContent('0 organisations match');
    expect(screen.getByText('Nothing matches these rules yet.')).toBeInTheDocument();
  });

  it('asks for finished conditions, and for fixed rules after a refusal, instead of a count', () => {
    const { unmount } = render(<PreviewPanel kind="contact" state={{ status: 'incomplete' }} />);
    expect(screen.getByText('Finish each condition to see who matches.')).toBeInTheDocument();
    unmount();
    render(<PreviewPanel kind="contact" state={{ status: 'error', message: 'x' }} />);
    expect(screen.getByText('Fix the rules to see who matches.')).toBeInTheDocument();
  });

  it('keeps the last answer, dimmed and busy, while a newer one loads', () => {
    render(<PreviewPanel kind="customer" state={{ status: 'loading', last: data }} />);
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-part="match-count"]')?.parentElement).toHaveClass('opacity-60');
  });
});
