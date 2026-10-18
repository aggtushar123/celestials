import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollTable } from './ScrollTable';

function table() {
  return (
    <ScrollTable>
      <table aria-label="Credit history">
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </table>
    </ScrollTable>
  );
}

describe('ScrollTable (a table that scrolls sideways shows a fade)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('scrolls sideways with the fade class', () => {
    render(table());
    expect(screen.getByRole('table', { name: 'Credit history' }).parentElement).toHaveClass('overflow-x-auto', 'rv-scroll-fade');
  });

  it('sets data-overflow while the table is wider than its row, so the right edge fades', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(358);
    render(table());
    expect(screen.getByRole('table', { name: 'Credit history' }).parentElement).toHaveAttribute('data-overflow');
  });

  it('leaves data-overflow off when the table fits', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(358);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(358);
    render(table());
    expect(screen.getByRole('table', { name: 'Credit history' }).parentElement).not.toHaveAttribute('data-overflow');
  });
});
