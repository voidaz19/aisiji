import type { NotebookState } from "../model";
import { moveToEmptyNode, type EmptyNodeTarget } from "../emptyDrop";
import { createNode, indentNode, moveAfter, moveAsFirstChild, moveAsLastChild, moveBefore, outdentNode } from "../tree";

export type MoveNodeIntent =
  | { type: "indent"; nodeId: string }
  | { type: "outdent"; nodeId: string; boundaryRootId: string }
  | { type: "before"; nodeId: string; targetId: string }
  | { type: "after"; nodeId: string; targetId: string }
  | { type: "first-child"; nodeId: string; parentId: string }
  | { type: "last-child"; nodeId: string; parentId: string }
  | { type: "slot"; nodeId: string; parentId: string; beforeId: string | null }
  | { type: "empty-node"; nodeId: string; target: EmptyNodeTarget };

export type MoveNodeCommand = MoveNodeIntent & { now: number };

export interface MoveNodeResult {
  state: NotebookState;
  changed: boolean;
}

export type DraftMoveIntent =
  | { type: "indent"; parentId: string }
  | { type: "outdent"; parentId: string; boundaryRootId: string };

/** Previews a draft through the real move command without persisting it. */
export function canExecuteDraftMove(state: NotebookState, intent: DraftMoveIntent): boolean {
  let candidateId = "__draft_move_candidate__";
  while (state.nodes[candidateId]) candidateId += "_";
  const candidate = createNode(state, intent.parentId, "", "content", null, null, {
    nodeId: candidateId,
    now: 0,
  });
  const command: MoveNodeCommand = intent.type === "indent"
    ? { type: "indent", nodeId: candidateId, now: 0 }
    : { type: "outdent", nodeId: candidateId, boundaryRootId: intent.boundaryRootId, now: 0 };
  return executeMoveNode(candidate.state, command).changed;
}

export function executeMoveNode(state: NotebookState, command: MoveNodeCommand): MoveNodeResult {
  let next: NotebookState;
  switch (command.type) {
    case "indent":
      next = indentNode(state, command.nodeId, command.now);
      break;
    case "outdent":
      next = state.nodes[command.nodeId]?.parentId === command.boundaryRootId
        ? state
        : outdentNode(state, command.nodeId, command.now);
      break;
    case "before":
      next = moveBefore(state, command.nodeId, command.targetId, command.now);
      break;
    case "after":
      next = moveAfter(state, command.nodeId, command.targetId, command.now);
      break;
    case "first-child":
      next = moveAsFirstChild(state, command.nodeId, command.parentId, command.now);
      break;
    case "last-child":
      next = moveAsLastChild(state, command.nodeId, command.parentId, command.now);
      break;
    case "slot":
      next = command.beforeId
        ? moveBefore(state, command.nodeId, command.beforeId, command.now)
        : moveAsLastChild(state, command.nodeId, command.parentId, command.now);
      break;
    case "empty-node":
      next = moveToEmptyNode(state, command.nodeId, command.target, command.now);
      break;
  }
  return { state: next, changed: next !== state };
}
