import { describe, expect, it } from "vitest";
import { isScrollbarPointer } from "./scrollbarHitTesting";

function element(options: {
  rect?: Partial<DOMRect>;
  clientWidth?: number;
  clientHeight?: number;
  offsetWidth?: number;
  offsetHeight?: number;
}) {
  const { rect = {}, clientWidth = 100, clientHeight = 100, offsetWidth = 108, offsetHeight = 108 } = options;
  return {
    clientWidth,
    clientHeight,
    offsetWidth,
    offsetHeight,
    scrollWidth: offsetWidth,
    scrollHeight: offsetHeight,
    parentElement: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 108, bottom: 108, ...rect }),
  } as unknown as HTMLElement;
}

describe("isScrollbarPointer", () => {
  it("recognizes a pointer in the vertical scrollbar gutter", () => {
    expect(isScrollbarPointer(null, element({}), 104, 40)).toBe(true);
  });

  it("does not treat content coordinates as scrollbar clicks", () => {
    expect(isScrollbarPointer(null, element({}), 96, 40)).toBe(false);
  });

  it("recognizes a pointer in the horizontal scrollbar gutter", () => {
    expect(isScrollbarPointer(null, element({}), 40, 104)).toBe(true);
  });

  it("recognizes a scrollbar on an inner scroll container", () => {
    const inner = element({ clientHeight: 80, offsetHeight: 80 });
    Object.defineProperty(inner, "scrollHeight", { value: 160 });
    expect(isScrollbarPointer(inner, inner, 104, 40)).toBe(true);
  });

});
