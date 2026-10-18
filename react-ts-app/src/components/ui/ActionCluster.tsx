import type { ReactNode } from 'react';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { OverflowMenu, type UiAction } from './OverflowMenu';
import { BUTTON, DANGER } from './styles';

/** The right-hand actions of a toolbar or page header (UI foundations spec
 *  §5.6, §6.1): from sm the first two secondary actions as buttons and the
 *  rest in the ⋯ menu; below sm every secondary in the menu. The one
 *  primary always comes last. */
export function ActionCluster({ primary, secondary = [] }: { primary?: ReactNode; secondary?: UiAction[] }) {
  const wide = useMediaQuery(SM);
  const shown = wide ? secondary.slice(0, 2) : [];
  const folded = wide ? secondary.slice(2) : secondary;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {shown.map((action) => (
        <button key={action.key} type="button" onClick={action.onSelect} className={action.danger ? DANGER : BUTTON}>
          {action.label}
        </button>
      ))}
      <OverflowMenu items={folded} />
      {primary}
    </div>
  );
}
