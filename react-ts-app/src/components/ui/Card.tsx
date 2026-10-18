import { createContext, useContext, useEffect, type HTMLAttributes, type ReactNode } from 'react';
import { TYPE } from './type';

// How deep the current Card sits. A card inside a card is the one layout
// mistake the owner banned outright (UI foundations spec §4.1, decision 1);
// development builds say so in the console.
const CardDepth = createContext(0);

const PAD = { none: '', sm: 'p-3', md: 'p-4' } as const;

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> {
  as?: 'section' | 'div' | 'article' | 'li' | 'aside';
  /** `none` with the slots below; `sm` for tiles only; `md` by default. */
  pad?: keyof typeof PAD;
  /** Layout only (grid span, width, `min-w-0`, `overflow-hidden`): never
   *  colour, border, radius or shadow. */
  className?: string;
  /** A pressed filter tile (spec §4.3): the subtle fill and the accent ring. */
  selected?: boolean;
  children?: ReactNode;
}

/** The one card (spec §4.1): solid surface, 1px line, rounded-xl, no
 *  shadow. Inside it, group with the slots, `divide-y` or whitespace. */
export function Card({ as: Tag = 'section', pad = 'md', className = '', selected = false, children, ...rest }: CardProps) {
  const depth = useContext(CardDepth);
  useEffect(() => {
    if (import.meta.env.DEV && depth > 0) console.error('Card inside Card');
  }, [depth]);
  const classes = ['rounded-xl border border-line', selected ? 'bg-subtle ring-1 ring-accent' : 'bg-surface', PAD[pad], className].filter(Boolean).join(' ');
  return (
    <CardDepth.Provider value={depth + 1}>
      <Tag {...rest} className={classes}>
        {children}
      </Tag>
    </CardDepth.Provider>
  );
}

/** A card's title row: the title as h{level}, an optional meta beside it,
 *  and one QUIET or ICON_BUTTON action on the right. */
export function CardHeader({ title, level = 2, meta, action, id }: { title: ReactNode; level?: 2 | 3 | 4; meta?: ReactNode; action?: ReactNode; id?: string }) {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 pt-4 pb-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <Heading id={id} className={`${TYPE.title} max-w-full shrink-0 truncate`}>{title}</Heading>
        {meta ? <span className={`${TYPE.meta} truncate`}>{meta}</span> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-4 first:pt-4">{children}</div>;
}

/** A divided block inside the same card, in place of a nested box. */
export function CardSection({ children }: { children: ReactNode }) {
  return <div className="border-t border-line-subtle px-4 py-4">{children}</div>;
}

/** The card's last row: Save sits here when the card is a form. */
export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">{children}</div>;
}
