import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, HealthBadge, SentimentBadge } from './Badge';

describe('Badge (UI foundations spec §5.7)', () => {
  it('is a small sentence-case pill, neutral by default', () => {
    render(<Badge>Shared</Badge>);
    expect(screen.getByText('Shared')).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-semibold', 'bg-subtle', 'text-ink-muted');
    expect(screen.getByText('Shared').className).not.toMatch(/uppercase/);
  });

  it.each([
    ['success', 'bg-success-dim', 'text-success-ink'],
    ['warning', 'bg-warning-dim', 'text-warning-ink'],
    ['danger', 'bg-danger-dim', 'text-danger-ink'],
    ['info', 'bg-info-dim', 'text-info-ink'],
  ] as const)('tints %s with its dim fill and readable ink', (tone, fill, ink) => {
    render(<Badge tone={tone}>{tone}</Badge>);
    expect(screen.getByText(tone)).toHaveClass(fill, ink);
  });

  it('draws a dot instead of the tint when asked', () => {
    render(
      <Badge tone="danger" dot>
        Overdue
      </Badge>,
    );
    const badge = screen.getByText('Overdue');
    expect(badge).not.toHaveClass('bg-danger-dim');
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveClass('h-1.5', 'w-1.5', 'rounded-full', 'bg-danger');
  });
});

describe('HealthBadge and SentimentBadge: the only tone maps', () => {
  it.each([
    ['good', 'Good', 'bg-success-dim'],
    ['average', 'Average', 'bg-warning-dim'],
    ['poor', 'Poor', 'bg-danger-dim'],
  ] as const)('maps health %s', (band, label, fill) => {
    render(<HealthBadge band={band} />);
    expect(screen.getByText(label)).toHaveClass(fill);
  });

  it.each([
    ['positive', 'Positive', 'bg-success-dim'],
    ['neutral', 'Neutral', 'bg-subtle'],
    ['negative', 'Negative', 'bg-danger-dim'],
  ] as const)('maps sentiment %s', (value, label, fill) => {
    render(<SentimentBadge value={value} />);
    expect(screen.getByText(label)).toHaveClass(fill);
  });

  it('takes its own words', () => {
    render(<HealthBadge band="poor">Risk 55</HealthBadge>);
    expect(screen.getByText('Risk 55')).toHaveClass('bg-danger-dim', 'text-danger-ink');
  });
  it('truncates a long name when asked, keeping the full text in the DOM', () => {
    render(<Badge truncate>Pizza Hut US Operations and Franchise Partners</Badge>);
    const text = screen.getByText('Pizza Hut US Operations and Franchise Partners');
    expect(text).toHaveClass('truncate');
    expect(text.parentElement).toHaveClass('max-w-[10rem]');
  });
});
