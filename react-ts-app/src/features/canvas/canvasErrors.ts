// A refusal, put where it belongs (spec §2.2: the 409 banner, a summary that
// takes focus; §2.1: the New map dialog).
import { ApiError } from '../../lib/apiClient';
import { SAY } from './canvasOptions';

export interface SaveRefusal {
  /** 409 CANVAS_CHANGED: offer Reload. */
  changed: boolean;
  messages: string[];
}

const FIRST = ['name', 'nodes', 'edges'];

function messagesOf(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const entries = Object.entries(body as Record<string, unknown>);
  const rank = (key: string) => (FIRST.includes(key) ? FIRST.indexOf(key) : FIRST.length);
  const out: string[] = [];
  for (const [key, value] of [...entries].sort(([a], [b]) => rank(a) - rank(b))) {
    if (key === 'detail' && typeof value === 'string') out.push(value);
    else if (Array.isArray(value) && typeof value[0] === 'string') out.push(value[0]);
  }
  return out;
}

export function saveRefusal(err: unknown): SaveRefusal {
  // Deleted, or access lost, while it was open.
  if (err instanceof ApiError && err.status === 404) return { changed: false, messages: [SAY.MISSING] };
  if (err instanceof ApiError && err.status === 409) {
    const body = err.body as { code?: string } | null;
    if (body?.code === 'CANVAS_CHANGED') return { changed: true, messages: [SAY.CHANGED] };
  }
  const messages = err instanceof ApiError ? messagesOf(err.body) : [];
  return { changed: false, messages: messages.length ? messages : ['Could not save this map. Try again.'] };
}

export interface CreateErrors {
  name?: string;
  form?: string;
}

export function createErrors(err: unknown): CreateErrors {
  const fallback = { form: 'Could not create the map. Try again.' };
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== 'object') return fallback;
  const body = err.body as Record<string, unknown>;
  const name = Array.isArray(body.name) && typeof body.name[0] === 'string' ? body.name[0] : undefined;
  const rest = messagesOf(Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'name')));
  const out: CreateErrors = {};
  if (name) out.name = name;
  if (rest[0]) out.form = rest[0];
  return out.name || out.form ? out : fallback;
}

export function deleteRefusal(err: unknown): string {
  return (err instanceof ApiError ? messagesOf(err.body)[0] : undefined) ?? 'Could not delete the map. Try again.';
}

export function loadError(err: unknown): { missing: boolean; message: string } {
  if (err instanceof ApiError && err.status === 404) return { missing: true, message: SAY.MISSING };
  return { missing: false, message: err instanceof ApiError ? err.message : 'Could not load this map.' };
}
