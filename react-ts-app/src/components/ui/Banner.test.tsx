import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Banner } from './Banner';

describe('Banner (settings production spec §5.5)', () => {
  it('reads as a note with its sentence', () => {
    render(<Banner tone="warning">Email isn't set up on this server yet.</Banner>);
    expect(screen.getByRole('note')).toHaveTextContent("Email isn't set up on this server yet.");
  });
});
