import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScaleButtons } from './ScaleButtons';

describe('ScaleButtons', () => {
  it('draws one radio per NPS score, 0 to 10, the ends described as Not likely and Very likely', () => {
    render(<ScaleButtons type="nps" value={null} onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(screen.getByRole('radio', { name: '0' })).toHaveAccessibleDescription('Not likely');
    expect(screen.getByRole('radio', { name: '10' })).toHaveAccessibleDescription('Very likely');
    expect(screen.getByRole('radio', { name: '5' })).not.toHaveAccessibleDescription();
  });

  it('reports the chosen score and shows it checked', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ScaleButtons type="csat" value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(onChange).toHaveBeenCalledWith(4);
    rerender(<ScaleButtons type="csat" value={4} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '4' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '4' }).closest('label')).toHaveClass('bg-accent', 'text-on-accent');
  });

  it('gives every score a 44px target in even rows, so no score sits alone on a line', () => {
    const { unmount } = render(<ScaleButtons type="nps" value={null} onChange={vi.fn()} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio.closest('label')).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByRole('radio', { name: '0' }).closest('label')?.parentElement).toHaveClass('grid', 'grid-cols-6');
    unmount();
    const csat = render(<ScaleButtons type="csat" value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '1' }).closest('label')?.parentElement).toHaveClass('grid', 'grid-cols-5');
    csat.unmount();
    render(<ScaleButtons type="ces" value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '1' }).closest('label')?.parentElement).toHaveClass('grid', 'grid-cols-4', 'sm:grid-cols-7');
  });

  it('draws a picture, not a control, in the preview', () => {
    render(<ScaleButtons type="ces" value={null} preview />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('Scores 1 to 7, from Very difficult to Very easy')).toHaveClass('sr-only');
  });
});
