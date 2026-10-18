import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubContactsApi, type ContactsStub } from '../../../features/contacts/testContacts';

/** Test-only. The Contacts page's endpoints (stubContactsApi) and the
 *  Copilot's (stubCopilot) behind one fetch, so the page and its rail both
 *  answer. `copilot` is the spy postedBodies reads; `contacts` the one
 *  `requested` reads. */
export function stubContactsAsk(options: { copilot?: Parameters<typeof stubCopilot>[0]; contacts?: ContactsStub } = {}) {
  const copilot = stubCopilot(options.copilot);
  const contacts = stubContactsApi(options.contacts);
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? copilot.spy(String(input), init) : contacts(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { copilot: copilot.spy, contacts, release: copilot.release };
}
