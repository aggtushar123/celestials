import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardBody, CardFooter, CardHeader, CardSection } from './Card';

describe('Card (UI foundations spec §4.1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a flat surface: rounded-xl, 1px line, no shadow, p-4 by default', () => {
    render(<Card aria-label="Plain">Body</Card>);
    const card = screen.getByRole('region', { name: 'Plain' });
    expect(card.tagName).toBe('SECTION');
    expect(card).toHaveClass('rounded-xl', 'border', 'border-line', 'bg-surface', 'p-4');
    expect(card.className).not.toMatch(/shadow/);
  });

  it('takes its element, padding and layout classes', () => {
    const { container } = render(
      <ul>
        <Card as="li" pad="none" className="min-w-0">
          Row
        </Card>
      </ul>,
    );
    const card = container.querySelector('li')!;
    expect(card).toHaveClass('min-w-0');
    expect(card.className).not.toMatch(/\bp-\d/);
    render(<Card as="div" pad="sm" data-testid="tile">Tile</Card>);
    expect(screen.getByTestId('tile')).toHaveClass('p-3');
  });

  it('draws a selected card with the subtle fill and the accent ring instead of the surface', () => {
    render(<Card selected data-testid="on">On</Card>);
    expect(screen.getByTestId('on')).toHaveClass('bg-subtle', 'ring-1', 'ring-accent');
    expect(screen.getByTestId('on')).not.toHaveClass('bg-surface');
  });

  it('says so in development when a card is put inside a card', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Card>Alone</Card>);
    expect(error).not.toHaveBeenCalled();
    render(
      <Card>
        <Card>Nested</Card>
      </Card>,
    );
    expect(error).toHaveBeenCalledWith('Card inside Card');
  });

  it('lays out the slots: header with title, meta and action, body, section and footer', () => {
    render(
      <Card pad="none" aria-label="Slots">
        <CardHeader title="Average" meta="4 · $245K" action={<button type="button">Open</button>} />
        <CardBody>First</CardBody>
        <CardSection>Divided</CardSection>
        <CardFooter>
          <button type="button">Save</button>
        </CardFooter>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Average' })).toHaveClass('text-[15px]', 'font-semibold');
    expect(screen.getByText('4 · $245K')).toHaveClass('text-[11px]', 'text-ink-muted');
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByText('Divided')).toHaveClass('border-t', 'border-line-subtle', 'px-4', 'py-4');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('justify-end', 'border-t');
  });

  it('heads at the level asked for', () => {
    render(<CardHeader title="Inside a section" level={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Inside a section' })).toBeInTheDocument();
  });
  it("gives the header's heading an id when asked, for aria-labelledby", () => {
    render(<CardHeader title="Details" id="details-heading" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toHaveAttribute('id', 'details-heading');
  });
});
