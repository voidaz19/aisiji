import { describe, expect, it } from "vitest";
import { measuredTreeBlocks, subtreeBottomInset, visibleLayoutGap, visibleSubtreeExitCount, visibleSubtreeGroups } from "./subtreeLayout";

describe("visible subtree layout groups", () => {
  it("groups a parent with all visible descendants", () => {
    expect(visibleSubtreeGroups([
      { id: "parent", depth: 0 },
      { id: "child", depth: 1 },
      { id: "grandchild", depth: 2 },
      { id: "sibling", depth: 0 },
    ])).toEqual([
      { rootId: "parent", depth: 0, startIndex: 0, endIndex: 2 },
      { rootId: "child", depth: 1, startIndex: 1, endIndex: 2 },
    ]);
  });

  it("does not create a group for a leaf or collapsed parent", () => {
    expect(visibleSubtreeGroups([
      { id: "leaf", depth: 0 },
      { id: "collapsed", depth: 0 },
      { id: "next", depth: 0 },
    ])).toEqual([]);
  });

  it("uses the same gap between sibling blocks regardless of subtree depth", () => {
    const nodes = [
      { id: "parent", depth: 0 },
      { id: "child", depth: 1 },
      { id: "grandchild", depth: 2 },
      { id: "child-sibling", depth: 1 },
      { id: "next-parent", depth: 0 },
    ];

    expect(nodes.map((_, index) => visibleLayoutGap(nodes, index))).toEqual([
      "inside-subtree",
      "inside-subtree",
      "subtree-end",
      "subtree-end",
      "between-subtrees",
    ]);
  });

  it("adds an inner bottom edge before leaving a subtree", () => {
    expect(visibleLayoutGap([
      { id: "parent", depth: 0 },
      { id: "child", depth: 1 },
      { id: "outside", depth: 0 },
    ], 1)).toBe("subtree-end");

    expect(visibleLayoutGap([
      { id: "parent", depth: 0 },
      { id: "child", depth: 1 },
    ], 1)).toBe("subtree-end");
  });

  it("counts every subtree boundary crossed by a deeply nested last node", () => {
    const nodes = [
      { id: "root", depth: 0 },
      { id: "child", depth: 1 },
      { id: "grandchild", depth: 2 },
      { id: "great-grandchild", depth: 3 },
      { id: "outside", depth: 0 },
    ];

    expect(visibleSubtreeExitCount(nodes, 3)).toBe(3);
    expect(visibleSubtreeExitCount(nodes, 4)).toBe(0);
  });

  it("counts only the levels actually exited before a nested sibling", () => {
    expect(visibleSubtreeExitCount([
      { id: "root", depth: 0 },
      { id: "child", depth: 1 },
      { id: "deep", depth: 3 },
      { id: "child-sibling", depth: 1 },
    ], 2)).toBe(2);
  });

  it("keeps a separate bottom inset for every containing subtree", () => {
    expect(subtreeBottomInset(2, 3, 8)).toBe(8);
    expect(subtreeBottomInset(1, 3, 8)).toBe(16);
    expect(subtreeBottomInset(0, 3, 8)).toBe(24);
  });

  it("measures nested blocks with a separate bottom boundary for every subtree", () => {
    const blocks = measuredTreeBlocks([
      { key: "week", depth: 0, top: 0, bottom: 24 },
      { key: "plan", depth: 1, top: 32, bottom: 56 },
      { key: "step", depth: 2, top: 64, bottom: 88 },
      { key: "next", depth: 0, top: 110, bottom: 134 },
    ], 8);

    expect(blocks).toMatchObject([
      { rootId: "week", bottom: 104, isSubtree: true },
      { rootId: "plan", bottom: 96, isSubtree: true },
      { rootId: "step", bottom: 88, isSubtree: false },
      { rootId: "next", bottom: 134, isSubtree: false },
    ]);
  });
});
