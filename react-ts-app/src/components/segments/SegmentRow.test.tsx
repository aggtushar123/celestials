import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { listRow, RENEWAL_RISK } from '../../features/segments/testSegments';
import type { SegmentListRow } from '../../features/segments/segmentTypes';
import { OWNER_ONLY } from '../../features/segments/summaryFigures';
import { ListCard } from '../ui';
import { SegmentRow } from './SegmentRow';
import { SEGMENT_GRID } from './segmentGrid';

function renderRow(row: SegmentListRow) {
  render(
    <MemoryRouter>
      <div className="@container">
        <ListCard label="Segments">
          <SegmentRow row={row} />
        </ListCard>
      </div>
    </MemoryRouter>,
  );
  return document.querySelector(`[data-segment="${row.id}"]`)!;
}

describe('SegmentRow on the row anatomy (Impact PR)', () => {
  it('is a flat ListRow on the Segments grid: a flex line below 40rem, the name opens the segment', () => {
    const row = listRow(RENEWAL_RISK);
    const li = renderRow(row);
    expect(li.className).not.toMatch(/rounded-xl|bg-surface/);
    expect(li).toHaveClass('flex', '@min-[40rem]:grid', 'px-4', 'hover:bg-subtle');
    expect(li.className).toContain(SEGMENT_GRID.columns);
    expect(screen.getByRole('link', { name: row.name })).toHaveAttribute('href', `/segments/${row.id}`);
  });

  it('right-aligns the member count in tabular figures and says No change for a quiet day', () => {
    const row: SegmentListRow = { ...listRow(RENEWAL_RISK), member_count: 41, today: { entered: 0, left: 0 } };
    renderRow(row);
    const count = document.querySelector('[data-part="count"]')!;
    expect(count).toHaveClass('text-right', 'tabular-nums');
    expect(count).toHaveTextContent('41');
    const today = document.querySelector('[data-part="today"]')!;
    expect(today).toHaveTextContent('No change');
    expect(within(today as HTMLElement).queryByText('No change')).not.toHaveClass('tabular-nums');
  });

  it('keeps sharing and Paused as words in the meta line, never badges, and repeats the figures there below the breakpoint', () => {
    const row: SegmentListRow = { ...listRow(RENEWAL_RISK), sharing: 'workspace', paused: true, member_count: 41, today: { entered: 2, left: 1 } };
    const li = renderRow(row);
    expect(li.querySelector('.rounded-full')).toBeNull();
    const meta = li.querySelector('p')!;
    expect(meta).toHaveTextContent(/Workspace · Paused/);
    expect(meta.querySelector('.\\@min-\\[40rem\\]\\:hidden')).toHaveTextContent('41 members');
  });

  it("shows the owner-only mark, with its reason for screen readers, for someone else's figures", () => {
    const row: SegmentListRow = { ...listRow(RENEWAL_RISK), member_count: null, today: null, sparkline: null };
    renderRow(row);
    const count = document.querySelector('[data-part="count"]') as HTMLElement;
    expect(within(count).getByText(OWNER_ONLY)).toHaveClass('sr-only');
  });
});
