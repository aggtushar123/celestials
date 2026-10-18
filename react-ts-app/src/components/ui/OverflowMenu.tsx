import { MoreHorizontal } from 'lucide-react';
import { Menu, type MenuItem } from './Menu';
import { ICON_BUTTON } from './styles';

/** An action a toolbar or page header offers: a label and what it does. */
export type UiAction = MenuItem;

/** The ⋯ menu that holds the actions without room of their own ("More
 *  actions"). Renders nothing when it would be empty. Reuses the app's one
 *  menu button (keyboard, focus return, dismiss). */
export function OverflowMenu({ label = 'More actions', items }: { label?: string; items: UiAction[] }) {
  if (items.length === 0) return null;
  return <Menu label={label} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />} triggerClassName={ICON_BUTTON} items={items} />;
}
