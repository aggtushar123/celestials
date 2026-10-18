import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useDetailParams } from './useDetailParams';

function Probe() {
  const { params, update } = useDetailParams();
  const location = useLocation();
  return (
    <div>
      <p data-testid="where">{location.search}</p>
      <p data-testid="tab">{params.tab}</p>
      <button type="button" onClick={() => update({ tab: 'details' })}>Details</button>
      <button type="button" onClick={() => update({ account: '31' })}>EMEA</button>
      <button type="button" onClick={() => update({ group: 'tickets' })}>Tickets</button>
      <button type="button" onClick={() => update({ tab: 'story' })}>Story</button>
    </div>
  );
}

describe('useDetailParams', () => {
  it('reads and writes the URL, keeping the rest of it', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/7?source=email,ticket']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tab')).toHaveTextContent('story');
    await userEvent.click(screen.getByRole('button', { name: 'EMEA' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?account=31&source=email%2Cticket');
    await userEvent.click(screen.getByRole('button', { name: 'Tickets' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('source')).toBe('ticket');
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByTestId('tab')).toHaveTextContent('details');
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('account')).toBe('31');
    await userEvent.click(screen.getByRole('button', { name: 'Story' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).has('tab')).toBe(false);
  });
});
