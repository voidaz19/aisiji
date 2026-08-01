import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTreeLayoutAnimation } from "./useTreeLayoutAnimation";

type Geometry = { left: number; top: number };

const geometries = new Map<string, Geometry>();
const frames: FrameRequestCallback[] = [];
const resizeCallbacks: ResizeObserverCallback[] = [];
const animate = vi.fn();

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }

  observe() {}
  disconnect() {}
  unobserve() {}
}

function LayoutHarness({ depth, version }: { depth: number; version: number }) {
  const container = useRef<HTMLDivElement>(null);
  useTreeLayoutAnimation(container, [version]);
  return (
    <div ref={container}>
      <div data-tree-block-key="attachment" data-tree-block-kind="node" data-depth="0">
        <span className="node-bullet" />
      </div>
      <div data-tree-block-key="moving" data-tree-block-kind="node" data-depth={depth}>
        <span className="node-bullet" />
      </div>
    </div>
  );
}

beforeEach(() => {
  geometries.clear();
  frames.splice(0);
  resizeCallbacks.splice(0);
  animate.mockReset();
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const row = this.closest<HTMLElement>("[data-tree-block-key]");
    const geometry = geometries.get(row?.dataset.treeBlockKey ?? "") ?? { left: 0, top: 0 };
    const left = this.classList.contains("node-bullet") ? geometry.left : 0;
    return box(left, geometry.top, left + 20, geometry.top + 32);
  });
  animate.mockImplementation(() => ({
    cancel: vi.fn(),
    finished: new Promise<void>(() => undefined),
  }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

describe("useTreeLayoutAnimation", () => {
  it("refreshes its baseline after attachment content changes row height", () => {
    geometries.set("attachment", { left: 0, top: 0 });
    geometries.set("moving", { left: 0, top: 40 });
    const { rerender } = render(<LayoutHarness depth={0} version={0} />);
    flushFrames();

    // An attachment preview loads after mount and pushes the following row down.
    geometries.set("moving", { left: 0, top: 140 });
    act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    flushFrames();

    geometries.set("moving", { left: 24, top: 140 });
    rerender(<LayoutHarness depth={1} version={1} />);

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { transform: "translate(-24px, 0px)" },
      { transform: "translate(0, 0)" },
    ]);
  });
});

function flushFrames() {
  const callbacks = frames.splice(0);
  act(() => callbacks.forEach((callback) => callback(performance.now())));
}

function box(left: number, top: number, right: number, bottom: number): DOMRect {
  return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) } as DOMRect;
}
