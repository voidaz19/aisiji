import { describe, expect, it } from "vitest";
import { canDropOnEmptyNode, moveToEmptyNode } from "./emptyDrop";
import { createEmptyState, ROOT_ID, type NotebookState } from "./model";
import { childrenOf, createNode } from "./tree";

function addNode(state: NotebookState, id: string, parentId: string, markdown: string): NotebookState {
  return createNode(state, parentId, markdown, "content", null, null, { nodeId: id, now: 1 }).state;
}

describe("empty drop targets", () => {
  it("replaces an empty leaf without changing the dragged subtree", () => {
    let state = addNode(createEmptyState(), "moving", ROOT_ID, "moving");
    state = addNode(state, "child", "moving", "child");
    state = addNode(state, "empty", ROOT_ID, "");

    const next = moveToEmptyNode(state, "moving", { kind: "node", nodeId: "empty" }, 2);

    expect(next.nodes.empty.deletedAt).toBe(2);
    expect(next.nodes.moving.parentId).toBe(ROOT_ID);
    expect(next.nodes.child.parentId).toBe("moving");
    expect(childrenOf(next, ROOT_ID).map((node) => node.id)).toEqual(["moving"]);
  });

  it("rejects non-empty targets and empty parents with children", () => {
    let state = addNode(createEmptyState(), "moving", ROOT_ID, "moving");
    state = addNode(state, "filled", ROOT_ID, "filled");
    state = addNode(state, "empty-parent", ROOT_ID, "");
    state = addNode(state, "child", "empty-parent", "child");

    expect(canDropOnEmptyNode(state, "moving", { kind: "node", nodeId: "filled" })).toBe(false);
    expect(canDropOnEmptyNode(state, "moving", { kind: "node", nodeId: "empty-parent" })).toBe(false);
  });

  it("moves to the parent represented by a ghost row", () => {
    let state = addNode(createEmptyState(), "moving", ROOT_ID, "moving");
    state = addNode(state, "parent", ROOT_ID, "parent");

    expect(canDropOnEmptyNode(state, "moving", { kind: "placeholder", parentId: "parent" })).toBe(true);
    const next = moveToEmptyNode(state, "moving", { kind: "placeholder", parentId: "parent" }, 2);
    expect(next.nodes.moving.parentId).toBe("parent");
  });

  it("rejects a ghost inside the dragged subtree", () => {
    let state = addNode(createEmptyState(), "moving", ROOT_ID, "moving");
    state = addNode(state, "child", "moving", "child");

    expect(canDropOnEmptyNode(state, "moving", { kind: "placeholder", parentId: "child" })).toBe(false);
  });
});
