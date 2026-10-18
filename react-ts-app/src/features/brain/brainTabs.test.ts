import { describe, expect, it } from 'vitest';
import { BRAIN_TABS, brainTabOf, isBrainPath, tabSearch } from './brainTabs';

describe('the Brain bar’s tabs (brain UI spec §1.1)', () => {
  it('lists the questions, Customers last (Waiting moved to Work)', () => {
    expect(BRAIN_TABS.map((tab) => [tab.label, tab.path])).toEqual([
      ['What changed', '/brain'],
      ["What's being done", '/brain/doing'],
      ['Customers', '/brain/customers'],
    ]);
  });

  it.each([
    ['/brain', '/brain'],
    ['/brain/', '/brain'],
    ['/brain/waiting', null],
    ['/brain/doing/', '/brain/doing'],
    ['/brain/customers', '/brain/customers'],
    ['/brain/requests', '/brain/customers'],
    ['/brain/anomalies', '/brain/customers'],
    ['/brain/graph', null],
  ])('lights the right tab on %s', (path, tab) => {
    expect(brainTabOf(path)).toBe(tab);
  });

  it('knows a Brain route from a path that only begins with the same letters', () => {
    expect(['/brain', '/brain/', '/brain/graph'].map(isBrainPath)).toEqual([true, true, true]);
    expect(isBrainPath('/brainstorm')).toBe(false);
  });

  it('carries ?scope= and nothing else', () => {
    expect(tabSearch('?section=plans&scope=team')).toBe('?scope=team');
    expect(tabSearch('?scope=company&product=product%3A4')).toBe('?scope=company');
    expect(tabSearch('?section=asks')).toBe('');
    expect(tabSearch('')).toBe('');
  });
});
