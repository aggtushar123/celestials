import { listScope } from '../../lib/listScope';

// Which page a detail part is on (spec 2026-09-29 §2): an organisation's
// (its roll-up, with account chips) or one account's (every record filed on
// it, no chips). The organisation page names its page with `customerId`, as
// it always has; the account page passes a scope.

export type DetailScope = { kind: 'organization'; id: number } | { kind: 'account'; id: number; name: string };

/** A part is told its page one of two ways, never both. */
export type ScopeProps = { customerId: number; scope?: undefined } | { scope: DetailScope; customerId?: undefined };

/** What a story read takes: a bare organisation id (its original argument) or a scope. */
export type StoryTarget = number | DetailScope;

/** A part's page: the organisation named by `customerId`, or the `scope` it
 *  was given. Never falls back to a made-up id — a caller that gives
 *  neither has a bug, and 0 would silently read (or write) organisation 0. */
export function resolveScope(props: { customerId?: number; scope?: DetailScope }): DetailScope {
  if (props.scope) return props.scope;
  if (props.customerId != null) return { kind: 'organization', id: props.customerId };
  throw new Error('resolveScope: neither a scope nor a customerId was given.');
}

/** The props that name `scope` to a child part. */
export function scopeProps(scope: DetailScope): ScopeProps {
  return scope.kind === 'organization' ? { customerId: scope.id } : { scope };
}

/** The shared list slot a page's reads land under (the thunks' listScope). */
export function scopeSlot(scope: { kind: DetailScope['kind']; id: number }): string {
  return scope.kind === 'organization' ? listScope(scope.id) : listScope(null, scope.id);
}

export function storyScope(target: StoryTarget): DetailScope {
  return typeof target === 'number' ? { kind: 'organization', id: target } : target;
}

/** The story endpoint: the organisation's roll-up, or one account's (backend #75). */
export function storyPathOf(scope: DetailScope): string {
  return scope.kind === 'organization' ? `/organizations/${scope.id}/story/` : `/accounts/${scope.id}/story/`;
}
