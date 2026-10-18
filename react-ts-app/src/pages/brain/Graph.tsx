import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { BrainBackLink } from '../../components/brain/BrainBackLink';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { OkfExportButton } from '../../components/brain/OkfExportButton';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useScopedRead } from '../../components/brain/useScopedRead';
import { Card, EmptyState as UiEmptyState, ErrorState as UiErrorState, FOCUS, ICON_BUTTON, LoadingState, NUM, QUIET, Select, TYPE } from '../../components/ui';
import { fetchBrainGraph } from '../../features/brain/brainApi';
import { AGENT_LABEL, KIND_LABEL } from '../../features/agents/agentsText';
import { graphHiddenText, SAY } from '../../features/brain/brainText';
import type { ScopeKey } from '../../features/brain/brainTypes';
import type { GraphNode, GraphPayload, NodeKind } from '../../features/graph/graphTypes';
import { applyFilters } from '../../features/graph/filters';
import type { GraphFilters } from '../../features/graph/filters';
import { formatCompactMoney, formatDate } from '../../features/customers/formatters';
import type { CurrencyCode } from '../../features/auth/authSlice';

/**
 * The knowledge graph, drawn as columns rather than a physics simulation:
 * owners → customers → products → decisions. Every node is a real row and
 * every line a real foreign key; the layout is deterministic so the same
 * book always draws the same picture, and nothing jiggles.
 */
const COLUMNS: { kind: NodeKind[]; title: string }[] = [
  { kind: ['owner'], title: 'Account owners' },
  { kind: ['customer'], title: 'Customers' },
  { kind: ['product'], title: 'Products' },
  { kind: ['initiative', 'agent_action'], title: 'Decisions' },
];
const WIDTH = 1080;
const COLUMN_X = [110, 340, 600, 830];
const ROW = 30;
const TOP = 36;

const FILL: Record<string, string> = {
  owner: 'var(--color-ink-muted)',
  product: 'var(--color-accent)',
  initiative: 'var(--color-ink)',
  agent_action: 'var(--color-ink-faint)',
  good: 'var(--color-success)',
  average: 'var(--color-warning)',
  poor: 'var(--color-danger)',
};

/** A node kind as words: its accessible name, its detail and its neighbours. */
const NODE_LABEL: Record<NodeKind, string> = {
  owner: 'owner',
  customer: 'customer',
  product: 'product',
  initiative: 'initiative',
  agent_action: 'agent action',
};

function fillFor(node: GraphNode): string {
  return node.kind === 'customer' ? FILL[node.health_category] : FILL[node.kind];
}

function radiusFor(node: GraphNode): number {
  const arr = 'arr' in node ? node.arr : 0;
  if (!arr) return 6;
  return Math.max(6, Math.min(12, 4 + Math.sqrt(arr) / 60));
}

type Placed = { node: GraphNode; x: number; y: number; r: number };

function layout(data: GraphPayload): { placed: Placed[]; height: number } {
  const placed: Placed[] = [];
  let height = 0;
  COLUMNS.forEach((column, index) => {
    const nodes = data.nodes.filter((n) => column.kind.includes(n.kind));
    nodes.forEach((node, row) => {
      placed.push({ node, x: COLUMN_X[index], y: TOP + row * ROW, r: radiusFor(node) });
    });
    height = Math.max(height, TOP + nodes.length * ROW);
  });
  return { placed, height: Math.max(height, 160) };
}

