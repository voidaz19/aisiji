import { ROOT_ID, type NodeRecord, type NotebookState } from "./model";
import { childrenOf, isDescendant } from "./tree";

export interface VisibleTreeNode extends NodeRecord {
  depth: number;
}

/** A semantic gap in the flattened outline. No screen coordinate is stored here. */
export interface TreeDropSlot {
  id: string;
  parentId: string;
  beforeId: string | null;
  depth: number;
  afterNodeId: string | null;
  nextNodeId: string | null;
}

/**
 * Creates the vertical insertion slots exposed by the current outline.
 * Slots at the end of a subtree are emitted from the deepest level outward,
 * which lets the interaction layer resolve indentation from vertical motion.
 */
export function createTreeDropSlots(
  state: NotebookState,
  visibleNodes: readonly VisibleTreeNode[],
  rootId: string,
  movingNodeId?: string | null,
): TreeDropSlot[] {
  const entries = visibleNodes.filter((entry) => {
    const node = state.nodes[entry.id];
    return Boolean(node && !node.deletedAt);
  });
  if (!entries.length || (movingNodeId && state.nodes[movingNodeId]?.kind === "date")) return [];

  const slots: TreeDropSlot[] = [];
  const addSlot = (
    parentId: string,
    beforeId: string | null,
    depth: number,
    afterNodeId: string | null,
    nextNodeId: string | null,
  ) => {
    if (!isValidDropSlot(state, parentId, beforeId, movingNodeId)) return;
    const id = `${parentId}:${beforeId ?? "end"}`;
    if (slots.some((slot) => slot.id === id)) return;
    slots.push({ id, parentId, beforeId, depth, afterNodeId, nextNodeId });
  };

  const first = entries[0];
  addSlot(first.parentId ?? rootId, first.id, first.depth, null, first.id);

  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index];
    const next = entries[index + 1];

    if (next && next.depth > current.depth) {
      addSlot(next.parentId ?? current.id, next.id, next.depth, current.id, next.id);
      continue;
    }

    const outerDepth = next?.depth ?? 0;
    for (let depth = current.depth; depth >= outerDepth; depth -= 1) {
      const ancestor = ancestorAtDepth(state, current, depth);
      if (!ancestor) continue;
      const parentId = ancestor.parentId ?? rootId;
      const beforeId = next && next.depth === depth && next.parentId === parentId ? next.id : null;
      addSlot(parentId, beforeId, depth, current.id, next?.id ?? null);
    }
  }

  return slots;
}

function ancestorAtDepth(state: NotebookState, current: VisibleTreeNode, targetDepth: number): NodeRecord | undefined {
  let node: NodeRecord | undefined = state.nodes[current.id];
  let depth = current.depth;
  while (node && depth > targetDepth) {
    node = node.parentId ? state.nodes[node.parentId] : undefined;
    depth -= 1;
  }
  return node;
}

function isValidDropSlot(
  state: NotebookState,
  parentId: string,
  beforeId: string | null,
  movingNodeId?: string | null,
): boolean {
  const parent = state.nodes[parentId];
  if (parentId !== ROOT_ID && (!parent || parent.deletedAt)) return false;
  if (!movingNodeId) return true;

  const moving = state.nodes[movingNodeId];
  if (!moving || moving.deletedAt || moving.kind === "date") return false;
  if (parentId === movingNodeId || isDescendant(state, parentId, movingNodeId)) return false;

  const currentParentId = moving.parentId ?? ROOT_ID;
  const siblings = childrenOf(state, currentParentId).filter((node) => node.kind !== "date");
  const currentIndex = siblings.findIndex((node) => node.id === movingNodeId);
  const nextSibling = currentIndex >= 0 ? siblings[currentIndex + 1] : undefined;
  if (parentId === currentParentId && (beforeId === nextSibling?.id || (beforeId === null && !nextSibling))) return false;

  if (!beforeId) return true;
  const target = state.nodes[beforeId];
  if (!target || target.deletedAt || target.kind === "date" || target.parentId !== parentId) return false;
  if (beforeId === movingNodeId || isDescendant(state, beforeId, movingNodeId)) return false;
  return true;
}
