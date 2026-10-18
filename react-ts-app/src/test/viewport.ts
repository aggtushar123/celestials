type Listener = () => void;

let width = 0;
let listeners: Listener[] = [];

/** jsdom has no matchMedia. This answers `(min-width: Npx)` queries as a
 *  window `width` px wide would, so layout-by-breakpoint code can be tested.
 *  Calling this mid-test, after components are already mounted, drops their
 *  change listeners (it replaces `listeners` with a fresh array): use
 *  `resizeViewport` instead once something is mounted. */
export function setViewport(next: number): void {
  width = next;
  listeners = [];
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    return {
      get matches() {
        return min ? width >= Number(min[1]) : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => {
        listeners.push(listener);
      },
      removeEventListener: (_type: string, listener: Listener) => {
        listeners = listeners.filter((l) => l !== listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}

/** The window is resized after setViewport: every query reads the new width
 *  and each `change` listener runs, as a browser's would. Wrap it in `act`. */
export function resizeViewport(next: number): void {
  width = next;
  for (const listener of [...listeners]) listener();
}

export function resetViewport(): void {
  width = 0;
  listeners = [];
  // @ts-expect-error -- jsdom's own window has no matchMedia; put that back
  delete window.matchMedia;
}
