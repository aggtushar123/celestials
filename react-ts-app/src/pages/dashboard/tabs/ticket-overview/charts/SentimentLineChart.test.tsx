import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SentimentLineChart } from './SentimentLineChart';
import { SENTIMENT_SERIES } from '../chartTheme';
import { ROLE } from '../../../shared/chartPalette';

describe('SentimentLineChart', () => {
  it('draws negative sentiment as loss and positive as gain', () => {
    expect(SENTIMENT_SERIES.negative.color).toBe(ROLE.loss);
    expect(SENTIMENT_SERIES.positive.color).toBe(ROLE.gain);
  });

  it('names each line in text, not colour alone', () => {
    render(<SentimentLineChart data={[{ date: 'Jan', positive: 3, negative: 1 }]} />);
    expect(screen.getByText('Positive')).toBeInTheDocument();
    expect(screen.getByText('Negative')).toBeInTheDocument();
  });
});
