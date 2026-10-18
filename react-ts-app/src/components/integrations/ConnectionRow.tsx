import { createContext, useContext, type ReactNode } from 'react';
import { META_DANGER, MetaParts, OverflowMenu, TYPE, type UiAction } from '../ui';

/** Inside a tool's card (owner, 2026-10-16): which part of the tool a row
 *  is, "Your account" or "Workspace", shown in place of its logo and name. */
const PartLabel = createContext<string | null>(null);

export function ConnectionPart({ label, children }: { label: string; children: ReactNode }) {
  return <PartLabel.Provider value={label}>{children}</PartLabel.Provider>;
}

/**
 * One connection on Settings › Connections (spec 2026-10-16 §2): the tool's
 * logo and name, its state in words, one line on what it does, one primary
 * action, and the rest in a ⋯ menu. A form (credentials, an app password)
 * opens underneath, in the same row.
 */
export function ConnectionRow({
  id,
  logo,
  name,
  state,
  stateTone = 'neutral',
  desc,
  action,
  menu = [],
  menuLabel,
  children,
}: {
  id: string;
  logo: ReactNode;
  name: string;
  /** Who or what it is connected as, and how fresh: plain words. */
  state: ReactNode;
  stateTone?: 'neutral' | 'danger';
  desc: string;
  action?: ReactNode;
  menu?: UiAction[];
  menuLabel?: string;
  children?: ReactNode;
}) {
  const part = useContext(PartLabel);
  return (
    <li data-connection={id} className="flex flex-col">
      <div role="group" aria-label={part ?? name} className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        {part ? (
          <p className={`${TYPE.label} w-full sm:w-28 sm:shrink-0`}>{part}</p>
        ) : (
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle ring-1 ring-line-subtle">
            {logo}
          </span>
        )}
        <div className="flex min-w-[10rem] flex-1 flex-col">
          {part ? null : <p className={`${TYPE.body} font-semibold`}>{name}</p>}
          <p data-state="" className={stateTone === 'danger' ? META_DANGER : TYPE.meta}>
            {state}
          </p>
          <p className={TYPE.meta}>
            <MetaParts parts={[desc]} />
          </p>
        </div>
        {action}
        {menu.length ? <OverflowMenu label={menuLabel ?? `More for ${name}`} items={menu} /> : null}
      </div>
      {children ? <div className={`border-t border-line-subtle px-4 py-3 ${part ? 'sm:pl-36' : 'sm:pl-16'}`}>{children}</div> : null}
    </li>
  );
}
