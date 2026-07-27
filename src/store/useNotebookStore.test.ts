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

  it("places a split line before existing children when the node is expanded", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "hello world");
    const firstChild = store.createChild(node.id, "existing child")!;
    const secondChild = store.createChild(node.id, "another child")!;
    const newId = store.splitNode(node.id, "hello ", "world")!;

    const state = useNotebookStore.getState();
    expect(state.nodes[newId].parentId).toBe(node.id);
    expect(childrenOf(state, node.id).map((child) => child.id)).toEqual([newId, firstChild, secondChild]);
    expect(state.nodes[node.id].markdown).toBe("hello ");
    expect(state.nodes[newId].markdown).toBe("world");
  });

  it("places a split line after a collapsed parent while preserving its hidden children", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    const childId = store.createChild(node.id, "hidden child")!;
    store.toggleNode(node.id);

    const newId = store.splitNode(node.id, "before", "after")!;

    const state = useNotebookStore.getState();
    expect(state.nodes[newId].parentId).toBe(node.parentId);
    expect(state.nodes[childId].parentId).toBe(node.id);
    expect(state.collapsed[node.id]).toBe(true);
    expect(childrenOf(state, node.parentId!).map((child) => child.id)).toContain(newId);
  });
});

describe("editing a content node as the active root", () => {
  it("focuses the content editor when entering a content node", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();

    store.enterNode(node.id);

    const state = useNotebookStore.getState();
    expect(state.activeRootId).toBe(node.id);
    expect(state.activeNodeId).toBe(node.id);
    expect(state.activeNodeCursor).toBe("end");
  });

  it("creates a child and keeps the active root when the root editor is split", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "root text");
    store.enterNode(node.id);

    const newId = store.splitNode(node.id, "root ", "text")!;

    const state = useNotebookStore.getState();
    expect(state.activeRootId).toBe(node.id);
    expect(state.activeNodeId).toBe(newId);
    expect(state.activeNodeCursor).toBe(0);
    expect(state.nodes[node.id].markdown).toBe("root ");
    expect(state.nodes[newId].markdown).toBe("text");
    expect(state.nodes[newId].parentId).toBe(node.id);
    expect(childrenOf(state, node.id).map((child) => child.id)).toEqual([newId]);
  });

  it("blocks Backspace from removing or migrating the active root", () => {
    const store = useNotebookStore.getState();
    const previous = firstContentNode();
    store.editMarkdown(previous.id, "previous");
    const rootId = store.createSibling(previous.id, "root")!;
    store.enterNode(rootId);

    store.mergeWithPrev(rootId);

    const state = useNotebookStore.getState();
    expect(state.activeRootId).toBe(rootId);
    expect(state.nodes[rootId].deletedAt).toBeNull();
    expect(state.nodes[previous.id].markdown).toBe("previous");
  });

  it("moves the active root to the adjacent node when explicitly deleted", () => {
    const store = useNotebookStore.getState();
    const previous = firstContentNode();
    const rootId = store.createSibling(previous.id, "root")!;
    store.enterNode(rootId);

    store.remove(rootId);

    const state = useNotebookStore.getState();
    expect(state.activeRootId).toBe(previous.id);
    expect(state.activeNodeId).toBe(previous.id);
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

  it("deletes an empty node and focuses the deepest visible node in the previous sibling subtree", () => {
    const store = useNotebookStore.getState();
    const previousSibling = firstContentNode();
    store.editMarkdown(previousSibling.id, "previous");
    const nestedId = store.createChild(previousSibling.id, "nested")!;
    const emptyId = store.createSibling(previousSibling.id, "")!;

    store.mergeWithPrev(emptyId);

    const state = useNotebookStore.getState();
    expect(state.nodes[emptyId].deletedAt).not.toBeNull();
    expect(state.activeNodeId).toBe(nestedId);
    expect(state.activeNodeCursor).toBe("nested".length);
  });

  it("focuses the previous sibling itself when its subtree is collapsed", () => {
    const store = useNotebookStore.getState();
    const previousSibling = firstContentNode();
    store.editMarkdown(previousSibling.id, "previous");
    store.createChild(previousSibling.id, "nested");
    store.toggleNode(previousSibling.id);
    const emptyId = store.createSibling(previousSibling.id, "")!;

    store.mergeWithPrev(emptyId);

    const state = useNotebookStore.getState();
    expect(state.activeNodeId).toBe(previousSibling.id);
    expect(state.activeNodeCursor).toBe("previous".length);
  });

  it("focuses a visible child ghost instead of skipping it after deleting an empty sibling", () => {
    const store = useNotebookStore.getState();
    const previous = firstContentNode();
    store.editMarkdown(previous.id, "previous");
    store.toggleNode(previous.id);
    const emptyId = store.createSibling(previous.id, "")!;

    store.mergeWithPrev(emptyId);

    const state = useNotebookStore.getState();
    expect(state.nodes[emptyId].deletedAt).not.toBeNull();
    expect(state.activeNodeId).toBeNull();
    expect(state.activeGhostParentId).toBe(previous.id);
  });

  it("blocks merging and preserves node when the node has children", () => {
    const store = useNotebookStore.getState();
    const first = firstContentNode();
    const secondId = store.createSibling(first.id, "parent-to-merge")!;
    const childId = store.createChild(secondId, "child")!;

    store.mergeWithPrev(secondId);

    const state = useNotebookStore.getState();
    expect(state.nodes[secondId].deletedAt).toBeNull();
    expect(state.nodes[childId].deletedAt).toBeNull();
    expect(state.nodes[childId].parentId).toBe(secondId);
  });

  it("merges into the parent when the node is the first child with no children (and parent is a regular content node)", () => {
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

  it("deletes an empty only child without leaving a child ghost under its content parent", () => {
    const store = useNotebookStore.getState();
    const parent = firstContentNode();
    const childId = store.createChild(parent.id, "")!;

    store.mergeWithPrev(childId);

    const state = useNotebookStore.getState();
    expect(state.nodes[childId].deletedAt).not.toBeNull();
    expect(state.collapsed[parent.id]).toBe(true);
    expect(state.ghostSuppressed[parent.id]).toBe(false);
    expect(state.activeNodeId).toBe(parent.id);

    store.toggleNode(parent.id);
    expect(useNotebookStore.getState().collapsed[parent.id]).toBe(false);
  });

  it("allows a child ghost again after a new child is explicitly created", () => {
    const store = useNotebookStore.getState();
    const parent = firstContentNode();
    const emptyChildId = store.createChild(parent.id, "")!;
    store.mergeWithPrev(emptyChildId);

    store.createChild(parent.id, "new child");

    expect(useNotebookStore.getState().ghostSuppressed[parent.id]).toBe(false);
  });

  it("does not merge a first child into its date-node parent when it has content", () => {
    const store = useNotebookStore.getState();
    const first = firstContentNode();
    store.editMarkdown(first.id, "some text");
    store.mergeWithPrev(first.id);
    const state = useNotebookStore.getState();
    expect(state.nodes[first.id].deletedAt).toBeNull();
  });

  it("does nothing when target is a date node", () => {
    const store = useNotebookStore.getState();
    const date = Object.values(useNotebookStore.getState().nodes).find((node) => node.kind === "date")!;
    store.mergeWithPrev(date.id);
    const state = useNotebookStore.getState();
    expect(state.nodes[date.id].deletedAt).toBeNull();
  });
});

describe("explicit row deletion", () => {
  it("deletes a selected parent as a complete subtree without listing descendants separately", () => {
    const store = useNotebookStore.getState();
    const parent = firstContentNode();
    const childId = store.createChild(parent.id, "child")!;
    const grandchildId = store.createChild(childId, "grandchild")!;

    store.removeNodes([parent.id]);

    const state = useNotebookStore.getState();
    expect(state.nodes[parent.id].deletedAt).not.toBeNull();
    expect(state.nodes[childId].deletedAt).not.toBeNull();
    expect(state.nodes[grandchildId].deletedAt).not.toBeNull();
  });

  it("focuses the date ghost after deleting its only content child", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    const dateId = node.parentId!;
    expect(store.nodes[dateId].kind).toBe("date");
    store.openRoot(dateId);

    for (const sibling of childrenOf(useNotebookStore.getState(), dateId)) {
      if (sibling.id !== node.id) useNotebookStore.getState().remove(sibling.id);
    }
    useNotebookStore.getState().remove(node.id);

    const state = useNotebookStore.getState();
    expect(state.activeNodeId).toBeNull();
    expect(state.activeGhostParentId).toBe(dateId);
  });
});