function Detail({ node, currency, scope, neighbours, onClose }: { node: GraphNode; currency: CurrencyCode; scope: ScopeKey; neighbours: GraphNode[]; onClose: () => void }) {
  const money = (n: number) => formatCompactMoney(n, currency);
  const link =
    node.kind === 'customer' ? { to: `/organizations/${node.id.split(':')[1]}`, label: 'Open the organization' }
    // Final review #3 (minor): these two links carry ?scope= like the others.
    : node.kind === 'initiative' ? { to: `/brain/doing?section=initiatives&scope=${scope}`, label: 'Open initiatives' }
    // The graph draws waiting actions only: the link lands on the bundle in Work.
    : node.kind === 'agent_action' ? { to: `/work/activity?action=${node.action_id}`, label: 'Open in Work' }
    : node.kind === 'product' ? { to: '/settings/products', label: 'Open products' }
    : null;
  return (
    <Card as="aside" aria-label={`Details for ${node.label}`} className="flex w-full shrink-0 flex-col gap-2 lg:w-[300px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={TYPE.meta}>{NODE_LABEL[node.kind]}</div>
          <h3 className={TYPE.title}>{node.label}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className={ICON_BUTTON}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <dl className={`grid grid-cols-2 gap-x-3 gap-y-1 ${TYPE.body}`}>
        {node.kind === 'customer' && (
          <>
            <dt className="text-ink-muted">ARR</dt><dd className={`text-ink ${NUM}`}>{money(node.arr)}</dd>
            <dt className="text-ink-muted">Downside</dt><dd className={`text-ink ${NUM}`}>{money(node.downside)}</dd>
            <dt className="text-ink-muted">Health</dt><dd className="text-ink">{node.health_category}{node.health_score !== null ? ` · ${node.health_score}` : ''}</dd>
            <dt className="text-ink-muted">Risk</dt><dd className={`text-ink ${NUM}`}>{Math.round(node.risk * 100)}%</dd>
            <dt className="text-ink-muted">Renewal</dt>
            <dd className={`text-ink ${NUM}`}>
              {node.days_to_renewal === null ? 'no date' : node.days_to_renewal < 0 ? `overdue by ${-node.days_to_renewal} days` : `in ${node.days_to_renewal} days`}
            </dd>
            <dt className="text-ink-muted">Open tasks</dt><dd className={`text-ink ${NUM}`}>{node.open_tasks}</dd>
          </>
        )}
        {(node.kind === 'product' || node.kind === 'owner') && (
          <>
            <dt className="text-ink-muted">Customers</dt><dd className={`text-ink ${NUM}`}>{node.customers}</dd>
            <dt className="text-ink-muted">ARR</dt><dd className={`text-ink ${NUM}`}>{money(node.arr)}</dd>
            <dt className="text-ink-muted">Downside</dt><dd className={`text-ink ${NUM}`}>{money(node.downside)}</dd>
          </>
        )}
        {node.kind === 'initiative' && (
          <>
            <dt className="text-ink-muted">Status</dt><dd className="text-ink">{node.status}</dd>
            <dt className="text-ink-muted">Metric</dt><dd className="text-ink">{node.metric_label}{node.member_label ? ` · ${node.member_label}` : ''}</dd>
            <dt className="text-ink-muted">Target</dt><dd className={`text-ink ${NUM}`}>{node.target_value ?? 'not set'} by {formatDate(node.target_by)}</dd>
            <dt className="text-ink-muted">Owner</dt><dd className="text-ink">{node.owner ?? 'unassigned'}</dd>
          </>
        )}
        {node.kind === 'agent_action' && (
          <>
            <dt className="text-ink-muted">Agent</dt><dd className="text-ink">{AGENT_LABEL[node.agent]}</dd>
            <dt className="text-ink-muted">Action</dt><dd className="text-ink">{KIND_LABEL[node.action_kind]}</dd>
          </>
        )}
      </dl>
      {neighbours.length > 0 && (
        <div>
          <h4 className={TYPE.label}>Connected to</h4>
          <ul className={`flex flex-col gap-0.5 ${TYPE.bodyMuted}`}>
            {neighbours.map((n) => (
              <li key={n.id}>
                <span className="text-ink-muted">{NODE_LABEL[n.kind]} · </span>{n.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {link && (
        <Link to={link.to} className={`inline-flex min-h-11 items-center ${TYPE.body} font-semibold underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`}>
          {link.label} →
        </Link>
      )}
    </Card>
  );
}

export function GraphPage() {
  const brain = useBrainScope();
  const scope = brain.scope;
  const graph = useScopedRead(scope, fetchBrainGraph, brain.refused, SAY.GRAPH_LOAD);
  const data = graph.data;
  // Plan Decision 11 / brain-polish item 3: owner and product live in the
  // URL (`?owner=`, `?product=`), so the Detail pane's links, a browser
  // back/forward and a reload all land on the same filtered view; reading
  // the params is the source of truth rather than a copy of them in state.
  // `onlyDownside` is not linked anywhere, so it stays local.
  const [params, setSearchParams] = useSearchParams();
  const [onlyDownside, setOnlyDownside] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Final review #1 (important): an old-scope node must never linger in the
  // Detail pane once the reader switches, even when the same id exists in
  // the new scope too. Reset during render when `scope` changes, the
  // documented way to adjust state for a prop change without an effect.
  const [priorScope, setPriorScope] = useState(scope);
  if (scope !== priorScope) {
    setPriorScope(scope);
    setSelected(null);
  }
  const owners = useMemo(() => (data?.nodes ?? []).filter((n) => n.kind === 'owner'), [data]);
  const products = useMemo(() => (data?.nodes ?? []).filter((n) => n.kind === 'product'), [data]);
  const rawOwner = params.get('owner');
  const rawProduct = params.get('product');
  // A filter naming no node in this scope's graph is dropped, not drawn as an
  // empty picture; the raw URL value is not cleared on a scope switch, so a
  // filter naming a node that exists in both scopes survives the switch.
  // Renamed from `active` (final review minor #4): the shadowing trap below,
  // where each edge also computes its own `active` boolean.
  const applied = useMemo<GraphFilters>(
    () => ({
      onlyDownside,
      owner: owners.some((o) => o.id === rawOwner) ? rawOwner : null,
      product: products.some((p) => p.id === rawProduct) ? rawProduct : null,
    }),
    [onlyDownside, rawOwner, rawProduct, owners, products],
  );
  const setFilterParam = useCallback(
    (key: 'owner' | 'product', value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const clearFilters = useCallback(() => {
    setOnlyDownside(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('owner');
        next.delete('product');
        return next;
      },
      { replace: true },
    );
    setSelected(null);
  }, [setSearchParams]);
  const shown = useMemo(() => (data ? applyFilters(data, applied) : null), [data, applied]);
  const { placed, height } = useMemo(() => (shown ? layout(shown) : { placed: [], height: 160 }), [shown]);
  const filtering = applied.onlyDownside || applied.owner !== null || applied.product !== null;
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const neighbourIds = useMemo(() => {
    if (!shown || !selected) return new Set<string>();
    const ids = new Set<string>();
    shown.edges.forEach((e) => {
      if (e.from === selected) ids.add(e.to);
      if (e.to === selected) ids.add(e.from);
    });
    return ids;
  }, [shown, selected]);
  const selectedNode = selected ? byId.get(selected)?.node ?? null : null;
  const dim = (id: string) => selected !== null && id !== selected && !neighbourIds.has(id);

  let body: ReactNode;
  if (brain.error)
    body = (
      <Card pad="none">
        <UiErrorState message={brain.error} onRetry={brain.retry} />
      </Card>
    );
  else if (graph.error)
    body = (
      <Card pad="none">
        <UiErrorState message={graph.error} onRetry={graph.retry} />
      </Card>
    );
  else if (!scope || !data || !shown)
    body = (
      <Card pad="none">
        <LoadingState label={SAY.GRAPH_LOADING} variant="block" />
      </Card>
    );
  else if (data.nodes.length === 0) {
    // Final review #2 (important): a reader without view_all_accounts whose
    // scope holds only customers they can't open must be told so, not that
    // there are none (the twice-filter rule).
    const hidden = graphHiddenText(data.hidden);
    body = (
      <>
        <Card pad="none">
          <UiEmptyState title={hidden ? SAY.GRAPH_EMPTY_FILTERED : SAY.GRAPH_EMPTY} detail={SAY.GRAPH_EMPTY_DETAIL} />
        </Card>
        {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
      </>
    );
  } else {
    const hidden = graphHiddenText(data.hidden);
    body = (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`flex min-h-11 items-center gap-2 sm:min-h-9 ${TYPE.body}`}>
            <input
              type="checkbox"
              checked={applied.onlyDownside}
              onChange={(e) => setOnlyDownside(e.target.checked)}
              className={`h-4 w-4 accent-accent ${FOCUS}`}
            />
            Only accounts carrying downside
          </label>
          <Select
            label="Owner"
            labelPosition="inline"
            value={applied.owner ?? ''}
            onChange={(value) => setFilterParam('owner', value || null)}
            options={[{ value: '', label: 'Everyone' }, ...owners.map((o) => ({ value: String(o.id), label: o.label }))]}
          />
          <Select
            label="Product"
            labelPosition="inline"
            value={applied.product ?? ''}
            onChange={(value) => setFilterParam('product', value || null)}
            options={[{ value: '', label: 'All products' }, ...products.map((p) => ({ value: String(p.id), label: p.label }))]}
          />
          {filtering && (
            <button type="button" onClick={clearFilters} className={QUIET}>
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <Card pad="none" className="min-w-0 flex-1 overflow-x-auto">
            {shown.nodes.length === 0 && (
              <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>No accounts match these filters.</p>
            )}
            <svg viewBox={`0 0 ${WIDTH} ${height + 12}`} width="100%" style={{ minWidth: 720 }} role="img" aria-label="Knowledge graph">
              {COLUMNS.map((column, index) => (
                <text key={column.title} x={COLUMN_X[index]} y={16} textAnchor="middle" className="fill-[var(--color-ink-muted)]" style={{ fontSize: 11, fontWeight: 600 }}>
                  {column.title}
                </text>
              ))}
              {shown.edges.map((edge) => {
                const a = byId.get(edge.from);
                const b = byId.get(edge.to);
                if (!a || !b) return null;
                const [l, r] = a.x <= b.x ? [a, b] : [b, a];
                const mid = (l.x + r.x) / 2;
                const active = selected !== null && (edge.from === selected || edge.to === selected);
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={`M ${l.x + l.r} ${l.y} C ${mid} ${l.y}, ${mid} ${r.y}, ${r.x - r.r} ${r.y}`}
                    fill="none"
                    stroke={active ? 'var(--color-accent)' : 'var(--color-line-strong)'}
                    strokeWidth={active ? 1.8 : 1}
                    opacity={selected !== null && !active ? 0.25 : 1}
                    data-kind={edge.kind}
                  />
                );
              })}
              {placed.map(({ node, x, y, r }) => (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${NODE_LABEL[node.kind]} ${node.label}`}
                  aria-pressed={selected === node.id}
                  onClick={() => setSelected(selected === node.id ? null : node.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(selected === node.id ? null : node.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                  opacity={dim(node.id) ? 0.3 : 1}
                >
                  <circle cx={x} cy={y} r={r} fill={fillFor(node)} stroke={selected === node.id ? 'var(--color-ink)' : 'var(--color-surface)'} strokeWidth={selected === node.id ? 2 : 1.5} />
                  <text x={node.kind === 'owner' ? x - r - 6 : x + r + 6} y={y + 4} textAnchor={node.kind === 'owner' ? 'end' : 'start'} className="fill-[var(--color-ink)]" style={{ fontSize: 11, fontWeight: selected === node.id ? 600 : 400 }}>
                    {node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label}
                  </text>
                </g>
              ))}
            </svg>
          </Card>
          {selectedNode && (
            <Detail
              node={selectedNode}
              currency={data.currency}
              scope={scope}
              neighbours={[...neighbourIds].map((id) => byId.get(id)?.node).filter((n): n is GraphNode => Boolean(n))}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
        <p className={TYPE.meta}>
          Customers are coloured by health; node size follows ARR.{' '}
          {filtering ? `Showing ${shown.nodes.length} of ${data.nodes.length} nodes and ${shown.edges.length} of ${data.edges.length} relations` : `${data.nodes.length} nodes, ${data.edges.length} relations`}, as of {formatDate(data.as_of)}.
        </p>
        {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
      </>
    );
  }

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      <div className="flex min-w-0 flex-col gap-1">
        <BrainBackLink to="/brain" scope={scope} label={SAY.TITLE} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={TYPE.title}>Knowledge graph</h2>
          <OkfExportButton />
        </div>
        <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>
          Who owns what, what runs on which product, where the downside sits, and what has been decided about it. Every node is a real record; every line a real relation. Click a node to see its figures and neighbours.
        </p>
      </div>
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {body}
    </BrainFrame>
  );
}
