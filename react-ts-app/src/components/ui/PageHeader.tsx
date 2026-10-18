import { useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { ActionCluster } from './ActionCluster';
import type { UiAction } from './OverflowMenu';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { QUIET } from './styles';
import { TYPE } from './type';

/** Below sm the bar wraps and its tabs take a full-width second row (the
 *  Navbar's wrappers dissolve there: UI broken-things fix 1). */
const TAB_ROW = 'h-full min-w-0 max-sm:order-last max-sm:basis-full max-sm:h-11';

/** A page's top bar (UI foundations spec §6.1): the h1 title, or a Back link
 *  (with an sr-only h1 only when `title` is given: a record page names
 *  itself in its content), the page's tabs, and on the right at most two
 *  actions plus the ⋯ menu, the primary last. Inside DashboardLayout it
 *  draws into the Navbar's title slot on the routes that have one; anywhere
 *  else it draws its own bar, transparent on the canvas, whose hairline
 *  shows once the content has scrolled. */
export function PageHeader({
  title,
  titleAs = 'h1',
  back,
  tabs,
  actions,
}: {
  title?: string;
  /** `p` when the page owns its h1 (Settings: each page is named by its
   *  own SettingsFrame heading, and the bar only says where you are). */
  titleAs?: 'h1' | 'p';
  back?: { to: string; label: string };
  tabs?: ReactNode;
  actions?: { primary?: ReactNode; secondary?: UiAction[] };
}) {
  const { titleSlot } = useContext(NavActionsSlotContext);
  const heading = back ? (
    <>
      <nav aria-label="Breadcrumb" className="flex h-full shrink-0 items-center max-sm:h-11">
        {/* Below sm the label is for screen readers only, so the bar keeps
            one row: a 44px chevron, still named for where it goes. */}
        <Link to={back.to} className={`-ml-3 max-sm:min-w-11 ${QUIET}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="max-sm:sr-only">{back.label}</span>
        </Link>
      </nav>
      {title ? <h1 className="sr-only">{title}</h1> : null}
    </>
  ) : title ? (
    titleAs === 'p' ? (
      <p className={`min-w-0 truncate ${TYPE.title}`}>{title}</p>
    ) : (
      <h1 className={`min-w-0 truncate ${TYPE.title}`}>{title}</h1>
    )
  ) : null;
  const cluster = actions ? <ActionCluster primary={actions.primary} secondary={actions.secondary} /> : null;
  // Inside DashboardLayout: a PageHeader on a route missing from the Navbar's titledByPage renders nothing.
  if (titleSlot === undefined) return null;
  if (titleSlot) {
    return createPortal(
      <>
        {heading}
        {tabs ? <div className={TAB_ROW}>{tabs}</div> : null}
        {cluster}
      </>,
      titleSlot,
    );
  }
  return (
    <div data-page-header="" className="relative z-20 flex h-16 shrink-0 items-center gap-3 px-4 border-b border-transparent data-[scrolled]:border-line-subtle">
      <div className="flex h-full min-w-0 flex-1 items-center gap-4">
        {heading}
        {tabs ? <div className="h-full min-w-0 flex-1">{tabs}</div> : null}
      </div>
      {cluster}
    </div>
  );
}

/** A page's own controls in the bar (UI foundations spec §5.3, §6.1), for a
 *  page whose PageHeader a layout draws once above it (Brain, Work): from
 *  sm they sit in the Navbar's actions slot, first, before the Ask
 *  controls; below sm, or with no slot (a page rendered on its own), they
 *  stay in place at the top of the page, where a segmented control still
 *  fits a phone. */
export function PageHeaderActions({ children }: { children: ReactNode }) {
  const { slot } = useContext(NavActionsSlotContext);
  const wide = useMediaQuery(SM);
  if (slot && wide) {
    return createPortal(
      <div data-page-actions="bar" className="order-first mr-3 flex items-center gap-2">
        {children}
      </div>,
      slot,
    );
  }
  return (
    <div data-page-actions="inline" className="flex">
      {children}
    </div>
  );
}

/** While `sentinel` is out of view, the page header shows its hairline. */
function useHeaderHairline(sentinel: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      const header = document.querySelector('[data-page-header]');
      if (!header) return;
      if (entry.isIntersecting) header.removeAttribute('data-scrolled');
      else header.setAttribute('data-scrolled', '');
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      // The Navbar's bar outlives the page: leave no hairline for the next route.
      document.querySelector('[data-page-header]')?.removeAttribute('data-scrolled');
    };
  }, [sentinel]);
}

const WIDTH = { full: '', reading: 'max-w-5xl', form: 'max-w-3xl' } as const;

/** The scrolling content under a PageHeader (spec §6.2): `full` for lists,
 *  boards and detail pages, `reading` for single-column lists, `form` for
 *  builders outside Settings. `pb-8`, so the last card never touches the
 *  viewport. A 1px sentinel at the top tells the header when content has
 *  scrolled under it. */
export function PageBody({ width = 'full', children }: { width?: keyof typeof WIDTH; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useHeaderHairline(sentinel);
  return (
    <div className={`flex w-full flex-col gap-4 px-4 pb-8 ${WIDTH[width]}`.trim()}>
      <div ref={sentinel} aria-hidden="true" data-part="scroll-sentinel" className="-mb-4 h-px" />
      {children}
    </div>
  );
}

/** A scroll column's first child in a frame that is not a PageBody (the
 *  Organizations and Contacts frames): the same hairline trigger. */
export function ScrollSentinel() {
  const sentinel = useRef<HTMLDivElement>(null);
  useHeaderHairline(sentinel);
  return <div ref={sentinel} aria-hidden="true" data-part="scroll-sentinel" className="-mb-px h-px shrink-0" />;
}
