import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ViewTabs } from './ViewTabs';

describe('ViewTabs', () => {
  it('links List and Board carrying the query, the current view marked', () => {
    render(
      <MemoryRouter initialEntries={['/accounts/board?health=poor&sort=-arr']}>
        <ViewTabs label="Accounts views" base="/accounts" value="board" />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Accounts views' });
    expect(within(nav).getByRole('link', { name: 'List' })).toHaveAttribute('href', '/accounts/list?health=poor&sort=-arr');
    const board = within(nav).getByRole('link', { name: 'Board' });
    expect(board).toHaveAttribute('href', '/accounts/board?health=poor&sort=-arr');
    expect(board).toHaveAttribute('aria-current', 'page');
    expect(board).toHaveClass('shrink-0', 'whitespace-nowrap');
  });
});
