import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CanvasRow } from '../../features/canvas/canvasTypes';
import { MapRow } from './MapRow';

const ROW: CanvasRow = {
  id: 301,
  name: 'EMEA buying group',
  record: { kind: 'account', id: 12, name: 'Pizza EMEA' },
  people: 4,
  updated_at: '2026-09-01T10:00:00Z',
  updated_by: null,
};

function renderRow(showRecord: boolean) {
  render(
    <MemoryRouter>
      <ul>
        <MapRow row={ROW} showRecord={showRecord} />
      </ul>
    </MemoryRouter>,
  );
  return screen.getByRole('listitem');
}

describe('MapRow', () => {
  it("names the record with its kind's icon when the list spans records", () => {
    const row = renderRow(true);
    expect(row).toHaveTextContent('Pizza EMEA');
    expect(row.querySelector('p svg')).not.toBeNull();
  });

  it('leaves the record and its icon out when the list is one record', () => {
    const row = renderRow(false);
    expect(row).not.toHaveTextContent('Pizza EMEA');
    expect(row.querySelector('p svg')).toBeNull();
  });
});
