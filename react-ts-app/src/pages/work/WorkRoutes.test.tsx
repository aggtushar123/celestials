import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { stubBundles } from '../../features/agents/testBundles';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

describe('WorkRoutes (agent bundles D1 frontend Decision 1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it.each([
    ['/work/mine?task=41', '/work?task=41&queue=mine'],
    ['/work/today?task=41', '/work?task=41&queue=mine'],
    ['/work/recommended', '/work?kind=suggestion&queue=mine'],
    ['/work/team?scope=company', '/work?queue=company'],
    ['/work/team', '/work?queue=team'],
    ['/work/anything', '/work'],
  ])('sends %s to %s', async (from, to) => {
    stubBundles();
    renderWork(from);
    await waitFor(() => expect(where()).toBe(to));
  });

  it('opens a bell task link on Mine', async () => {
    stubBundles();
    renderWork('/work/mine?task=41');
    expect(await screen.findByRole('dialog', { name: 'Call Pizza Hut' })).toBeInTheDocument();
  });
});
