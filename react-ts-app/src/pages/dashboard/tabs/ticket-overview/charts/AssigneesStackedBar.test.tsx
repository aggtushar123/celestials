import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssigneesStackedBar } from './AssigneesStackedBar';
import { STATUS_ORDER } from '../chartTheme';
import { DrillProvider } from '../../../drill/DrillContext';

// Recharts' `ResponsiveContainer` measures its own box with
// `getBoundingClientRect`/`clientWidth`/`clientHeight` before it draws
// anything — jsdom returns 0 for all three, so by default the chart (and
// its `<Legend>`) never renders past an empty sized `<div>` (see the note
// in TicketOverview.test.tsx). A fixed-size stub is enough to get recharts
// past that check and render the actual legend markup, which is what this
// test needs: proof the legend text is there, not just that the colour
// values feeding it are distinct (chartPalette.test.ts already covers that).
let boundingRectDescriptor: PropertyDescriptor | undefined;
let clientWidthDescriptor: PropertyDescriptor | undefined;
let clientHeightDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
  boundingRectDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'getBoundingClientRect'
  );
  clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 600,
      height: 320,
      top: 0,
      left: 0,
      bottom: 320,
      right: 600,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 320 });
});

afterAll(() => {
  if (boundingRectDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', boundingRectDescriptor);
  }
  if (clientWidthDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor);
  }
  if (clientHeightDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
  }
});

describe('AssigneesStackedBar', () => {
  it('renders a legend entry for every status, including the two that lost their in-segment count label', () => {
    render(
      <DrillProvider>
        <AssigneesStackedBar
          query=""
          data={[
            {
              name: 'Busy',
              Open: 16,
              'In Progress': 21,
              'On Hold': 10,
              Resolved: 54,
              Closed: 31,
              total: 132,
            },
          ]}
        />
      </DrillProvider>
    );

    for (const status of STATUS_ORDER) {
      expect(screen.getByText(status)).toBeInTheDocument();
    }
  });

  it('offers no drill for a blank-assignee row', () => {
    // The backend's `assignee:<name>` drill needs a real value; an empty
    // assignee name has no such segment, so this row gets no keyboard target.
    render(
      <DrillProvider>
        <AssigneesStackedBar
          query=""
          data={[
            { name: '', Open: 2, 'In Progress': 0, 'On Hold': 0, Resolved: 0, Closed: 0, total: 2 },
            {
              name: 'Busy',
              Open: 16,
              'In Progress': 21,
              'On Hold': 10,
              Resolved: 54,
              Closed: 31,
              total: 132,
            },
          ]}
        />
      </DrillProvider>
    );

    expect(screen.getByRole('button', { name: 'Busy 132, show accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2, show accounts' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
