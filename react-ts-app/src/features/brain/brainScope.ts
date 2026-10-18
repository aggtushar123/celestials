// The Brain's scope choice (spec §2.2): the URL first, then the reader's last
// choice (localStorage, every touch wrapped: storage can be off), then the
// server's default. The only file in the Brain that touches storage.
import { SCOPE_KEYS, type ScopeKey, type ScopesPayload } from './brainTypes';

export const SCOPE_STORAGE_KEY = 'revenact_brain_scope';

export function isScopeKey(value: unknown): value is ScopeKey {
  return typeof value === 'string' && (SCOPE_KEYS as readonly string[]).includes(value);
}

export function readStoredScope(): ScopeKey | null {
  try {
    const raw = localStorage.getItem(SCOPE_STORAGE_KEY);
    return isScopeKey(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeScope(key: ScopeKey): void {
  try {
    localStorage.setItem(SCOPE_STORAGE_KEY, key);
  } catch {
    // Storage is off: the choice still holds for this visit, in the URL.
  }
}

export function forgetScope(): void {
  try {
    localStorage.removeItem(SCOPE_STORAGE_KEY);
  } catch {
    // Storage is off: there is nothing remembered to forget.
  }
}

export interface ScopeChoice {
  key: ScopeKey;
  /** The remembered scope is no longer offered: forget it. */
  dropStored: boolean;
  /** The URL named a real scope the reader isn't offered (Decision 4). */
  urlRefused: boolean;
}

export function chooseScope(url: string | null, stored: ScopeKey | null, offered: ScopesPayload): ScopeChoice {
  const offers = (key: string | null): key is ScopeKey => key !== null && offered.scopes.some((s) => s.key === key);
  const dropStored = stored !== null && !offers(stored);
  if (offers(url)) return { key: url, dropStored, urlRefused: false };
  return { key: offers(stored) ? stored : offered.default, dropStored, urlRefused: isScopeKey(url) };
}

/** `offered` without `key` (Work › Team offers no Me, delivery 2); the
 *  default moves to the widest scope left when it was `key`. */
export function withoutScope(offered: ScopesPayload, key: ScopeKey): ScopesPayload {
  const scopes = offered.scopes.filter((scope) => scope.key !== key);
  const keeps = scopes.some((scope) => scope.key === offered.default);
  return { scopes, default: keeps ? offered.default : (scopes[scopes.length - 1]?.key ?? offered.default) };
}
