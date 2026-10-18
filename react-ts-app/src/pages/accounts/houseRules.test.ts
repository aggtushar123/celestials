import { houseRuleSuite } from '../../test/houseRules';

// The Accounts pages: the portfolio List and Board, the account page, and their Ask layout.
houseRuleSuite(
  'accounts pages house rules',
  import.meta.glob(['./List.tsx', './Board.tsx', './Details.tsx', './ask/AccountsAskLayout.tsx'], {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
);
