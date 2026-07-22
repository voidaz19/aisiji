import { beforeEach, describe, expect, it } from "vitest";
import { useNotebookStore } from "./useNotebookStore";
import { childrenOf } from "../domain/tree";

function firstContentNode() {
  const state = useNotebookStore.getState();
  return Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
}

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

describe("splitNode (Enter in the middle of content)", () => {
  it("keeps text before the cursor on the current node and moves the rest to a new sibling", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "hello world");
    const newId = store.splitNode(node.id, "hello ", "world")!;

    const state = useNotebookStore.getState();
    expect(state.nodes[node.id].markdown).toBe("hello ");
    expect(state.nodes[newId].markdown).toBe("world");
    expect(state.nodes[newId].parentId).toBe(state.nodes[node.id].parentId);
    // New node should be focused with the caret at its start.
    expect(state.activeNodeId).toBe(newId);
    expect(state.activeNodeCursor).toBe(0);
  });

  it("places the new sibling immediately after the split node, not at the end of the list", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    const parentId = node.parentId;
    store.createSibling(node.id, "third");
    const newId = store.splitNode(node.id, "a", "b")!;
    const order = childrenOf(useNotebookStore.getState(), parentId!)
      .filter((n) => n.kind !== "date")
      .map((n) => n.id);
    expect(order).toEqual([node.id, newId, expect.anything()]);
  });
});

describe("mergeWithPrev (Backspace at the start of content)", () => {
  it("merges content into the previous sibling and removes the current node", () => {
    const store = useNotebookStore.getState();
    const first = firstContentNode();
    store.editMarkdown(first.id, "hello");
    const secondId = store.createSibling(first.id, "world")!;

    store.mergeWithPrev(secondId);

    const state = useNotebookStore.getState();
    expect(state.nodes[first.id].markdown).toBe("helloworld");
    expect(state.nodes[secondId].deletedAt).not.toBeNull();
    // Focus moves to the merge target with the caret at the join point.
    expect(state.activeNodeId).toBe(first.id);
    expect(state.activeNodeCursor).toBe("hello".length);
  });

  it("reparents children of the removed node onto the merge target instead of deleting them", () => {
    const store = useNotebookStore.getState();
    const first = firstContentNode();
    const secondId = store.createSibling(first.id, "parent-to-merge")!;
    const childId = store.createChild(secondId, "child")!;

    store.mergeWithPrev(secondId);

    const state = useNotebookStore.getState();
    expect(state.nodes[childId].deletedAt).toBeNull();
    expect(state.nodes[childId].parentId).toBe(first.id);
  });

  it("merges into the parent when the node is the first child (and parent is a regular content node)", () => {
    const store = useNotebookStore.getState();
    const first = firstContentNode();
    store.editMarkdown(first.id, "parent-text");
    const childId = store.createChild(first.id, "child-text")!;

    store.mergeWithPrev(childId);

    const state = useNotebookStore.getState();
    expect(state.nodes[first.id].markdown).toBe("parent-textchild-text");
    expect(state.nodes[childId].deletedAt).not.toBeNull();
    expect(state.activeNodeId).toBe(first.id);
  });

  it("does not merge a first child into its date-node parent", () => {
    const store = useNotebookStore.getState();
    const first = firstContentNode();
    store.mergeWithPrev(first.id);
    const state = useNotebookStore.getState();
    expect(state.nodes[first.id].deletedAt).toBeNull();
  });

  it("does nothing when there is no previous sibling and no mergeable parent", () => {
    const store = useNotebookStore.getState();
    const date = Object.values(useNotebookStore.getState().nodes).find((node) => node.kind === "date")!;
    store.mergeWithPrev(date.id);
    const state = useNotebookStore.getState();
    expect(state.nodes[date.id].deletedAt).toBeNull();
  });
});
