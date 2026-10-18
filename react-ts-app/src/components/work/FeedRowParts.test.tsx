import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BUNDLE_ITEM } from '../../features/work/testFeedFixtures';
import { FeedRowMeta } from './FeedRowParts';

describe('FeedRowMeta and the participant view (Decision 7)', () => {
  it('a record the reader may not open is its name, not a link', () => {
    const item = { ...BUNDLE_ITEM, record: { ...BUNDLE_ITEM.record!, can_open: false } };
    render(
      <MemoryRouter>
        <FeedRowMeta item={item} group="decide" />
      </MemoryRouter>,
    );
    expect(screen.getByText(BUNDLE_ITEM.record!.name)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('any other record stays a link', () => {
    render(
      <MemoryRouter>
        <FeedRowMeta item={BUNDLE_ITEM} group="decide" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: BUNDLE_ITEM.record!.name })).toBeInTheDocument();
  });
});
