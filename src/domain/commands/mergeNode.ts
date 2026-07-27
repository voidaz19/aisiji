import { ROOT_ID, type NotebookState } from "../model";
import { childrenOf, deleteSubtree, updateMarkdown } from "../tree";

export type MergeDirection = "previous" | "next";

export interface MergeNodeCommand {
  direction: MergeDirection;
  nodeId: string;
  activeRootId: string;
  now: number;
  /** Resolved by the interaction layer because it depends on current visibility. */
  previousMergeTargetId?: string;
  previousHasVisibleChildGhost?: boolean;
}

export interface MergeFocus {
  activeNodeId: string | null;
  cursor: number | "end" | null;
  activeGhostParentId: string | null;
  replacementRootId?: string;
}

export type MergeNodeResult =
  | { status: "applied"; state: NotebookState; removedNodeId: string; focus: MergeFocus }
  | { status: "rejected"; state: NotebookState; reason: "has-children" | "no-merge-target" }
  | { status: "ignored"; state: NotebookState };

function collapseIfEmpty(state: NotebookState, parentId: string): NotebookState {
  if (childrenOf(state, parentId).length > 0) return state;
  return { ...state, collapsed: { ...state.collapsed, [parentId]: true } };
}

function mergeWithPrevious(state: NotebookState, command: MergeNodeCommand): MergeNodeResult {
  const node = state.nodes[command.nodeId];
  if (!node || node.deletedAt || node.kind === "date" || command.activeRootId === node.id) {
    return { status: "ignored", state };
  }
  if (childrenOf(state, node.id).length > 0) {
    return { status: "rejected", state, reason: "has-children" };
  }

  const parentId = node.parentId ?? ROOT_ID;
  const siblings = childrenOf(state, parentId).filter((candidate) => candidate.kind !== "date");
  const index = siblings.findIndex((candidate) => candidate.id === node.id);
  if (index > 0) {
    const previous = siblings[index - 1];
    if (node.markdown === "" && command.previousHasVisibleChildGhost) {
      return {
        status: "applied",
        state: deleteSubtree(state, node.id, command.now),
        removedNodeId: node.id,
        focus: {
          activeNodeId: null,
          cursor: null,
          activeGhostParentId: previous.id,
          replacementRootId: command.activeRootId,
        },
      };
    }

    const target = state.nodes[command.previousMergeTargetId ?? previous.id] ?? previous;
    const mergePosition = target.markdown.length;
    let next = updateMarkdown(state, target.id, target.markdown + node.markdown, command.now);
    next = deleteSubtree(next, node.id, command.now);
    next = collapseIfEmpty(next, parentId);
    return {
      status: "applied",
      state: next,
      removedNodeId: node.id,
      focus: { activeNodeId: target.id, cursor: mergePosition, activeGhostParentId: null },
    };
  }

  const parent = parentId !== ROOT_ID ? state.nodes[parentId] : null;
  if (parent && parent.kind !== "date") {
    const mergePosition = parent.markdown.length;
    let next = updateMarkdown(state, parent.id, parent.markdown + node.markdown, command.now);
    next = deleteSubtree(next, node.id, command.now);
    next = collapseIfEmpty(next, parent.id);
    return {
      status: "applied",
      state: next,
      removedNodeId: node.id,
      focus: { activeNodeId: parent.id, cursor: mergePosition, activeGhostParentId: null },
    };
  }

  if (node.markdown !== "") {
    return { status: "rejected", state, reason: "no-merge-target" };
  }
  if (siblings.length > 1) {
    const nextSibling = siblings[index + 1] ?? siblings[1];
    return {
      status: "applied",
      state: deleteSubtree(state, node.id, command.now),
      removedNodeId: node.id,
      focus: { activeNodeId: nextSibling?.id ?? null, cursor: nextSibling ? 0 : null, activeGhostParentId: null },
    };
  }

  const next = collapseIfEmpty(deleteSubtree(state, node.id, command.now), parentId);
  return {
    status: "applied",
    state: next,
    removedNodeId: node.id,
    focus: { activeNodeId: null, cursor: null, activeGhostParentId: parentId, replacementRootId: parentId },
  };
}

function mergeWithNext(state: NotebookState, command: MergeNodeCommand): MergeNodeResult {
  const node = state.nodes[command.nodeId];
  if (!node || node.deletedAt || node.kind === "date" || command.activeRootId === node.id) {
    return { status: "ignored", state };
  }

  const parentId = node.parentId ?? ROOT_ID;
  const siblings = childrenOf(state, parentId).filter((candidate) => candidate.kind !== "date");
  const index = siblings.findIndex((candidate) => candidate.id === node.id);
  if (index < 0 || index >= siblings.length - 1) {
    return { status: "rejected", state, reason: "no-merge-target" };
  }
  const nextNode = siblings[index + 1];
  if (childrenOf(state, nextNode.id).length > 0) {
    return { status: "rejected", state, reason: "has-children" };
  }

  const mergePosition = node.markdown.length;
  let next = updateMarkdown(state, node.id, node.markdown + nextNode.markdown, command.now);
  next = deleteSubtree(next, nextNode.id, command.now);
  return {
    status: "applied",
    state: next,
    removedNodeId: nextNode.id,
    focus: { activeNodeId: node.id, cursor: mergePosition, activeGhostParentId: null },
  };
}

export function executeMergeNode(state: NotebookState, command: MergeNodeCommand): MergeNodeResult {
  return command.direction === "previous"
    ? mergeWithPrevious(state, command)
    : mergeWithNext(state, command);
}
