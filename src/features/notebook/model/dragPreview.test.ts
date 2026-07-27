import { describe, expect, it } from "vitest";
import type { NodeRecord } from "../../../domain/model";
import { visibleDragPreview, type VisiblePreviewNode } from "./dragPreview";

function node(id: string, depth: number): VisiblePreviewNode {
  return {
    id,
    kind: "content",
    parentId: null,
    sortKey: 0,
    markdown: id,
    dateKey: null,
    deletedAt: null,
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
    depth,
  } satisfies NodeRecord & { depth: number };
}

describe("visible drag preview", () => {
  const visible = [
    node("week", 0),
    node("budget", 1),
    node("plan", 1),
    node("step", 2),
    node("detail", 3),
    node("next", 1),
  ];

  it("includes the dragged node and all of its visible descendants", () => {
    expect(visibleDragPreview(visible, "plan").map(({ node: item, relativeDepth }) => [item.id, relativeDepth])).toEqual([
      ["plan", 0],
      ["step", 1],
      ["detail", 2],
    ]);
  });

  it("stops before the next node at the dragged node's depth", () => {
    expect(visibleDragPreview(visible, "budget").map(({ node: item }) => item.id)).toEqual(["budget"]);
  });

  it("returns nothing when the dragged node is not visible", () => {
    expect(visibleDragPreview(visible, "missing")).toEqual([]);
  });
});
