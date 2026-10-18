import { PageHeaderActions } from '../ui';
import { ScopeSwitch } from './ScopeSwitch';
import type { BrainScope } from './useBrainScope';

/** A Brain or Work Team page's scope (brain UI spec 2026-10-06 §1.2; UI
 *  foundations spec §5.3): Me · My team · Company in the bar's actions from
 *  sm, before the Ask controls, and in place at the top of the page below
 *  sm. Nothing until the scope settles. */
export function BrainControls({ brain }: { brain: Pick<BrainScope, 'offered' | 'scope' | 'choose'> }) {
  if (!brain.offered || !brain.scope) return null;
  return (
    <PageHeaderActions>
      <ScopeSwitch scopes={brain.offered.scopes} value={brain.scope} onChange={brain.choose} />
    </PageHeaderActions>
  );
}
