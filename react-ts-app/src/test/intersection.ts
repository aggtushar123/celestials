import { vi } from 'vitest';

type Entry = { isIntersecting: boolean; target: Element };
type Watcher = { callback: (entries: Entry[]) => void; targets: Set<Element>; options: IntersectionObserverInit };

/** jsdom has no IntersectionObserver. This installs a fake one: `reveal`
 *  plays "this element scrolled into view" to every observer watching it,
 *  `watching` says whether any observer still watches it, and `optionsFor`
 *  gives the watching observer's options. Unlike a
 *  browser, nothing fires on `observe`; a test calls `reveal` (inside
 *  `act`). `vi.unstubAllGlobals()` removes it. */
export function installIntersectionObserver() {
  const watchers = new Set<Watcher>();

  class FakeIntersectionObserver {
    private watcher: Watcher;

    constructor(callback: (entries: Entry[]) => void, options: IntersectionObserverInit = {}) {
      this.watcher = { callback, targets: new Set(), options };
      watchers.add(this.watcher);
    }

    observe(target: Element) {
      this.watcher.targets.add(target);
    }

    unobserve(target: Element) {
      this.watcher.targets.delete(target);
    }

    disconnect() {
      this.watcher.targets.clear();
      watchers.delete(this.watcher);
    }

    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

  return {
    reveal(target: Element) {
      for (const watcher of [...watchers]) {
        if (watcher.targets.has(target)) watcher.callback([{ isIntersecting: true, target }]);
      }
    },
    watching(target: Element) {
      return [...watchers].some((watcher) => watcher.targets.has(target));
    },
    /** The options of the observer watching `target` (root, rootMargin). */
    optionsFor(target: Element): IntersectionObserverInit | undefined {
      return [...watchers].find((watcher) => watcher.targets.has(target))?.options;
    },
  };
}
