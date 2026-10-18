import { useRef, useState } from 'react';
import { InlineConfirm } from './InlineConfirm';
import { Switch } from '../ui/Switch';

/** A builder switch whose "on" asks first, in place (spec §2.2: turning a
 *  rule on, and Send without review). Off needs no question. Focus goes
 *  back to the switch either way. */
export function ConfirmedSwitch({ label, checked, onChange, confirm, describedBy }: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  confirm: { title: string; message: string; confirmLabel: string };
  describedBy?: string;
}) {
  const [asking, setAsking] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const settle = (on: boolean) => {
    setAsking(false);
    if (on) onChange(true);
    ref.current?.focus();
  };
  return (
    <div className="flex flex-col gap-2">
      <Switch
        ref={ref}
        checked={checked}
        describedBy={describedBy}
        onChange={(on) => {
          if (asking) return;
          if (on) setAsking(true);
          else onChange(false);
        }}
        className="self-start"
      >
        {label}
      </Switch>
      {asking ? <InlineConfirm {...confirm} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null}
    </div>
  );
}
