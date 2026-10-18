import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageScatter } from './UsageScatter';
import { BAND_COLORS, BAND_SHORT } from '../chartTheme';
import type { UsageAccount } from '../../../../../features/usage/usageSlice';

// See AssigneesStackedBar.test.tsx for why this stub is needed: jsdom
// reports a zero-size box for `ResponsiveContainer`, and recharts skips
// drawing anything (legend included) below a real size.
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

const point = (overrides: Partial<UsageAccount>): UsageAccount => ({
  id: 1,
  name: 'Acme',
  owner: 'Carl',
  lifecycle_stage: 'active',
  health_category: 'good',
  utilisation: 50,
  active_seats: 5,
  contracted_seats: 10,
  idle_seats: 5,
  arr: 10000,
  shelfware_arr: 0,
  products: 1,
  renewal_date: null,
  band: 'fair',
  ...overrides,
});

describe('UsageScatter', () => {
  it('renders a legend entry naming every band, including at-capacity and over which both read ink', () => {
    // The legend is built from one `<Scatter name={...}>` per band (one per
    // `BAND_COLORS` key — see UsageScatter.tsx's own comment on `BAND_ORDER`),
    // independent of what's actually plotted — every band's name should
    // appear even though only one point is passed here.
    render(<UsageScatter points={[point({ band: 'at_capacity' })]} currency="USD" />);

    for (const short of Object.values(BAND_SHORT)) {
      expect(screen.getByText(short)).toBeInTheDocument();
    }
  });

  it('at_capacity and over (the two bands the legend has to tell apart on colour alone) are distinct', () => {
    expect(BAND_COLORS.at_capacity).toBeTruthy();
    expect(BAND_COLORS.at_capacity).not.toBe(BAND_COLORS.over);
  });
});
