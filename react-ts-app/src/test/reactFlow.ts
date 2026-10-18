// React Flow's documented jsdom mocks (reactflow.dev "Testing"): a
// ResizeObserver that reports at once, DOMMatrixReadOnly, and element sizes,
// so nodes measure, show (`visibility` stops being hidden) and lines render.
// Call it at the top of a test file; vitest isolates each file's globals.
class ResizeObserverNow {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // jsdom's getBoundingClientRect is always zero, and @xyflow/system reads
    // `contentRect` straight off the entry to size the pane's zoom/pan extent
    // (XYPanZoom's extentResizeObserver): a bare `{ target }` entry crashes
    // reading `entry.contentRect.width`. 500x500, as reactflow.dev's own
    // testing guide uses, keeps every size-derived calculation finite.
    const box = { x: 0, y: 0, width: 500, height: 500 };
    this.callback(
      [{ target, contentRect: box, borderBoxSize: [{ inlineSize: box.width, blockSize: box.height }], contentBoxSize: [{ inlineSize: box.width, blockSize: box.height }] } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([0-9.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? Number(scale) : 1;
  }
}

let done = false;

export function mockReactFlow(): void {
  if (done) return;
  done = true;
  globalThis.ResizeObserver = ResizeObserverNow as unknown as typeof ResizeObserver;
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get(this: HTMLElement) { return parseFloat(this.style.height) || 1; } },
    offsetWidth: { configurable: true, get(this: HTMLElement) { return parseFloat(this.style.width) || 1; } },
  });
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
}

/** Drags a board node by the mouse, as d3-drag (React Flow's dragging) reads
 *  it: a mousedown on the node, then moves and a mouseup on the window, each
 *  carrying `view` (jsdom's MouseEvent constructor refuses vitest's window,
 *  so it is set afterwards). Answers the node's transform before and after. */
export async function dragNode(nodeId: string): Promise<{ before: string; after: string }> {
  const { act } = await import('@testing-library/react');
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${nodeId}"]`);
  if (!node) throw new Error(`No node ${nodeId} on the board`);
  const before = node.style.transform;
  const fire = (target: EventTarget, type: string, x: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: x, button: 0 });
    Object.defineProperty(event, 'view', { value: window });
    target.dispatchEvent(event);
  };
  await act(async () => {
    fire(node, 'mousedown', 10);
    fire(window, 'mousemove', 100);
    fire(window, 'mousemove', 200);
    fire(window, 'mouseup', 200);
  });
  return { before, after: node.style.transform };
}
