import { executeMergeNode, type MergeNodeResult } from "../../domain/commands/mergeNode";
import { ROOT_ID, type NotebookState, type Operation } from "../../domain/model";
import { childrenOf, isNodeExpanded, lastVisibleNodeInSubtree } from "../../domain/tree";
import type { NotebookStore } from "../notebookStore.types";
import { shakeNodeTree } from "../uiFeedback";

function hasVisibleChildGhost(state: NotebookStore, nodeId: string): boolean {
  return childrenOf(state, nodeId).length === 0
    && isNodeExpanded(state, nodeId)
    && state.ghostSuppressed[nodeId] !== true;
}

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
  const applyResult = (nodeId: string, result: MergeNodeResult) => {
    if (result.status === "rejected") {
      shakeNodeTree(get(), nodeId);
      return;
    }
    if (result.status === "ignored") return;
    const removedParentId = get().nodes[result.removedNodeId]?.parentId;
    commit(result.state);
    focusAfterNodeRemoval(
      result.removedNodeId,
      result.focus.activeNodeId,
      result.focus.cursor,
      result.focus.replacementRootId,
      result.focus.activeGhostParentId,
    );
    const focusNodeId = result.focus.activeNodeId;
    if (focusNodeId) {
      set((current) => ({
        activeGhostParentId: null,
        ghostSuppressed: removedParentId === focusNodeId
          ? { ...current.ghostSuppressed, [focusNodeId]: false }
          : current.ghostSuppressed,
      }));
    } else if (result.focus.activeGhostParentId) {
      set((current) => ({
        ghostSuppressed: { ...current.ghostSuppressed, [result.focus.activeGhostParentId!]: false },
      }));
    }
  };

  return {
    mergeWithPrev: (nodeId: string) => {
      const state = get();
      const node = state.nodes[nodeId];
      const parentId = node ? (node.parentId ?? ROOT_ID) : null;
      const siblings = parentId ? childrenOf(state, parentId).filter((candidate) => candidate.kind !== "date") : [];
      const index = siblings.findIndex((candidate) => candidate.id === nodeId);
      const previous = index > 0 ? siblings[index - 1] : undefined;
      const previousTarget = node?.markdown === "" && previous
        ? (lastVisibleNodeInSubtree(state, previous.id) ?? previous)
        : previous;
      applyResult(nodeId, executeMergeNode(state, {
        direction: "previous",
        nodeId,
        activeRootId: state.activeRootId,
        now: Date.now(),
        previousMergeTargetId: previousTarget?.id,
        previousHasVisibleChildGhost: previous ? hasVisibleChildGhost(state, previous.id) : false,
      }));
    },

    mergeWithNext: (nodeId: string) => {
      const state = get();
      applyResult(nodeId, executeMergeNode(state, {
        direction: "next",
        nodeId,
        activeRootId: state.activeRootId,
        now: Date.now(),
      }));
    },
  } satisfies Pick<NotebookStore, "mergeWithPrev" | "mergeWithNext">;
}
