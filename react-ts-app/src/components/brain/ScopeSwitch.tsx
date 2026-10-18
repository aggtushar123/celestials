import type { ScopeKey, ScopeOption } from '../../features/brain/brainTypes';
import { SegmentedControl, TYPE } from '../ui';

/** Me · My team · Company (spec §2.2): only the scopes the server offered,
 *  one segmented control at every width (UI foundations spec §5.3: three
 *  short options fit a phone). One scope is a label, not a control. */
export function ScopeSwitch({ scopes, value, onChange }: { scopes: ScopeOption[]; value: ScopeKey; onChange: (key: ScopeKey) => void }) {
  if (scopes.length === 1) return <p className={TYPE.bodyMuted}>{scopes[0].label}</p>;
  return (
    <SegmentedControl<ScopeKey>
      label="View"
      value={value}
      options={scopes.map((scope) => ({ value: scope.key, label: scope.label }))}
      onChange={(key) => {
        if (key !== value) onChange(key);
      }}
    />
  );
}
