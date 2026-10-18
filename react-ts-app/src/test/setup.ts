import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// GitHub's runners are several times slower than a laptop: findBy*/waitFor
// with the 1 s default timed out in the multiplayer copilot and custom
// objects tests in CI while passing locally. Wait longer before giving up.
configure({ asyncUtilTimeout: 5000 });

// jsdom doesn't implement ResizeObserver — @xyflow/react (the
// Scenarios builder's canvas, see pages/scenarios/CreateScenario.tsx)
// uses it internally to track the canvas's own size. A no-op stub is
// enough: these tests never assert on layout/size, just on state.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
