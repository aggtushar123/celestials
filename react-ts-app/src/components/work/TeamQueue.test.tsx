import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { stubBundles } from '../../features/agents/testBundles';
import { BUNDLES } from '../../features/agents/testBundleFixtures';
import { stubUnmatched, ITEM_JIRA } from '../../features/work/testUnmatched';
import { renderWork } from '../../pages/work/testPages';

describe('TeamQueue with "Needs a customer" (round 2 D3 frontend Decision 1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the list, not the empty state, when only messages wait', async () => {
    stubBundles({ bundles: BUNDLES, unassigned: true });
    stubUnmatched({ items: [ITEM_JIRA] });
    renderWork('/work?queue=unassigned');
    expect(await screen.findByRole('region', { name: 'Needs a customer (1)' })).toBeInTheDocument();
    expect(screen.queryByText('Nothing is waiting for an owner.')).toBeNull();
  });

  it('keeps the alert and no empty state when the list fails and the feed is empty', async () => {
    stubBundles({ bundles: BUNDLES, unassigned: true });
    stubUnmatched({ items: [], failList: 1 });
    renderWork('/work?queue=unassigned');
    expect(await screen.findByText('Could not load the messages that need a customer.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing is waiting for an owner.')).toBeNull();
  });

  it('keeps the empty state when neither has anything', async () => {
    stubBundles({ bundles: BUNDLES, unassigned: true });
    stubUnmatched({ items: [] });
    renderWork('/work?queue=unassigned');
    expect(await screen.findByText('Nothing is waiting for an owner.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Needs a customer/ })).toBeNull();
  });
});
