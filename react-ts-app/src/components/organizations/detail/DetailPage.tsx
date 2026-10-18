import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { detailPanelId, detailTabId } from '../../../features/organizations/detailParams';
import { OrganizationsFrame } from '../../../pages/organizations/OrganizationsFrame';
import { FOCUS, QUIET } from '../portfolio/styles';
import { BUTTON, Card, EmptyState as UiEmptyState, ErrorState as UiErrorState } from '../../ui';

// The shell the organisation page and the account page share (account spec
// 2026-09-29 §2.1: "the organisation page's bleed frame"): the column, the
// centred states, the refresh alert and the tab panels.

/** The page's column: the full width inside the frame's gutter (owner,
 *  2026-09-27). The cap binds only past about 1920px, where lines would
 *  otherwise stretch. Header, tiles, tabs and every panel share its edges. */
const PAGE_COLUMN = 'mx-auto w-full max-w-[1800px]';

/** The column a loaded page stacks its header, tabs and panels in. */
export function DetailColumn({ children }: { children: ReactNode }) {
  return (
    <div data-part="column" className={`${PAGE_COLUMN} flex flex-col gap-3 pb-6`}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <OrganizationsFrame bleed>
      <div className={`${PAGE_COLUMN} py-6`}>{children}</div>
    </OrganizationsFrame>
  );
}

/** A bad id, or one the viewer may not open: the page says so and links back
 *  to its list. */
export function DetailNotFound({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <Centered>
      <Card pad="none">
        <UiEmptyState
          title={title}
          detail="It may have been removed, or you may not have access to it."
          action={
            <Link to={backTo} className={BUTTON}>
              {backLabel}
            </Link>
          }
        />
      </Card>
    </Centered>
  );
}

/** The first read of the row failed: nothing to show but the reason. */
export function DetailLoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Centered>
      <Card pad="none">
        <UiErrorState message={message} detail="Nothing is shown rather than part of this record." onRetry={onRetry} />
      </Card>
    </Centered>
  );
}

/** A reload (after an edit, say) failed: the last row stays, and this says so. */
export function RefreshFailed({ what, error, onRetry }: { what: string; error: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] leading-5 text-danger-ink">
      <span>
        Could not refresh this {what}: {error}
      </span>
      <button type="button" onClick={onRetry} className={QUIET}>
        Try again
      </button>
    </div>
  );
}

/** The panels under the tabs: the active tab's, and every tab visited
 *  before it, hidden (useVisitedTabs). `children` draws one tab's content. */
export function DetailTabPanels<K extends string>({
  idBase,
  tabs,
  active,
  visited,
  children,
}: {
  idBase: string;
  tabs: readonly { key: K }[];
  active: K;
  visited: ReadonlySet<K>;
  children: (key: K) => ReactNode;
}) {
  return (
    <>
      {tabs
        .filter(({ key }) => key === active || visited.has(key))
        .map(({ key }) => (
          <div
            key={key}
            role="tabpanel"
            id={detailPanelId(idBase, key)}
            aria-labelledby={detailTabId(idBase, key)}
            hidden={key !== active}
            tabIndex={0}
            className={`min-w-0 rounded-sm ${FOCUS}`}
          >
            {children(key)}
          </div>
        ))}
    </>
  );
}
