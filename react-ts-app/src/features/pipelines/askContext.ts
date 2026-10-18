import { itemAskQuestion, itemFocusLabel } from '../organizations/detailAskContext';
import type { AskFocus, PipelineFocus, PipelinesContext, PipelinesFilters, PipelinesOrigin } from '../../pages/copilot/types';
import { pipelineChips } from './pipelineChips';
import { PIPELINE_KINDS } from './pipelineKinds';
import { boardPipelineParams, parsePipelineParams, pipelineUrlSearch, type PipelineParams, type PipelineView } from './pipelineParams';
import type { PipelineFilterOptions, PipelineKindKey, PipelineRow } from './pipelineTypes';

// Ask Revenact on Pipelines (spec 2026-09-30 §3): the context a question
// carries, its live chip, the page a History pick reopens, and the item
// "Ask about this" focuses on. Filters go through the page's own URL writer
// and parser, so the question, the chip and the restore read them as the
// page does. The focus label and the prefilled question reuse the story
// Ask's own word templates (`itemFocusLabel` / `itemAskQuestion`) rather
// than repeating them: only the item's own word differs.

const SEPARATOR = ' · ';
const TITLE = 'Pipelines';
const VIEW = /^\/pipelines\/(list|board)\/?$/;

/** Which Pipelines view a path shows; null anywhere else. */
export function pipelinesViewOf(pathname: string): PipelineView | null {
  const match = VIEW.exec(pathname);
  return match ? (match[1] as PipelineView) : null;
}

/** The params as a question carries them: the page's own URL query without
 *  the kind (sent on its own). The Board reads the List's None as stage, its
 *  default, so it never sends `group: 'none'`. */
export function toPipelinesFilters(p: PipelineParams, view: PipelineView): PipelinesFilters {
  const query = pipelineUrlSearch(view === 'board' ? boardPipelineParams(p) : p);
  query.delete('kind');
  return Object.fromEntries(query);
}

/** Filters (with their kind) back to params, through the page's own parser,
 *  so a value the page would not read is dropped the same way. */
export function fromPipelinesFilters(kind: PipelineKindKey, filters: PipelinesFilters): PipelineParams {
  const search = new URLSearchParams();
  if (kind !== 'opportunities') search.set('kind', kind);
  for (const [key, value] of Object.entries(filters)) if (typeof value === 'string' && value) search.set(key, value);
  return parsePipelineParams(search);
}

/** Where the person is on Pipelines, as the server needs it: the kind, the
 *  view and the filters. Never a name or a figure: the server recomputes
 *  the book. No focus: "Ask about this" adds one (`pipelineFocusFor`). */
export function pipelinesContextOf(pathname: string, search: string): PipelinesContext | null {
  const view = pipelinesViewOf(pathname);
  if (view === null) return null;
  const params = parsePipelineParams(new URLSearchParams(search));
  return { surface: 'pipelines', kind: params.kind, view, filters: toPipelinesFilters(params, view) };
}

/** What a page reports so a live chip can name its filters: its own read's
 *  filter options, and the kind that read was of (the options differ by
 *  kind, and a switch lands before the new kind's read). */
export interface PipelinesNames {
  kind: PipelineKindKey;
  options: PipelineFilterOptions;
}

export function isPipelineFocus(focus: AskFocus | null | undefined): focus is PipelineFocus {
  return focus != null && (focus.kind === 'opportunity' || focus.kind === 'risk');
}

/** `focus` when it is an item of `kind`'s own sort, else null. */
export function pipelineFocusFor(focus: AskFocus | null, kind: PipelineKindKey): PipelineFocus | null {
  return isPipelineFocus(focus) && focus.kind === PIPELINE_KINDS[kind].item ? focus : null;
}

export function pipelineFocusOf(row: Pick<PipelineRow, 'kind' | 'id'>): PipelineFocus {
  return { kind: row.kind, id: row.id };
}

/** The focus part of the chip: "This opportunity", "This risk". Reuses the
 *  story Ask's own word template (`itemFocusLabel`) — only the word
 *  differs, and a pipeline focus's `kind` is already the word. */
function pipelineFocusLabel(focus: PipelineFocus): string {
  return itemFocusLabel(focus.kind);
}

/** The question "Ask about this" prefills. The person can edit it. Reuses
 *  the story Ask's own template (`itemAskQuestion`), same reasoning. */
export function pipelineAskQuestion(focus: PipelineFocus): string {
  return itemAskQuestion(focus.kind);
}

/** The chip. A stored context's `label` is the server's and wins — it may
 *  order and word its chips differently (the server's own `filter_labels`),
 *  so the two are never claimed to match. A live one is "Pipelines", the
 *  kind, and the toolbar's own filter chips, named from the reported
 *  options only when they are of this kind. The focus is never in `label`,
 *  so it is always named from `focus`. `filters ?? {}` guards against a
 *  context the withheld-turn fix stripped down before it reaches here (the
 *  real contract strips the whole context to `null`, never half of it, but
 *  the label function does not rely on that). */
export function pipelinesLabel(context: PipelinesContext, names: PipelinesNames | null = null): string {
  const kind = PIPELINE_KINDS[context.kind];
  const options = names?.kind === context.kind ? names.options : null;
  const base =
    context.label ??
    [
      TITLE,
      kind.title,
      ...pipelineChips(fromPipelinesFilters(context.kind, context.filters ?? {}), options, kind).map((chip) => chip.label),
    ].join(SEPARATOR);
  return context.focus ? `${base}${SEPARATOR}${pipelineFocusLabel(context.focus)}` : base;
}

/** Where a conversation started on Pipelines reopens: its view, with the
 *  page's own query (`kind=risks` first for risks, then the filters in the
 *  page's order, `group=none` for an ungrouped List). Never `/pipelines`,
 *  whose redirect drops the query.
 *
 *  One case does not round-trip the UI exactly (ruling F2): the List's
 *  Closing/Due tile writes an explicit `stage` of the view's own open
 *  stages alongside `date`, and the server's `canonical` drops a `stage`
 *  equal to the List default before storing the origin. A reopen from that
 *  stored, stage-less context lands on the same rows (the List's default
 *  stages are exactly what the tile meant), but the tile itself no longer
 *  reads as active, since `withinOn` needs the explicit stage set to match. */
export function pipelinesPath(origin: PipelinesOrigin): string {
  const query = pipelineUrlSearch(fromPipelinesFilters(origin.kind, origin.filters)).toString();
  return query ? `/pipelines/${origin.view}?${query}` : `/pipelines/${origin.view}`;
}
