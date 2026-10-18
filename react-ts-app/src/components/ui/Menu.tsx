import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '../../lib/useDismiss';
import { FOCUS, OVERLAY } from './styles';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** A destructive action, in the danger tone. */
  danger?: boolean;
}

/** Gap between the button and its menu (Tailwind's mt-1). */
const GAP = 4;

/** Where a portalled menu sits: fixed to the viewport beside the button,
 *  below it unless it would run off the bottom and fits above, and never
 *  past either side of the viewport. */
function placeFor(button: HTMLElement, menu: HTMLElement, align: 'start' | 'end'): { side: 'top' | 'bottom'; style: CSSProperties } {
  const at = button.getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();
  const viewHeight = window.innerHeight;
  const viewWidth = document.documentElement.clientWidth || window.innerWidth;
  const side = at.bottom + GAP + height > viewHeight && at.top - GAP - height >= 0 ? 'top' : 'bottom';
  const wanted = align === 'end' ? at.right - width : at.left;
  const left = Math.max(GAP, Math.min(wanted, viewWidth - width - GAP));
  const style: CSSProperties = { position: 'fixed', left };
  if (side === 'top') style.bottom = viewHeight - at.top + GAP;
  else style.top = at.bottom + GAP;
  return { side, style };
}

/** A menu button (WAI-ARIA): opening focuses the first item; arrows, Home
 *  and End move and wrap; Escape or choosing closes it and returns focus to
 *  the button; Tab or a press outside just closes it. Portalled by default: the menu
 *  renders at the end of the page, fixed beside the button (flipping up when
 *  there is no room below), so a clipping box such as the Canvas board never
 *  cuts it off; Tab then hands focus back to the button. */
export function Menu({
  label,
  trigger,
  triggerClassName,
  items,
  align = 'end',
  portal = true,
}: {
  /** The button's and the menu's accessible name. */
  label: string;
  /** What the button shows: an icon, or an icon and a word. */
  trigger: ReactNode;
  triggerClassName: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<ReturnType<typeof placeFor> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useDismiss(
    [buttonRef, menuRef],
    (reason) => {
      setOpen(false);
      if (reason === 'escape') buttonRef.current?.focus();
    },
    open,
  );

  // A portalled menu is placed before paint, and again if the page scrolls
  // or resizes under it. A wheel outside it (zooming or panning a board such
  // as the Canvas, which moves the button without scrolling) closes it.
  useLayoutEffect(() => {
    if (!open || !portal) return;
    const update = () => {
      if (buttonRef.current && menuRef.current) setPlace(placeFor(buttonRef.current, menuRef.current, align));
    };
    const onWheel = (event: WheelEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      // Closing unmounts the focused item: hand focus back to the button.
      if (menuRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
      setOpen(false);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('wheel', onWheel, { capture: true });
      setPlace(null);
    };
  }, [open, portal, align]);

  // The first item takes focus once the menu shows: a portalled menu stays
  // hidden until placed, and browsers refuse focus to a hidden element.
  const shown = open && (!portal || place !== null);
  useEffect(() => {
    if (shown) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [shown]);

  const onMenuKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      all[(index + all.length) % all.length]?.focus();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(all.length - 1);
    else if (event.key === 'Escape' && portal) {
      // Handled here, not only by the window listener: a portalled menu's
      // owner (the Canvas card) may stop keys from bubbling.
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
    else if (event.key === 'Tab') {
      // A portalled menu sits at the end of the page: Tab from there would
      // leave the page, so focus goes back to the button instead.
      if (portal) {
        event.preventDefault();
        buttonRef.current?.focus();
      }
      setOpen(false);
    }
  };

  const menu = open ? (
    <ul
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      onKeyDown={onMenuKey}
      data-side={portal ? (place?.side ?? 'bottom') : undefined}
      style={portal ? (place?.style ?? { position: 'fixed', visibility: 'hidden' }) : undefined}
      className={
        portal
          ? `z-50 min-w-44 py-1 ${OVERLAY}`
          : `absolute top-full z-30 mt-1 min-w-44 py-1 ${OVERLAY} ${align === 'end' ? 'right-0' : 'left-0'}`
      }
    >
      {items.map((item) => (
        <li key={item.key} role="none">
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
              item.onSelect();
            }}
            className={`flex min-h-11 w-full items-center px-3 text-left text-[13px] hover:bg-subtle active:bg-line-subtle sm:min-h-9 ${FOCUS} ${
              item.danger ? 'text-danger-ink' : 'text-ink'
            }`}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
