// Test-only: the Brain's stub and the Copilot's behind one fetch, so a Brain
// page and its Ask rail run on the real store and router with only fetch
// stubbed. /copilot/ goes to the Copilot's (testCopilot, in the backend's
// shapes), everything else to the Brain's (testBrain).
import { vi } from 'vitest';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { stubBrain, type BrainStub } from '../../../features/brain/testBrain';

export function stubBrainAsk({ brain = {}, copilot = {} }: { brain?: BrainStub; copilot?: Parameters<typeof stubCopilot>[0] } = {}) {
  const asked = stubCopilot(copilot);
  const read = stubBrain(brain);
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/copilot/') ? asked.spy(String(input), init) : read.spy(input, init),
  );
  vi.stubGlobal('fetch', spy);
  return { brain: read, copilot: asked.spy, release: asked.release };
}
