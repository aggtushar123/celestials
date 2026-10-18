import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { sizeCharts } from '../../../test/chartSize';
import {
  HEALTH_STACK,
  emptyStackMarker,
  stackedTotalLabelList,
  topSegment,
} from './stackedTotalLabel';

const data = [
  { Good: 0, Average: 2, Poor: 1, total: 3 },
  { Good: 0, Average: 0, Poor: 0, total: 0 },
];

describe('topSegment', () => {
  it('names the highest segment that has accounts, or nothing for an empty bar', () => {
    expect(topSegment(data[0])).toBe('Average');
    expect(topSegment(data[1])).toBeUndefined();
  });
});

describe('stackedTotalLabelList', () => {
  // A real, sized chart: Recharts hands a LabelList `index` counted over the
  // bars it drew, skipping zero-height ones, not over `data`. Only a render
  // shows whether a total lands on the right column.
  sizeCharts();

  const rows = [
    { name: 'a', Good: 0, Average: 0, Poor: 2, total: 2 },
    { name: 'b', Good: 0, Average: 0, Poor: 0, total: 0 },
    { name: 'c', Good: 4, Average: 0, Poor: 1, total: 5 },
  ];

  const labels = (container: HTMLElement) =>
    [...container.querySelectorAll('.recharts-label-list text')].map((t) => t.textContent);

  it('puts each total on its own column even when a series skips an empty one', () => {
    const { container } = render(
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <XAxis dataKey="name" />
          {HEALTH_STACK.map((status) => (
            <Bar key={status} dataKey={status} stackId="s" isAnimationActive={false}>
              <LabelList {...stackedTotalLabelList(status, rows)} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>,
    );
    // "c"'s Good segment is the first Good bar drawn (index 0), yet its
    // total is 5, not "a"'s 2.
    expect(labels(container)).toEqual(['2', '5']);
  });

  it('takes any stack order, not just the three health bands', () => {
    const stack = ['Open', 'Closed'];
    const tickets = [
      { name: 'a', Open: 2, Closed: 0, total: 2 },
      { name: 'b', Open: 1, Closed: 3, total: 4 },
    ];
    const { container } = render(
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={tickets}>
          <XAxis dataKey="name" />
          {stack.map((status) => (
            <Bar key={status} dataKey={status} stackId="s" isAnimationActive={false}>
              <LabelList {...stackedTotalLabelList(status, tickets, 10, { stack })} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>,
    );
    expect(labels(container)).toEqual(['2', '4']);
  });

  it('puts a horizontal bar\'s total just past its right end', () => {
    const { container } = render(
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" />
          {HEALTH_STACK.map((status) => (
            <Bar key={status} dataKey={status} stackId="s" isAnimationActive={false}>
              <LabelList {...stackedTotalLabelList(status, rows, 10, { horizontal: true })} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>,
    );
    const texts = [...container.querySelectorAll('.recharts-label-list text')];
    expect(texts.map((t) => t.textContent)).toEqual(['2', '5']);
    for (const text of texts) expect(text).toHaveAttribute('text-anchor', 'start');
  });

  it('marks an empty column with a hairline and a zero label', () => {
    const { container } = render(
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <XAxis dataKey="name" />
          {HEALTH_STACK.map((status) => (
            <Bar key={status} dataKey={status} stackId="s" isAnimationActive={false} />
          ))}
          <Bar {...emptyStackMarker(rows.map((r) => r.total), '0')} stackId="s" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>,
    );
    expect(labels(container)).toEqual(['0']);
    const marker = container.querySelectorAll('.recharts-bar')[3].querySelectorAll('path');
    expect(marker).toHaveLength(1);
    expect(marker[0]).toHaveAttribute('name', 'b');
  });
});
