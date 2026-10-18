import { describe, expect, it } from 'vitest';
import { resolveBrainScope, type BrainScopeReport } from './brainScopeReport';

// Kept free of React so the bridging rule is unit-tested on its own (brain
// ask fix wave, item 2): a tab switch mounts a fresh page, whose own
// useBrainScope briefly knows nothing while it re-fetches. Rather than
// reporting null and flashing "Ask opens once this view loads.", the last
// settled scope anywhere stands in as long as the URL still names it.

describe('resolveBrainScope (brain ask fix wave, item 2)', () => {
  it("uses the current path's own settled scope", () => {
    const reported: BrainScopeReport = { path: '/brain/waiting', scope: 'team' };
    expect(resolveBrainScope(reported, '/brain/waiting', 'team', 'me')).toBe('team');
  });

  it('bridges to the last settled scope while the new path has not reported one yet, if the URL still names it', () => {
    expect(resolveBrainScope(null, '/brain/waiting', 'team', 'team')).toBe('team');
    expect(resolveBrainScope({ path: '/brain', scope: 'team' }, '/brain/waiting', 'team', 'team')).toBe('team');
    expect(resolveBrainScope({ path: '/brain/waiting', scope: null }, '/brain/waiting', 'team', 'team')).toBe('team');
  });

  it('does not bridge once the scope actually changes: the URL no longer names the last settled one', () => {
    expect(resolveBrainScope({ path: '/brain/waiting', scope: null }, '/brain/waiting', 'me', 'team')).toBeNull();
    expect(resolveBrainScope(null, '/brain/waiting', 'me', 'team')).toBeNull();
  });

  it('falls back to null on the current path\'s own failure, even if the URL still names the last settled scope', () => {
    expect(resolveBrainScope({ path: '/brain/waiting', scope: null, failed: true }, '/brain/waiting', 'team', 'team')).toBeNull();
  });

  it('is null before anything has ever settled', () => {
    expect(resolveBrainScope(null, '/brain', null, null)).toBeNull();
    expect(resolveBrainScope({ path: '/brain', scope: null }, '/brain', null, null)).toBeNull();
  });
});
