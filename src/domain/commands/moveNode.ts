import { ROOT_ID, type NotebookState } from "../model";
import { moveToEmptyNode, type EmptyNodeTarget } from "../emptyDrop";
import { selectedContentRoots } from "../nodeSelection";
import { buildChildIndex, createNode, indentNode, moveAfter, moveAsFirstChild, moveAsLastChild, moveBefore, outdentNode } from "../tree";

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

export interface MoveSelectionResult extends MoveNodeResult {
  movedNodeIds: string[];
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

/**
 * Indents every selected subtree root under its nearest preceding unselected
 * sibling. Targets are planned from the original tree, so adjacent selected
 * siblings move together instead of nesting into each other.
 */
export function executeIndentSelection(
  state: NotebookState,
  nodeIds: readonly string[],
  now: number,
): MoveSelectionResult {
  const roots = new Set(selectedContentRoots(state, nodeIds));
  if (!roots.size) return { state, changed: false, movedNodeIds: [] };

  const childIndex = buildChildIndex(state);
  const plans: Array<{ nodeId: string; targetId: string }> = [];
  const visit = (parentId: string) => {
    const siblings = childIndex.get(parentId) ?? [];
    for (let index = 0; index < siblings.length; index += 1) {
      const node = siblings[index];
      if (roots.has(node.id)) {
        let previousIndex = index - 1;
        while (previousIndex >= 0 && roots.has(siblings[previousIndex].id)) previousIndex -= 1;
        const target = siblings[previousIndex];
        if (target && target.kind === "content") plans.push({ nodeId: node.id, targetId: target.id });
      }
      visit(node.id);
    }
  };
  visit(ROOT_ID);

  let next = state;
  const movedNodeIds: string[] = [];
  for (const plan of plans) {
    const moved = moveAsLastChild(next, plan.nodeId, plan.targetId, now);
    if (moved === next) continue;
    next = moved;
    movedNodeIds.push(plan.nodeId);
  }
  return { state: next, changed: next !== state, movedNodeIds };
}

/** Lifts selected subtree roots one level while preserving sibling order. */
export function executeOutdentSelection(
  state: NotebookState,
  nodeIds: readonly string[],
  boundaryRootId: string,
  now: number,
): MoveSelectionResult {
  const roots = selectedContentRoots(state, nodeIds);
  const movable = roots.filter((nodeId) => {
    const parentId = state.nodes[nodeId]?.parentId;
    return Boolean(parentId && parentId !== boundaryRootId && state.nodes[parentId]?.kind === "content");
  });
  if (!movable.length) return { state, changed: false, movedNodeIds: [] };

  let next = state;
  const moved = new Set<string>();
  // moveAfter inserts directly after the old parent. Reverse execution keeps
  // selected siblings in their original top-to-bottom order.
  for (const nodeId of [...movable].reverse()) {
    const parentId = state.nodes[nodeId]?.parentId;
    if (!parentId) continue;
    const lifted = outdentNode(next, nodeId, now);
    if (lifted === next) continue;
    next = lifted;
    moved.add(nodeId);
  }
  return {
    state: next,
    changed: next !== state,
    movedNodeIds: roots.filter((nodeId) => moved.has(nodeId)),
  };
}
