import { useId, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { Card } from './Card';
import { FOCUS, NUM } from './styles';
import { TYPE } from './type';

const WIDTH = 'min-w-[15rem] max-w-80 shrink-0 snap-start sm:min-w-0 sm:max-w-none';

/** A KPI tile (UI foundations spec §4.3): eyebrow label, a display figure,
 *  one meta line, and at most three breakdown rows as `children`. Every
 *  standard tile has the same anatomy, so a row of them is one height.
 *  `onPress` makes a filter tile (`aria-pressed`); `onOpen` a tile that opens
 *  or jumps to more; `to` makes a jump tile (a link; `current` marks the
 *  section on screen). Children inside a button must be inline (`span`). */
export function Tile({
  label,
  value,
  meta,
  action,
  pressed = false,
  onPress,
  onOpen,
  expanded,
  controls,
  buttonLabel,
  to,
  replace = false,
  current = false,
  children,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  /** A filter tile: pressing toggles the list's filter (`aria-pressed`). */
  pressed?: boolean;
  onPress?: () => void;
  /** A tile that opens or jumps to more, with no pressed state. */
  onOpen?: () => void;
  /** With `onOpen`: whether what it opens is showing, and its id. */
  expanded?: boolean;
  controls?: string;
  /** The button's name when label, value and meta do not say what it does. */
  buttonLabel?: string;
  /** A tile that jumps somewhere (a section of the page): a link. `onOpen`
   *  runs on its click too, and `current` marks it as the location. */
  to?: To;
  replace?: boolean;
  current?: boolean;
  children?: ReactNode;
}) {
  const labelId = useId();
  const valueId = useId();
  const labelRow = (withAction: boolean) => (
    <span className="flex min-h-6 items-center justify-between gap-2">
      <span id={labelId} className={TYPE.eyebrow}>
        {label}
      </span>
      {withAction ? action : null}
    </span>
  );
  const figures = (
    <>
      <span id={valueId} className={`mt-1 block ${TYPE.display} ${NUM}`}>
        {value}
      </span>
      {meta ? <span className={`mt-0.5 block ${TYPE.meta} line-clamp-2`}>{meta}</span> : null}
      {children ? <span className="mt-2 flex flex-col gap-0.5">{children}</span> : null}
    </>
  );
  if (to !== undefined) {
    return (
      <Card as="div" pad="none" data-part="tile" className={WIDTH}>
        <Link
          to={to}
          replace={replace}
          aria-current={current ? 'location' : undefined}
          aria-label={buttonLabel}
          onClick={onOpen}
          className={`flex min-h-11 w-full flex-col rounded-xl p-3 text-left hover:bg-subtle active:bg-line-subtle ${current ? 'bg-subtle' : ''} ${FOCUS}`}
        >
          {labelRow(false)}
          {figures}
        </Link>
      </Card>
    );
  }
  const handler = onPress ?? onOpen;
  if (handler) {
    const isPressed = onPress ? pressed : undefined;
    const states = {
      'aria-pressed': isPressed,
      'aria-expanded': onOpen ? expanded : undefined,
      'aria-controls': onOpen && expanded ? controls : undefined,
    };
    if (action) {
      return (
        <Card as="div" pad="none" selected={Boolean(isPressed)} data-part="tile" className={WIDTH}>
          <span className="block px-3 pt-3">{labelRow(true)}</span>
          <button
            type="button"
            {...states}
            aria-label={buttonLabel}
            aria-labelledby={buttonLabel ? undefined : `${labelId} ${valueId}`}
            onClick={handler}
            className={`flex min-h-11 w-full flex-col rounded-b-xl px-3 pb-3 text-left hover:bg-subtle ${FOCUS}`}
          >
            {figures}
          </button>
        </Card>
      );
    }
    return (
      <Card as="div" pad="none" selected={Boolean(isPressed)} data-part="tile" className={WIDTH}>
        <button type="button" {...states} aria-label={buttonLabel} onClick={handler} className={`flex min-h-11 w-full flex-col rounded-xl p-3 text-left hover:bg-subtle ${FOCUS}`}>
          {labelRow(false)}
          {figures}
        </button>
      </Card>
    );
  }
  return (
    <Card as="div" pad="sm" role="group" aria-labelledby={labelId} data-part="tile" className={WIDTH}>
      {labelRow(true)}
      {figures}
    </Card>
  );
}
