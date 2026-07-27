import { describe, expect, it } from "vitest";
import { subtreeBottomInset, visibleLayoutGap, visibleSubtreeExitCount, visibleSubtreeGroups } from "./subtreeLayout";

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

  it("gives every containing subtree its own bottom inset", () => {
    expect(subtreeBottomInset(2, 3, 8)).toBe(8);
    expect(subtreeBottomInset(1, 3, 8)).toBe(16);
    expect(subtreeBottomInset(0, 3, 8)).toBe(24);
  });
});
