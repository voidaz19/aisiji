import type { NotebookState } from "./model";
import { childrenOf, deleteSubtree, isDescendant, moveAsLastChild, moveBefore } from "./tree";

export type EmptyNodeTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "placeholder"; parentId: string };

export function canDropOnEmptyNode(
  state: NotebookState,
  movingNodeId: string,
  target: EmptyNodeTarget,
): boolean {
  const moving = state.nodes[movingNodeId];
  if (!moving || moving.deletedAt || moving.kind === "date") return false;

  if (target.kind === "node") {
    const node = state.nodes[target.nodeId];
    if (!node || node.deletedAt || node.kind !== "content" || node.markdown.trim().length > 0) return false;
    if (movingNodeId === target.nodeId || isDescendant(state, target.nodeId, movingNodeId)) return false;
    return childrenOf(state, target.nodeId).length === 0;
  }

  const parent = state.nodes[target.parentId];
  if (!parent || parent.deletedAt) return false;
  return target.parentId !== movingNodeId && !isDescendant(state, target.parentId, movingNodeId);
}

export function moveToEmptyNode(
  state: NotebookState,
  movingNodeId: string,
  target: EmptyNodeTarget,
  now = Date.now(),
): NotebookState {
  if (!canDropOnEmptyNode(state, movingNodeId, target)) return state;

  if (target.kind === "placeholder") {
    return moveAsLastChild(state, movingNodeId, target.parentId, now);
  }

  const moved = moveBefore(state, movingNodeId, target.nodeId, now);
  return deleteSubtree(moved, target.nodeId, now);
}
