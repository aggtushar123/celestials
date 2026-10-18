import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrillProvider } from '../../../drill/DrillContext';
import { PriorityDonut } from './PriorityDonut';
import { StatusDonut } from './StatusDonut';
import { OriginBar } from './OriginBar';
import { AssigneesStackedBar } from './AssigneesStackedBar';

// A bucket with nothing in it has no accounts behind it: a "Low 0, show
// accounts" target would only ever open an empty list.
describe('ticket charts offer no drill for an empty bucket', () => {
  it('PriorityDonut', () => {
    render(
      <DrillProvider>
        <PriorityDonut
          query=""
          data={[
            { name: 'Low', value: 0 },
            { name: 'High', value: 4 },
          ]}
        />
      </DrillProvider>,
    );
    expect(screen.getByRole('button', { name: 'High 4, show accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Low/ })).not.toBeInTheDocument();
  });

  it('StatusDonut', () => {
    render(
      <DrillProvider>
        <StatusDonut
          query=""
          data={[
            { name: 'Open', value: 3 },
            { name: 'On Hold', value: 0 },
          ]}
        />
      </DrillProvider>,
    );
    expect(screen.getByRole('button', { name: 'Open 3, show accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^On Hold/ })).not.toBeInTheDocument();
  });

  it('OriginBar', () => {
    render(
      <DrillProvider>
        <OriginBar
          query=""
          data={[
            { name: 'Zendesk', value: 5, provider: 'zendesk', connector_id: 1 },
            { name: 'Jira', value: 0, provider: 'jira', connector_id: 2 },
          ]}
        />
      </DrillProvider>,
    );
    expect(screen.getByRole('button', { name: 'Zendesk 5, show accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Jira/ })).not.toBeInTheDocument();
  });

  it('AssigneesStackedBar', () => {
    render(
      <DrillProvider>
        <AssigneesStackedBar
          query=""
          data={[
            { name: 'Busy', Open: 2, 'In Progress': 0, 'On Hold': 0, Resolved: 0, Closed: 0, total: 2 },
            { name: 'Idle', Open: 0, 'In Progress': 0, 'On Hold': 0, Resolved: 0, Closed: 0, total: 0 },
          ]}
        />
      </DrillProvider>,
    );
    expect(screen.getByRole('button', { name: 'Busy 2, show accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Idle/ })).not.toBeInTheDocument();
  });
});
