import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { FOCUS } from './styles';
import { ICON_BUTTON, OVERLAY } from '../../ui';
import { useDismiss } from '../../../lib/useDismiss';

/** The menu's tallest height (seven 32px items plus `py-1`) and its gap. */
const MENU_MAX = 224;
const MENU_GAP = 4;
/** Never squeeze the menu below two items: it scrolls instead. */
const MENU_MIN = 88;

/** The part of the screen `el` can actually be seen in: the window,
 *  intersected with every ancestor that clips its overflow (a desktop
 *  column's scroller, the phone panel strip, the page frame). A column that
 *  runs past the bottom of the window only counts down to the window. */
function visibleBox(el: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = window.getComputedStyle(node);
    if (/auto|scroll|hidden|clip/.test(`${overflowX} ${overflowY}`)) {
      const bounds = node.getBoundingClientRect();
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }
  return { top, bottom };
}

/** Where the menu goes. It hangs off the button (absolutely positioned, no
 *  portal), so it opens on whichever side of the button has room inside the
 *  visible box, preferring below, and its height is capped to that room (it
 *  scrolls) so no stage is ever cut off. */
function placeMenu(button: HTMLElement): { upward: boolean; maxHeight: number } {
  const box = visibleBox(button);
  const rect = button.getBoundingClientRect();
  const below = box.bottom - rect.bottom - MENU_GAP;
  const above = rect.top - box.top - MENU_GAP;
  const upward = below < MENU_MAX && above > below;
  const room = upward ? above : below;
  return { upward, maxHeight: Math.max(MENU_MIN, Math.min(MENU_MAX, room)) };
}

/** A card's "Move to…" control. Controller ruling R1, browser finding B1: a
 *  compact icon button that opens a real menu of the other stages, so nothing moves
 *  until one is chosen. Arrow Up/Down, Home and End move
 *  between items. Escape and choosing an item close the menu and return
 *  focus to the button. A press outside closes it and leaves focus where the
 *  user put it, and Tab closes it as focus moves on. Opening another card's
 *  menu closes this one (the press is outside it). `name` is the record's
 *  own ("Pizza Hut", "EMEA seats"). */
export function MoveToMenu({
  name,
  disabled,
  note,
  targets,
  onChoose,
  label,
  menuLabel,
  icon,
}: {
  name: string;
  disabled: boolean;
  note: string | null;
  targets: { value: string; label: string }[];
  onChoose: (to: string) => void;
  /** The button's name; default "Move {name} to…". */
  label?: string;
  /** The menu's name; default "Move {name} to". */
  menuLabel?: string;
  /** The button's icon; default the move arrows. */
  icon?: ReactNode;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState({ upward: false, maxHeight: MENU_MAX });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const closeMenu = () => {
    setOpenMenu(false);
    buttonRef.current?.focus();
  };

  useDismiss([menuRef, buttonRef], (reason) => (reason === 'escape' ? closeMenu() : setOpenMenu(false)), openMenu);

  useEffect(() => {
    if (openMenu) itemRefs.current[activeIndex]?.focus();
  }, [openMenu, activeIndex]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = targets.length - 1;
    const to: Record<string, (i: number) => number> = {
      ArrowDown: (i) => (i + 1) % targets.length,
      ArrowUp: (i) => (i - 1 + targets.length) % targets.length,
      Home: () => 0,
      End: () => last,
    };
    if (to[event.key]) {
      event.preventDefault();
      setActiveIndex(to[event.key]);
    } else if (event.key === 'Tab') {
      // Let the browser move focus on first, then close: unmounting the
      // focused item inside the keydown would leave the Tab nowhere to go.
      window.setTimeout(() => setOpenMenu(false), 0);
    }
  };

  return (
    <span className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={openMenu}
        aria-label={label ?? `Move ${name} to…`}
        title={disabled && note ? note : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setActiveIndex(0);
          if (!openMenu && buttonRef.current) setPlacement(placeMenu(buttonRef.current));
          setOpenMenu((was) => !was);
        }}
        className={ICON_BUTTON}
      >
        {icon ?? <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />}
      </button>
      {openMenu ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menuLabel ?? `Move ${name} to`}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => event.stopPropagation()}
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute right-0 z-20 flex w-44 ${placement.upward ? 'bottom-full mb-1' : 'top-full mt-1'} flex-col overflow-y-auto py-1 ${OVERLAY}`}
        >
          {targets.map((target, index) => (
            <button
              key={target.value}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                onChoose(target.value);
                closeMenu();
              }}
              className={`flex min-h-11 sm:min-h-8 shrink-0 items-center px-3 text-left text-[13px] text-ink hover:bg-subtle focus-visible:bg-subtle ${FOCUS}`}
            >
              {target.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
