import { ROOT_ID, type NodeRecord, type NotebookState } from "./model";
import { buildChildIndex, isDescendant, type ChildIndex } from "./tree";

export interface VisibleTreeNode extends NodeRecord {
  depth: number;
}

export interface VisibleDropPlaceholder {
  parentId: string;
}

export interface TreeDropBlockAnchor {
  kind: "block" | "subtree";
  key: string;
}

/** A semantic gap in the flattened outline. No screen coordinate is stored here. */
export interface TreeDropSlot {
  id: string;
  parentId: string;
  beforeId: string | null;
  depth: number;
  afterBlock: TreeDropBlockAnchor | null;
  nextBlockKey: string | null;
  /** The slot is the dragged block's current position and therefore a no-op. */
  isNoop?: boolean;
}

interface MovingPosition {
  parentId: string;
  nextSiblingId: string | null;
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
  placeholders: readonly VisibleDropPlaceholder[] = [],
): TreeDropSlot[] {
  const entries = visibleNodes.filter((entry) => {
    const node = state.nodes[entry.id];
    return Boolean(node && !node.deletedAt);
  });
  if (!entries.length || (movingNodeId && state.nodes[movingNodeId]?.kind === "date")) return [];

  const slots: TreeDropSlot[] = [];
  const slotIds = new Set<string>();
  const childIndex = buildChildIndex(state);
  const movingPosition = currentMovingPosition(state, movingNodeId, childIndex);
  const placeholderParentIds = new Set(placeholders.map((placeholder) => placeholder.parentId));
  const addSlot = (
    parentId: string,
    beforeId: string | null,
    depth: number,
    afterBlock: TreeDropBlockAnchor | null,
    nextBlockKey: string | null,
  ) => {
    const isNoop = isCurrentPositionSlot(parentId, beforeId, movingNodeId, movingPosition);
    if (!isNoop && !isValidDropSlot(state, parentId, beforeId, movingNodeId, movingPosition)) return;
    const id = `${parentId}:${beforeId ?? "end"}`;
    if (slotIds.has(id)) return;
    slotIds.add(id);
    slots.push({ id, parentId, beforeId, depth, afterBlock, nextBlockKey, isNoop: isNoop || undefined });
  };

  const first = entries[0];
  addSlot(first.parentId ?? rootId, first.id, first.depth, null, first.id);

  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index];
    const next = entries[index + 1];

    if (next && next.depth > current.depth) {
      addSlot(next.parentId ?? current.id, next.id, next.depth, { kind: "block", key: current.id }, next.id);
      continue;
    }

    const outerDepth = next?.depth ?? 0;
    for (let depth = current.depth; depth >= outerDepth; depth -= 1) {
      const ancestor = ancestorAtDepth(state, current, depth);
      if (!ancestor) continue;
      const parentId = ancestor.parentId ?? rootId;
      const beforeId = next && next.depth === depth && next.parentId === parentId ? next.id : null;
      addSlot(
        parentId,
        beforeId,
        depth,
        {
          kind: ancestor.id === current.id && !placeholderParentIds.has(ancestor.id) ? "block" : "subtree",
          key: ancestor.id,
        },
        next?.id ?? null,
      );
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
  movingPosition?: MovingPosition | null,
): boolean {
  const parent = state.nodes[parentId];
  if (parentId !== ROOT_ID && (!parent || parent.deletedAt)) return false;
  if (!movingNodeId) return true;

  const moving = state.nodes[movingNodeId];
  if (!moving || moving.deletedAt || moving.kind === "date") return false;
  if (parentId === movingNodeId || isDescendant(state, parentId, movingNodeId)) return false;

  if (movingPosition
    && parentId === movingPosition.parentId
    && beforeId === movingPosition.nextSiblingId) return false;

  if (!beforeId) return true;
  const target = state.nodes[beforeId];
  if (!target || target.deletedAt || target.kind === "date" || target.parentId !== parentId) return false;
  if (beforeId === movingNodeId || isDescendant(state, beforeId, movingNodeId)) return false;
  return true;
}

function isCurrentPositionSlot(
  parentId: string,
  beforeId: string | null,
  movingNodeId?: string | null,
  movingPosition?: MovingPosition | null,
): boolean {
  if (!movingNodeId || !movingPosition || parentId !== movingPosition.parentId) return false;

  // Keep both sides of the source block as neutral boundaries. The self-target
  // form is never executable, but it prevents the previous block's lower half
  // from being merged into a neighboring valid slot during hit testing.
  if (beforeId === movingNodeId) return true;
  return beforeId === movingPosition.nextSiblingId;
}

function currentMovingPosition(
  state: NotebookState,
  movingNodeId: string | null | undefined,
  childIndex: ChildIndex,
): MovingPosition | null {
  if (!movingNodeId) return null;
  const moving = state.nodes[movingNodeId];
  if (!moving || moving.deletedAt || moving.kind === "date") return null;
  const parentId = moving.parentId ?? ROOT_ID;
  const siblings = (childIndex.get(parentId) ?? []).filter((node) => node.kind !== "date");
  const currentIndex = siblings.findIndex((node) => node.id === movingNodeId);
  if (currentIndex < 0) return null;
  return {
    parentId,
    nextSiblingId: siblings[currentIndex + 1]?.id ?? null,
  };
}
