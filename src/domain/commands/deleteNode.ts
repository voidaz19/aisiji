import { ROOT_ID, type NotebookState } from "../model";
import { selectedContentRoots } from "../nodeSelection";
import { childrenOf, deleteSubtree, deleteSubtrees, restoreSubtree } from "../tree";

export type DeleteNodeResult =
  | { status: "applied"; state: NotebookState; nodeId: string; parentId: string }
  | {
    status: "rejected";
    state: NotebookState;
    reason: "node-not-found" | "node-not-deletable" | "has-children";
  };

export function executeDeleteNode(state: NotebookState, nodeId: string, now: number): DeleteNodeResult {
  const node = state.nodes[nodeId];
  if (!node) return { status: "rejected", state, reason: "node-not-found" };
  if (node.deletedAt || node.kind !== "content") {
    return { status: "rejected", state, reason: "node-not-deletable" };
  }
  if (childrenOf(state, nodeId).length > 0) {
    return { status: "rejected", state, reason: "has-children" };
  }
  return {
    status: "applied",
    state: deleteSubtree(state, nodeId, now),
    nodeId,
    parentId: node.parentId ?? ROOT_ID,
  };
}

export interface DeleteSelectionResult {
  state: NotebookState;
  roots: string[];
}

export function executeDeleteSelection(
  state: NotebookState,
  nodeIds: readonly string[],
  now: number,
): DeleteSelectionResult {
  const roots = selectedContentRoots(state, nodeIds);
  return {
    state: roots.length ? deleteSubtrees(state, roots, now) : state,
    roots,
  };
}

export function executeRestoreSubtree(state: NotebookState, nodeId: string, now: number): NotebookState {
  return restoreSubtree(state, nodeId, now);
}
