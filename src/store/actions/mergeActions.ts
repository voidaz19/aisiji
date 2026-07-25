import { ROOT_ID, type NotebookState, type Operation } from "../../domain/model";
import { childrenOf, deleteSubtree, lastVisibleNodeInSubtree, updateMarkdown } from "../../domain/tree";
import type { NotebookStore } from "../notebookStore.types";
import { shakeNodeTree } from "../uiFeedback";

interface Context {
  get: () => NotebookStore;
  set: (patch: Partial<NotebookStore> | ((state: NotebookStore) => Partial<NotebookStore>)) => void;
  commit: (next: NotebookState, operation?: Operation) => void;
  focusAfterNodeRemoval: (
    removedNodeId: string,
    activeNodeId: string | null,
    cursor: number | "end" | null,
    replacementRootId?: string,
    activeGhostParentId?: string | null,
  ) => void;
}

export function createMergeActions({ get, set, commit, focusAfterNodeRemoval }: Context) {
  return {
    mergeWithPrev: (nodeId: string) => {
      const state = get();
      const node = state.nodes[nodeId];
      if (!node || node.kind === "date" || state.activeRootId === nodeId) return;
      const parentId = node.parentId ?? ROOT_ID;
      if (childrenOf(state, nodeId).length > 0) {
        shakeNodeTree(state, nodeId);
        return;
      }

      const siblings = childrenOf(state, parentId).filter((candidate) => candidate.kind !== "date");
      const index = siblings.findIndex((candidate) => candidate.id === nodeId);
      if (index > 0) {
        const previous = siblings[index - 1];
        const target = node.markdown === ""
          ? (lastVisibleNodeInSubtree(state, previous.id) ?? previous)
          : previous;
        const mergePosition = target.markdown.length;
        let next = updateMarkdown(state, target.id, target.markdown + node.markdown);
        next = deleteSubtree(next, nodeId);
        commit(next);
        focusAfterNodeRemoval(nodeId, target.id, mergePosition);
        return;
      }

      const parent = parentId !== ROOT_ID ? state.nodes[parentId] : null;
      if (parent && parent.kind !== "date") {
        const mergePosition = parent.markdown.length;
        let next = updateMarkdown(state, parent.id, parent.markdown + node.markdown);
        next = deleteSubtree(next, nodeId);
        commit(next);
        if (node.markdown === "") {
          set((current) => ({
            ghostSuppressed: { ...current.ghostSuppressed, [parent.id]: true },
          }));
        }
        focusAfterNodeRemoval(nodeId, parent.id, mergePosition);
        return;
      }

      if (node.markdown !== "") {
        shakeNodeTree(state, nodeId);
        return;
      }
      if (siblings.length > 1) {
        const nextSibling = siblings[index + 1] ?? siblings[1];
        commit(deleteSubtree(state, nodeId));
        if (nextSibling) focusAfterNodeRemoval(nodeId, nextSibling.id, 0);
        return;
      }
      commit(deleteSubtree(state, nodeId));
      focusAfterNodeRemoval(nodeId, null, null, parentId, parentId);
    },

    mergeWithNext: (nodeId: string) => {
      const state = get();
      const node = state.nodes[nodeId];
      if (!node || node.kind === "date" || state.activeRootId === nodeId) return;
      const parentId = node.parentId ?? ROOT_ID;
      const siblings = childrenOf(state, parentId).filter((candidate) => candidate.kind !== "date");
      const index = siblings.findIndex((candidate) => candidate.id === nodeId);
      if (index < 0 || index >= siblings.length - 1) {
        shakeNodeTree(state, nodeId);
        return;
      }
      const nextNode = siblings[index + 1];
      if (childrenOf(state, nextNode.id).length > 0) {
        shakeNodeTree(state, nodeId);
        return;
      }
      const mergePosition = node.markdown.length;
      let next = updateMarkdown(state, nodeId, node.markdown + nextNode.markdown);
      next = deleteSubtree(next, nextNode.id);
      commit(next);
      set({ activeNodeId: nodeId, activeNodeCursor: mergePosition, activeGhostParentId: null });
    },
  } satisfies Pick<NotebookStore, "mergeWithPrev" | "mergeWithNext">;
}
