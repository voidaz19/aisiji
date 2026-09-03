import { describe, expect, it } from "vitest";
import { applyDragPreviewGuideOpacity, relativeDragPreviewGuides } from "./dragPreviewLayout";

describe("drag preview hierarchy guides", () => {
  it("moves only the dragged subtree guides into overlay coordinates", () => {
    expect(relativeDragPreviewGuides([
      { id: "parent", x: 28, y1: 20, y2: 180 },
      { id: "source", x: 56, y1: 100, y2: 240, opacity: 0.8 },
      { id: "child", x: 84, y1: 140, y2: 200 },
    ], new Set(["source", "child"]), { left: 10, top: 80 })).toEqual([
      { id: "source", x: 46, y1: 20, y2: 160, opacity: 0.8 },
      { id: "child", x: 74, y1: 60, y2: 120 },
    ]);
  });

  it("does not keep a guide that ends before the dragged overlay", () => {
    expect(relativeDragPreviewGuides([
      { id: "source", x: 56, y1: 40, y2: 70 },
    ], new Set(["source"]), { left: 10, top: 80 })).toEqual([]);
  });

  it("fades the stationary guides for the dragged subtree with the source opacity", () => {
    expect(applyDragPreviewGuideOpacity([
      { id: "source", x: 56, y1: 100, y2: 240 },
      { id: "child", x: 84, y1: 140, y2: 200, opacity: 0.8 },
      { id: "other", x: 28, y1: 20, y2: 180, opacity: 0.6 },
    ], new Set(["source", "child"]), 0)).toEqual([
      { id: "source", x: 56, y1: 100, y2: 240, opacity: 0 },
      { id: "child", x: 84, y1: 140, y2: 200, opacity: 0 },
      { id: "other", x: 28, y1: 20, y2: 180, opacity: 0.6 },
    ]);
  });

  it("uses the distance opacity for dragged-subtree guides without changing other guides", () => {
    expect(applyDragPreviewGuideOpacity([
      { id: "source", x: 56, y1: 100, y2: 240 },
      { id: "child", x: 84, y1: 140, y2: 200, opacity: 0.8 },
      { id: "other", x: 28, y1: 20, y2: 180, opacity: 0.6 },
    ], new Set(["source", "child"]), 0.3)).toEqual([
      { id: "source", x: 56, y1: 100, y2: 240, opacity: 0.3 },
      { id: "child", x: 84, y1: 140, y2: 200, opacity: 0.24 },
      { id: "other", x: 28, y1: 20, y2: 180, opacity: 0.6 },
    ]);
  });
});
