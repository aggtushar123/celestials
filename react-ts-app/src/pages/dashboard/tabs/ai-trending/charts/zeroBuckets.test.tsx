import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrillProvider } from '../../../drill/DrillContext';
import { ActivityTypeDonut } from './ActivityTypeDonut';
import { ActivitySentimentDonut } from './ActivitySentimentDonut';
import { ActivitiesByAIAreaDonut } from './ActivitiesByAIAreaDonut';
import { ActivitiesByAICategoryBar } from './ActivitiesByAICategoryBar';
import { ActivitiesByAISubCategoryBar } from './ActivitiesByAISubCategoryBar';

const data = [
  { key: 'a', name: 'Busy', value: 6 },
  { key: 'b', name: 'Quiet', value: 0 },
];

// A bucket with nothing in it has no accounts behind it: a "Quiet 0, show
// accounts" target would only ever open an empty list.
describe('topic charts offer no drill for an empty bucket', () => {
  it.each([
    ['ActivityTypeDonut', <ActivityTypeDonut data={data} query="" />],
    ['ActivitySentimentDonut', <ActivitySentimentDonut data={data} query="" />],
    ['ActivitiesByAIAreaDonut', <ActivitiesByAIAreaDonut data={data} classified={6} total={6} query="" />],
    ['ActivitiesByAICategoryBar', <ActivitiesByAICategoryBar data={data} classified={6} total={6} query="" />],
    ['ActivitiesByAISubCategoryBar', <ActivitiesByAISubCategoryBar data={data} classified={6} total={6} query="" />],
  ])('%s', (_, chart) => {
    render(<DrillProvider>{chart}</DrillProvider>);
    expect(screen.getByRole('button', { name: 'Busy 6, show accounts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Quiet/ })).not.toBeInTheDocument();
  });
});
