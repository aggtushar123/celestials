import { houseRuleSuite, uiRuleSuite } from '../../test/houseRules';

// Settings › Connections (spec 2026-10-16): the rows on the primitives,
// every house rule and every foundations rule. ConnectSourceForm waits for
// its own round.
const files = import.meta.glob(
  ['./ConnectionRow.tsx', './GmailAccountRow.tsx', './SlackAccountRow.tsx', './JiraAccountRow.tsx', './WorkspaceToolRow.tsx'],
  { query: '?raw', eager: true, import: 'default' },
) as Record<string, string>;

houseRuleSuite('Connections rows: house rules', files);
uiRuleSuite('Connections rows: foundations rules', files);
