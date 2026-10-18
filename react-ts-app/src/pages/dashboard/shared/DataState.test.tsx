import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading, ErrorState, Empty } from './DataState';

describe('DataState', () => {
  it('loading is announced politely', () => {
    render(<Loading label="Loading forecast…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading forecast…');
  });
  it('error is an alert and says nothing partial is shown', () => {
    render(<ErrorState message="Could not load the forecast." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the forecast.');
  });
  it('empty says what is empty', () => {
    render(<Empty label="No tickets in this window." />);
    expect(screen.getByText('No tickets in this window.')).toBeInTheDocument();
  });
});
