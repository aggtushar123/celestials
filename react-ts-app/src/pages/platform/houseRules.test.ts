import { houseRuleSuite, uiRuleSuite } from '../../test/houseRules';

// The two-way Gmail card is the portal's first piece on the primitives; the
// rest of the portal keeps .rv-card until its own round.
const files = import.meta.glob('./GmailTwoWayCard.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

houseRuleSuite('Platform › Google two-way mail: house rules', files);
uiRuleSuite('Platform › Google two-way mail: foundations rules', files);
