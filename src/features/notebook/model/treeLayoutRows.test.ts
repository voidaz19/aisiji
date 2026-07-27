import { describe, expect, it } from "vitest";
import { createEmptyState, ROOT_ID, type NodeRecord } from "../../../domain/model";
import { visibleLayoutGap } from "./subtreeLayout";
import { treeLayoutRows } from "./treeLayoutRows";

function content(id: string, parentId: string, sortKey: number, depth: number): NodeRecord & { depth: number } {
  return {
    id,
    kind: "content",
    parentId,
    sortKey,
    markdown: id,
    dateKey: null,
    revision: 1,
    createdAt: sortKey,
    updatedAt: sortKey,
    deletedAt: null,
    depth,
  };
}

describe("rendered tree layout rows", () => {
  it("classifies a child ghost exactly like a real last child", () => {
    const state = createEmptyState();
    const parent = content("parent", ROOT_ID, 1, 0);
    const sibling = content("sibling", ROOT_ID, 2, 0);
    state.nodes[parent.id] = parent;
    state.nodes[sibling.id] = sibling;
    state.collapsed[parent.id] = false;

    const rows = treeLayoutRows([parent, sibling], state, {}, null);

    expect(rows.map(({ kind, key, depth }) => ({ kind, key, depth }))).toEqual([
      { kind: "node", key: "parent", depth: 0 },
      { kind: "placeholder", key: "ghost:parent", depth: 1 },
      { kind: "node", key: "sibling", depth: 0 },
    ]);
    expect(rows.map((_, index) => visibleLayoutGap(rows, index))).toEqual([
      "inside-subtree",
      "subtree-end",
      "between-subtrees",
    ]);
    expect(rows[1].emptyTarget).toEqual({ kind: "placeholder", parentId: "parent" });
  });

  it("exposes real and placeholder empty rows through the same target property", () => {
    const state = createEmptyState();
    const empty = { ...content("empty", ROOT_ID, 1, 0), markdown: "" };
    const expanded = content("expanded", ROOT_ID, 2, 0);
    state.nodes[empty.id] = empty;
    state.nodes[expanded.id] = expanded;
    state.collapsed[expanded.id] = false;

    const rows = treeLayoutRows([empty, expanded], state, {}, null);

    expect(rows.map((row) => row.emptyTarget)).toEqual([
      { kind: "node", nodeId: "empty" },
      null,
      { kind: "placeholder", parentId: "expanded" },
    ]);
  });

  it("classifies the root ghost as an ordinary root-level row", () => {
    const state = createEmptyState();
    const node = content("node", ROOT_ID, 1, 0);
    state.nodes[node.id] = node;

    const rows = treeLayoutRows([node], state, {}, ROOT_ID);

    expect(rows.map((_, index) => visibleLayoutGap(rows, index))).toEqual([
      "between-subtrees",
      "between-subtrees",
    ]);
  });
});
