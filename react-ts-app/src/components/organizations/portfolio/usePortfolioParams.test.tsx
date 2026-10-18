import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { usePortfolioParams } from './usePortfolioParams';
import { BOARD_GROUP } from '../../../features/organizations/portfolioParams';

function Probe() {
  const { params, update, clearFilters } = usePortfolioParams();
  const location = useLocation();
  return (
    <div>
      <p data-testid="where">{location.search}</p>
      <p data-testid="health">{params.health.join(',')}</p>
      <button type="button" onClick={() => update({ health: ['poor'] })}>Poor</button>
      <button type="button" onClick={() => update({ group: '' })}>No groups</button>
      <button type="button" onClick={clearFilters}>Clear</button>
    </div>
  );
}

describe('usePortfolioParams', () => {
  it('writes filters to the URL, keeps sort and group when clearing filters', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/list?sort=name&ids=7']}>
        <Probe />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Poor' }));
    expect(screen.getByTestId('health')).toHaveTextContent('poor');
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('health')).toBe('poor');

    await userEvent.click(screen.getByRole('button', { name: 'No groups' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const search = new URLSearchParams(screen.getByTestId('where').textContent!);
    expect(search.get('sort')).toBe('name');
    expect(search.get('group')).toBe('none');
    expect(search.has('health')).toBe(false);
    expect(search.has('ids')).toBe(false);
  });
});

function BoardProbe() {
  const { params, update } = usePortfolioParams(BOARD_GROUP);
  const location = useLocation();
  return (
    <div>
      <p data-testid="where">{location.search}</p>
      <p data-testid="group">{params.group || 'none'}</p>
      <button type="button" onClick={() => update({ health: ['poor'] })}>Poor</button>
      <button type="button" onClick={() => update({ group: 'health' })}>By health</button>
      <button type="button" onClick={() => update({ group: 'lifecycle' })}>By lifecycle</button>
    </div>
  );
}

describe('usePortfolioParams on the Board', () => {
  it('reads an absent group as lifecycle and writes only other groups', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/board']}>
        <BoardProbe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('group')).toHaveTextContent('lifecycle');
    await userEvent.click(screen.getByRole('button', { name: 'Poor' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?health=poor');
    await userEvent.click(screen.getByRole('button', { name: 'By health' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('group')).toBe('health');
    await userEvent.click(screen.getByRole('button', { name: 'By lifecycle' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).has('group')).toBe(false);
    expect(screen.getByTestId('group')).toHaveTextContent('lifecycle');
  });
});

describe('an explicit group carries between the routes (plan pre-flight 1)', () => {
  it("keeps a group=lifecycle picked on the List when the Board filters, though it is the Board's default", async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/board?group=lifecycle']}>
        <BoardProbe />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Poor' }));
    const search = new URLSearchParams(screen.getByTestId('where').textContent!);
    expect(search.get('group')).toBe('lifecycle');
    expect(search.get('health')).toBe('poor');
  });

  it('keeps a group=health picked on the Board when the List filters', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/list?group=health']}>
        <Probe />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Poor' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('group')).toBe('health');
  });
});
