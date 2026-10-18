import { useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { MemberStateValue } from '../../features/segments/segmentTypes';
import { Menu } from '../ui/Menu';
import { ICON_BUTTON } from '../ui/styles';

const CHOICES: Record<MemberStateValue, { value: MemberStateValue; label: string }[]> = {
  none: [
    { value: 'pinned', label: 'Pin' },
    { value: 'excluded', label: 'Keep out' },
  ],
  pinned: [
    { value: 'none', label: 'Unpin' },
    { value: 'excluded', label: 'Keep out' },
  ],
  excluded: [{ value: 'none', label: 'Let back in' }],
};

/** A member row's menu (owner only, spec §3): Pin keeps it in whatever the
 *  rules say, Keep out keeps it out. The app's one portalled menu, so a
 *  one-row card (ListCard clips its overflow) never cuts it off; while a
 *  change is saving it is a disabled button. */
export function MemberMenu({
  name,
  state,
  disabled,
  onChoose,
}: {
  name: string;
  state: MemberStateValue;
  disabled: boolean;
  onChoose: (state: MemberStateValue) => void;
}) {
  const label = `Actions for ${name}`;
  const icon = <MoreHorizontal className="h-4 w-4" aria-hidden="true" />;
  const wrapRef = useRef<HTMLSpanElement>(null);
  // Choosing swaps the menu button for a disabled one while it saves, which
  // drops focus to <body>; once saved, the button takes it back (unless
  // focus has gone somewhere on purpose, such as the members count).
  const chose = useRef(false);
  useEffect(() => {
    if (disabled || !chose.current) return;
    chose.current = false;
    if (document.activeElement === document.body) wrapRef.current?.querySelector('button')?.focus();
  }, [disabled]);
  return (
    <span ref={wrapRef} className="contents">
      {disabled ? (
        <button type="button" disabled aria-label={label} className={ICON_BUTTON}>
          {icon}
        </button>
      ) : (
        <Menu
          label={label}
          trigger={icon}
          triggerClassName={ICON_BUTTON}
          items={CHOICES[state].map((choice) => ({
            key: choice.value,
            label: choice.label,
            onSelect: () => {
              chose.current = true;
              onChoose(choice.value);
            },
          }))}
        />
      )}
    </span>
  );
}
