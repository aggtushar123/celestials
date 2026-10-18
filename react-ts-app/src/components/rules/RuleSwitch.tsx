import { useId, useState } from 'react';
import { updateRule } from '../../features/rules/ruleApi';
import { firstError, ruleErrors } from '../../features/rules/ruleErrors';
import { turnOnText } from '../../features/rules/ruleText';
import type { Rule, RuleRow } from '../../features/rules/ruleTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { Switch } from '../ui/Switch';

const FAILED = 'Could not switch this rule. Try again.';

/** A saved rule's on/off, its owner's only (spec §2.1, §2.3). Turning on
 *  asks first in the shared ConfirmDialog (the row and the page are not
 *  inside a modal); turning off saves at once. A refusal (a rule with no
 *  segment can't be on) shows in the confirm, or under the switch. */
export function RuleSwitch({ rule, onChange }: { rule: RuleRow; onChange: (rule: Rule) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      onChange(await updateRule(rule.id, { is_active: false }));
    } catch (err) {
      setError(firstError(ruleErrors(err, FAILED)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Switch
        checked={rule.is_active}
        onChange={(on) => (on ? setAsking(true) : void turnOff())}
        label={`Run ${rule.name} every night`}
        describedBy={error ? errorId : undefined}
        disabled={busy}
      >
        <span aria-hidden="true">{rule.is_active ? 'On' : 'Off'}</span>
      </Switch>
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] leading-4 text-danger-ink">
          {error}
        </p>
      ) : null}
      {asking ? (
        <ConfirmDialog
          title={`Turn on ${rule.name}?`}
          message={turnOnText(rule.actions, rule.segment)}
          confirmLabel="Turn on"
          onConfirm={async () => {
            try {
              onChange(await updateRule(rule.id, { is_active: true }));
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw firstError(ruleErrors(err, FAILED));
            }
          }}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </div>
  );
}
