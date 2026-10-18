import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over Canvas (spec §2.4): both folders whole.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/canvas/*.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.') && !file.endsWith('/testPages.tsx'));
const BOARD = ['./PersonNode.tsx', './RelationshipEdge.tsx', './MapBoard.tsx', './EdgeLabelMenu.tsx', './NodeMenu.tsx', './PersonCard.tsx', './facts.tsx'];

houseRuleSuite('canvas house rules', files);
rowsIconsTargetsSuite('canvas house rules beyond the shared suite', files);

describe('canvas: coverage, motion, copy, targets', () => {
  it('covers the pages, the board and every edit surface', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/canvas/CanvasPage.tsx',
        '../../pages/canvas/MapEditor.tsx',
        ...BOARD,
        './MapsTab.tsx',
        './NewMapDialog.tsx',
        './PersonPanel.tsx',
        './NotOnMapTray.tsx',
        './AddRelationshipDialog.tsx',
        './PeopleList.tsx',
      ]),
    );
  });

  it('never animates the board (keyboard-driven changes never animate)', () => {
    const offenders = BOARD.filter((file) => /\btransition\b|transition-|animate-|duration|\banimated\b/.test(files[file]));
    expect(offenders).toEqual([]);
  });

  it('gives the node menu a 44px target at every width (spec §2.4)', () => {
    expect(files['./NodeMenu.tsx']).toMatch(/const TRIGGER = `[^`]*\bh-11 w-11\b/);
    expect(files['./NodeMenu.tsx']).not.toMatch(/sm:h-9/);
  });

  it('writes no em dash in its copy', () => {
    expect(sources.filter(([, source]) => source.includes('—')).map(([file]) => file)).toEqual([]);
  });

  it('never stores anything in the browser', () => {
    expect(sources.filter(([, source]) => /localStorage|sessionStorage/.test(source)).map(([file]) => file)).toEqual([]);
  });
});
