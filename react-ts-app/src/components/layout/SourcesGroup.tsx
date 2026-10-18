// The Communications group in the sidebar: the inbox, then every source
// connected to the platform, in a pill that opens and closes. Icons only;
// a name shows in a pill beside the icon while the pointer rests on it.
//
// The inbox, then Gmail, Slack and Jira (owner, 2026-10-16), all shown; the
// unconnected ones dimmed and leading to Settings › Connections. The inbox
// goes to /communications; a source goes to /communications?source=<id>,
// which the page reads to narrow the inbox and to give the Copilot its context.

import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchConnectors } from '../../features/connectors/connectorsSlice';
import { fetchMailbox } from '../../features/mail/mailSlice';
import { sourcesFrom } from '../../pages/communications/sources';
import type { Source } from '../../pages/communications/sources';
import { useHoverLabel } from './useHoverLabel';

export function SourcesGroup({ expanded = false }: { expanded?: boolean }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const mailbox = useAppSelector((state) => state.mail?.connection ?? null);
  const connectors = useAppSelector((state) => state.connectors?.items ?? []);

  useEffect(() => {
    dispatch(fetchMailbox());
    dispatch(fetchConnectors());
  }, [dispatch]);

  const sources = useMemo(() => sourcesFrom(mailbox, connectors), [mailbox, connectors]);
  const onPage = location.pathname.startsWith('/communications');
  const activeId = onPage ? (params.get('source') ?? 'all') : null;

  return (
    <div
      className={`rounded-2xl bg-subtle p-1 flex flex-col items-center gap-0.5 ${expanded ? 'w-full' : ''}`}
      role="group"
      aria-label="Communications"
    >
      {sources.map((source) => (
        <SourceButton key={source.id} source={source} active={source.id === activeId} onGo={navigate} expanded={expanded} />
      ))}
    </div>
  );
}

function SourceButton({
  source,
  active,
  onGo,
  expanded = false,
}: {
  source: Source;
  active: boolean;
  onGo: (to: string) => void;
  /** The open phone drawer (phone shell spec 2026-10-06): a phone has no
   *  hover, so show the name as visible text beside the icon, the same
   *  rule Sidebar's own NavItem follows for its `expanded` prop. */
  expanded?: boolean;
}) {
  const name = source.id === 'all' ? 'Communications' : source.label;
  // A channel that is not connected leads to Settings › Connections to connect it.
  const label = source.connected ? name : `Connect ${name}`;
  const to = !source.connected ? '/settings/connections' : source.id === 'all' ? '/communications' : `/communications?source=${encodeURIComponent(source.id)}`;
  const ref = useRef<HTMLButtonElement>(null);
  const hover = useHoverLabel(ref, label);
  return (
    <>
      <button
        ref={ref}
        {...hover.handlers}
        type="button"
        onClick={() => onGo(to)}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        className={`flex items-center rounded-xl transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          expanded ? 'w-full min-h-11 justify-start gap-3 px-3 md:w-11 md:h-11 md:justify-center md:gap-0 md:px-0' : 'w-11 h-11 justify-center'
        } ${active ? 'bg-surface border border-line text-ink shadow-xs' : 'border border-transparent text-ink-muted hover:text-ink hover:bg-subtle'} ${
          source.connected ? '' : 'opacity-40 hover:opacity-70'
        }`}
      >
        <span className="shrink-0 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">{source.icon}</span>
        {expanded && <span className="md:hidden min-w-0 flex-1 truncate text-[13px] font-medium text-left">{label}</span>}
      </button>
      {hover.node}
    </>
  );
}
