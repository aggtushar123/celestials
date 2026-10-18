import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SAY } from '../../features/brain/brainText';
import { COMPANY, COMPANY_FIRST } from '../../features/brain/testBrainFixtures';
import { MeasureTable } from './MeasureTable';

const row = (label: string) => within(screen.getByRole('list', { name: SAY.MEASURE })).getAllByRole('listitem').find((li) => li.textContent?.startsWith(label)) as HTMLElement;

describe('Everything we measure (spec §2.3 item 4)', () => {
  it('lists every metric with then, now and change, small moves included', () => {
    render(<MeasureTable changed={COMPANY} />);
    expect(within(screen.getByRole('list', { name: SAY.MEASURE })).getAllByRole('listitem')).toHaveLength(5);
    expect(row('ARR')).toHaveTextContent('Then$702.0KNow$688.6KChangedown $13.4K');
    expect(within(row('ARR')).getByText('down $13.4K')).toHaveClass('text-danger-ink', 'tabular-nums');
    expect(within(row('Net revenue retention')).getByText('down 4 pts')).toBeInTheDocument();
  });

  it('reads null as Not measured, never zero', () => {
    render(<MeasureTable changed={COMPANY} />);
    expect(within(row('Weekly active usage')).getAllByText(SAY.NOT_MEASURED)).toHaveLength(2);
    expect(within(row('Weekly active usage')).getByText(SAY.NOT_COMPARED)).toBeInTheDocument();
  });

  it('reads Not compared before the first month-end (Decision 8)', () => {
    render(<MeasureTable changed={COMPANY_FIRST} />);
    expect(within(row('ARR')).getByText(SAY.NOT_COMPARED)).toBeInTheDocument();
  });

  it('stacks each row on phones: column heads from sm, labels in each row below it', () => {
    render(<MeasureTable changed={COMPANY} />);
    expect(screen.getByText('Metric').parentElement).toHaveClass('hidden', 'sm:grid');
    expect(screen.getByRole('list', { name: 'Everything we measure' }).parentElement).toHaveClass('rounded-xl', 'border-line');
    expect(within(row('ARR')).getByText('Then')).toHaveClass('sm:sr-only');
  });
});
