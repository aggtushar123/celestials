import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScrollTable, ScrollArea } from './ScrollTable';

const table = (
  <table>
    <thead>
      <tr>
        <th>Account</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Acme</td>
      </tr>
    </tbody>
  </table>
);

describe('ScrollTable', () => {
  it('caps its own height and scrolls inside, so the page does not grow', () => {
    render(<ScrollTable caption="Accounts">{table}</ScrollTable>);
    const region = screen.getByRole('region', { name: 'Accounts' });
    expect(region).toHaveClass('overflow-auto');
    expect(region.style.maxHeight).toBe('420px');
    expect(region).toContainElement(screen.getByRole('table'));
  });

  it('takes its own max height', () => {
    render(
      <ScrollTable caption="Accounts" maxHeight={560}>
        {table}
      </ScrollTable>,
    );
    expect(screen.getByRole('region').style.maxHeight).toBe('560px');
  });

  it('pins the header on the surface colour above the rows', () => {
    render(<ScrollTable caption="Accounts">{table}</ScrollTable>);
    expect(screen.getByRole('region')).toHaveClass(
      '[&_thead_th]:sticky',
      '[&_thead_th]:top-0',
      '[&_thead_th]:z-10',
      '[&_thead_th]:bg-surface',
    );
  });

  it('holds a wide table at its minimum width and scrolls sideways instead of squashing it', () => {
    render(
      <ScrollTable caption="Accounts" minWidth={680}>
        {table}
      </ScrollTable>,
    );
    const region = screen.getByRole('region');
    expect(region.style.getPropertyValue('--scroll-min-w')).toBe('680px');
    expect(region).toHaveClass('[&>table]:min-w-(--scroll-min-w)');
  });

  it('can be scrolled from the keyboard', async () => {
    render(<ScrollTable caption="Accounts">{table}</ScrollTable>);
    await userEvent.tab();
    expect(screen.getByRole('region')).toHaveFocus();
  });
});

describe('ScrollArea', () => {
  it('caps a list the same way, with no table styling', () => {
    render(
      <ScrollArea label="Needs attention" maxHeight={560}>
        <ol>
          <li>Acme</li>
        </ol>
      </ScrollArea>,
    );
    const region = screen.getByRole('region', { name: 'Needs attention' });
    expect(region).toHaveClass('overflow-y-auto');
    expect(region.style.maxHeight).toBe('560px');
    expect(region).not.toHaveClass('[&_thead_th]:sticky');
    expect(region).toContainElement(screen.getByRole('listitem'));
  });
});
