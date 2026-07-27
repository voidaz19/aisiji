import type { NotebookState } from "./model";

export interface NodeRangeSelection {
  anchorKey: string;
  headKey: string;
}

/** Returns the inclusive range in current visual order, regardless of drag direction. */
export function keysInRange(order: readonly string[], selection: NodeRangeSelection): string[] {
  const anchorIndex = order.indexOf(selection.anchorKey);
  const headIndex = order.indexOf(selection.headKey);
  if (anchorIndex < 0 || headIndex < 0) return [];
  const from = Math.min(anchorIndex, headIndex);
  const to = Math.max(anchorIndex, headIndex);
  return order.slice(from, to + 1);
}

/**
 * Keeps only deletable content roots. Date rows and transient ghost rows can
 * participate in a visual selection, but are not deleted as notebook data.
 */
export function selectedContentRoots(state: NotebookState, keys: readonly string[]): string[] {
  const selected = new Set(
    keys.filter((key) => {
      const node = state.nodes[key];
      return Boolean(node && !node.deletedAt && node.kind === "content");
    }),
  );

  return [...selected].filter((nodeId) => {
    let parentId = state.nodes[nodeId]?.parentId ?? null;
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = state.nodes[parentId]?.parentId ?? null;
    }
    return true;
  });
}
