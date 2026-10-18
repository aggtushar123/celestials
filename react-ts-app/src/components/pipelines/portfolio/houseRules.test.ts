import { houseRuleSuite } from '../../../test/houseRules';

// The Pipelines portfolio (spec 2026-09-30 §1 and §3): its components, its
// two pages, their Ask layout and the shared Ask about this button. The
// older forms and KanbanBoard beside this folder predate the house rules and
// are not scanned (as on Organizations).
houseRuleSuite('pipelines portfolio house rules', {
  ...(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob(
    [
      '../../../pages/pipelines/List.tsx',
      '../../../pages/pipelines/Board.tsx',
      '../../../pages/pipelines/ask/PipelinesAskLayout.tsx',
      '../../copilot/AskAboutButton.tsx',
    ],
    { query: '?raw', eager: true, import: 'default' },
  ) as Record<string, string>),
});
