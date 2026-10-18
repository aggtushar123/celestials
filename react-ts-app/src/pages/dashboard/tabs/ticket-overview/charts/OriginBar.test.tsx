import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OriginBar } from './OriginBar';
import { DrillProvider } from '../../../drill/DrillContext';
import type { TicketOrigin } from '../../../../../features/tickets/ticketsSlice';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OriginBar drill targets', () => {
  it('gives same-named connectors, and a connector named "Revenact", distinct targets', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data: TicketOrigin[] = [
      { name: 'Support', value: 9, provider: 'zendesk', connector_id: 1 },
      { name: 'Support', value: 7, provider: 'freshdesk', connector_id: 2 },
      { name: 'Revenact', value: 5, provider: 'webhook', connector_id: 3 },
      { name: 'Revenact', value: 3, provider: 'revenact', connector_id: null },
    ];

    render(
      <DrillProvider>
        <OriginBar data={data} query="" />
      </DrillProvider>,
    );

    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    expect(screen.getByRole('button', { name: 'Support (zendesk) 9, show accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Support (freshdesk) 7, show accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revenact (webhook) 5, show accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revenact 3, show accounts' })).toBeInTheDocument();
    const keyWarnings = errors.mock.calls.filter((call) => String(call[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
  });

  it('numbers two connectors that share both name and provider', () => {
    const data: TicketOrigin[] = [
      { name: 'Support', value: 9, provider: 'zendesk', connector_id: 1 },
      { name: 'Support', value: 7, provider: 'zendesk', connector_id: 2 },
    ];

    render(
      <DrillProvider>
        <OriginBar data={data} query="" />
      </DrillProvider>,
    );

    expect(screen.getByRole('button', { name: 'Support (zendesk) 9, show accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Support (zendesk) (2) 7, show accounts' })).toBeInTheDocument();
  });
});
