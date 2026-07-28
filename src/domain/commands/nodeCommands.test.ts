import { describe, expect, it } from "vitest";
import { executeDeleteNode, executeDeleteSelection } from "./deleteNode";
import { executeMergeNode } from "./mergeNode";
import { executeMoveNode } from "./moveNode";
import { executeSplitNode } from "./splitNode";
import { createEmptyState, ROOT_ID, type NotebookState } from "../model";
import { childrenOf, createNode } from "../tree";

function addNode(state: NotebookState, id: string, parentId: string, markdown: string): NotebookState {
  return createNode(state, parentId, markdown, "content", null, null, { nodeId: id, now: 1 }).state;
}

describe("node domain commands", () => {
  it("splits a normal node into an immediately following sibling", () => {
    let state = addNode(createEmptyState(), "first", ROOT_ID, "old text");

    const result = executeSplitNode(state, {
      nodeId: "first",
      before: "old",
      after: " text",
      placement: "after",
      newNodeId: "second",
      now: 10,
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    state = result.state;
    expect(state.nodes.first.markdown).toBe("old");
    expect(state.nodes.second.markdown).toBe(" text");
    expect(state.nodes.second.parentId).toBe(ROOT_ID);
    expect(childrenOf(state, ROOT_ID).map((node) => node.id)).toEqual(["first", "second"]);
  });

  it("creates an empty sibling before a node without changing its content or subtree", () => {
    let state = addNode(createEmptyState(), "before-target", ROOT_ID, "parent");
    state = addNode(state, "child", "before-target", "child");
    state = addNode(state, "after-target", ROOT_ID, "after");

    const result = executeSplitNode(state, {
      nodeId: "before-target",
      before: "",
      after: "parent",
      placement: "before",
      newNodeId: "new-before",
      now: 10,
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.state.nodes["new-before"].markdown).toBe("");
    expect(result.state.nodes["before-target"].markdown).toBe("parent");
    expect(result.state.nodes.child.parentId).toBe("before-target");
    expect(childrenOf(result.state, ROOT_ID).map((node) => node.id)).toEqual(["new-before", "before-target", "after-target"]);
  });

  it("puts the split tail before existing children when the node is expanded", () => {
    let state = addNode(createEmptyState(), "parent", ROOT_ID, "parent");
    state = addNode(state, "existing-child", "parent", "child");

    const result = executeSplitNode(state, {
      nodeId: "parent",
      before: "par",
      after: "ent",
      placement: "first-child",
      newNodeId: "new-child",
      now: 10,
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(childrenOf(result.state, "parent").map((node) => node.id)).toEqual(["new-child", "existing-child"]);
    expect(result.state.collapsed.parent).toBe(false);
  });

  it("keeps hidden children under a folded node while splitting after it", () => {
    let state = addNode(createEmptyState(), "parent", ROOT_ID, "parent");
    state = addNode(state, "hidden-child", "parent", "child");
    state = { ...state, collapsed: { ...state.collapsed, parent: true } };

    const result = executeSplitNode(state, {
      nodeId: "parent",
      before: "par",
      after: "ent",
      placement: "after",
      newNodeId: "sibling",
      now: 10,
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(childrenOf(result.state, ROOT_ID).map((node) => node.id)).toEqual(["parent", "sibling"]);
    expect(childrenOf(result.state, "parent").map((node) => node.id)).toEqual(["hidden-child"]);
  });

  it("merges with the previous sibling and keeps the previous identity", () => {
    let state = addNode(createEmptyState(), "first", ROOT_ID, "one");
    state = addNode(state, "second", ROOT_ID, "two");

    const result = executeMergeNode(state, {
      direction: "previous",
      nodeId: "second",
      activeRootId: ROOT_ID,
      now: 10,
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.state.nodes.first.markdown).toBe("onetwo");
    expect(result.state.nodes.first.deletedAt).toBeNull();
    expect(result.state.nodes.second.deletedAt).toBe(10);
    expect(result.focus.activeNodeId).toBe("first");
    expect(result.focus.cursor).toBe(3);
  });

  it("rejects a merge when the node being removed has children", () => {
    let state = addNode(createEmptyState(), "first", ROOT_ID, "one");
    state = addNode(state, "second", ROOT_ID, "two");
    state = addNode(state, "child", "second", "child");

    const result = executeMergeNode(state, {
      direction: "previous",
      nodeId: "second",
      activeRootId: ROOT_ID,
      now: 10,
    });

    expect(result).toEqual({ status: "rejected", state, reason: "has-children" });
  });

  it("merges the first child into a normal content parent", () => {
    let state = addNode(createEmptyState(), "parent", ROOT_ID, "parent");
    state = addNode(state, "child", "parent", "child");

    const result = executeMergeNode(state, {
      direction: "previous",
      nodeId: "child",
      activeRootId: ROOT_ID,
      now: 10,
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.state.nodes.parent.markdown).toBe("parentchild");
    expect(result.state.nodes.child.deletedAt).toBe(10);
    expect(result.focus.activeNodeId).toBe("parent");
  });

  it("rejects a forward merge when the next node has children", () => {
    let state = addNode(createEmptyState(), "first", ROOT_ID, "one");
    state = addNode(state, "second", ROOT_ID, "two");
    state = addNode(state, "child", "second", "child");

    const result = executeMergeNode(state, {
      direction: "next",
      nodeId: "first",
      activeRootId: ROOT_ID,
      now: 10,
    });

    expect(result).toEqual({ status: "rejected", state, reason: "has-children" });
  });

  it("indents, outdents, and rejects moving a node into its descendant", () => {
    let state = addNode(createEmptyState(), "first", ROOT_ID, "first");
    state = addNode(state, "second", ROOT_ID, "second");
    state = addNode(state, "descendant", "first", "descendant");

    let result = executeMoveNode(state, { type: "indent", nodeId: "second", now: 10 });
    expect(result.changed).toBe(true);
    expect(result.state.nodes.second.parentId).toBe("first");

    result = executeMoveNode(result.state, { type: "outdent", nodeId: "second", now: 11 });
    expect(result.changed).toBe(true);
    expect(result.state.nodes.second.parentId).toBe(ROOT_ID);

    result = executeMoveNode(result.state, { type: "first-child", nodeId: "first", parentId: "descendant", now: 12 });
    expect(result.changed).toBe(false);
    expect(result.state.nodes.first.parentId).toBe(ROOT_ID);
    expect(result.state.nodes.descendant.parentId).toBe("first");
  });

  it("moves a complete subtree to an explicit vertical insertion slot", () => {
    let state = addNode(createEmptyState(), "moving", ROOT_ID, "moving");
    state = addNode(state, "moving-child", "moving", "child");
    state = addNode(state, "target", ROOT_ID, "target");

    const result = executeMoveNode(state, {
      type: "slot",
      nodeId: "moving",
      parentId: ROOT_ID,
      beforeId: "target",
      now: 10,
    });

    expect(result.changed).toBe(true);
    expect(result.state.nodes.moving.parentId).toBe(ROOT_ID);
    expect(result.state.nodes["moving-child"].parentId).toBe("moving");
    expect(childrenOf(result.state, ROOT_ID).map((node) => node.id)).toEqual(["moving", "target"]);
  });

  it("rejects single deletion of a parent but deletes condensed selection roots", () => {
    let state = addNode(createEmptyState(), "parent", ROOT_ID, "parent");
    state = addNode(state, "child", "parent", "child");
    state = addNode(state, "sibling", ROOT_ID, "sibling");

    expect(executeDeleteNode(state, "parent", 10)).toEqual({ status: "rejected", state, reason: "has-children" });

    const result = executeDeleteSelection(state, ["child", "parent", "sibling"], 11);
    expect(result.roots).toEqual(["parent", "sibling"]);
    expect(result.state.nodes.parent.deletedAt).toBe(11);
    expect(result.state.nodes.child.deletedAt).toBe(11);
    expect(result.state.nodes.sibling.deletedAt).toBe(11);
  });
});
