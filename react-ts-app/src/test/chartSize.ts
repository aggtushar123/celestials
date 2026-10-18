import { afterAll, beforeAll } from 'vitest';

/**
 * jsdom reports a zero-size box for every element, and Recharts'
 * `ResponsiveContainer` draws nothing (axes, labels, legend) below a real
 * size. Call this at the top of a test file to give every element a
 * `width` x `height` box for that file, restored afterwards, so the chart's
 * axis titles and ticks can be asserted on.
 */
export function sizeCharts(width = 600, height = 320): void {
  const keys = ['getBoundingClientRect', 'clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    for (const key of keys) saved.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width, height, top: 0, left: 0, bottom: height, right: width, x: 0, y: 0, toJSON() {} }),
    });
    for (const key of ['clientWidth', 'offsetWidth'] as const) {
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: width });
    }
    for (const key of ['clientHeight', 'offsetHeight'] as const) {
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: height });
    }
  });

  afterAll(() => {
    for (const key of keys) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  });
}
