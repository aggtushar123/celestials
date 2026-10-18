// Network doubles for the Copilot endpoints, shaped like revenact-backend's
// docs/API_CONTRACTS.md -> copilot: a POST answers with the whole
// conversation, the user turn echoing `context`, and `origin` set once from
// the first dashboard context without its focus.
import { vi } from 'vitest';

export const CITED_SOURCE = {
  type: 'ticket' as const,
  id: 41,
  label: 'SSO login fails',
  date: '2026-09-20',
  company: 'Uber',
  company_type: 'customer' as const,
  company_id: 3,
};

type FetchSpy = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>>;

export function stubCopilot(
  options: {
    statuses?: number[];
    hold?: boolean;
    conversations?: unknown[];
    conversationById?: Record<number, unknown>;
    /** The server's label for an organisation page's context ("Pizza Hut ·
     *  EMEA"), stored on the context and the origin as the backend does. */
    label?: (context: Record<string, unknown>) => string;
    /** A `400 {"context": refuse}` for the first question asked with a
     *  context, as the backend answers an organisation or account the asker
     *  may not open (nested, as `{filters: {organisation: [...]}}`,
     *  allowed). One-shot: a question sent after that one goes through, as
     *  the account page's own next question does once its refused focus is
     *  spent. */
    refuse?: Record<string, unknown>;
  } = {},
) {
  const statuses = [...(options.statuses ?? [])];
  const messages: Record<string, unknown>[] = [];
  let origin: Record<string, unknown> | null = null;
  let attempts = 0;
  let release = () => {};
  const gate = options.hold ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();

  const spy: FetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
    const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url.includes('/copilot/messages/') && init?.method === 'POST') {
      await gate;
      const status = statuses.shift() ?? 200;
      const body = JSON.parse(String(init.body)) as { content: string; context?: Record<string, unknown> };
      if (status >= 400) return reply({ detail: status === 429 ? 'Budget exhausted.' : 'Server error.' }, status);
      if (body.context) attempts += 1;
      if (body.context && options.refuse && attempts === 1) return reply({ context: options.refuse }, 400);
      if (body.context && options.label) body.context = { ...body.context, label: options.label(body.context) };
      if (body.context && origin === null) {
        origin = { ...body.context };
        delete origin.focus;
      }
      messages.push({ id: messages.length + 1, role: 'user', content: body.content, context: body.context ?? null, sources: [], questions: [], created_at: '' });
      messages.push({
        id: messages.length + 1,
        role: 'assistant',
        content: `Answer to: ${body.content}`,
        sources: body.content.includes('cite') ? [CITED_SOURCE] : [],
        questions: [],
        created_at: '',
      });
      return reply({ id: 7, title: 'Chat', created_at: '', updated_at: '', origin, messages: [...messages] });
    }
    const one = /\/copilot\/conversations\/(\d+)\/$/.exec(url);
    if (one) {
      const found = options.conversationById?.[Number(one[1])];
      return found ? reply(found) : reply({ detail: 'Not found.' }, 404);
    }
    if (url.includes('/copilot/conversations/')) return reply(options.conversations ?? []);
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, release: () => release() };
}

/** The JSON bodies POSTed to /copilot/messages/, in order. */
export function postedBodies(spy: FetchSpy): Record<string, unknown>[] {
  return spy.mock.calls
    .filter(([url, init]) => String(url).includes('/copilot/messages/') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}
