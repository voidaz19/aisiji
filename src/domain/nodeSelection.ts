import type { NotebookState } from "./model";

export interface NodeRangeSelection {
  anchorKey: string;
  headKey: string;
}

export interface VisibleSelectionEntry {
  key: string;
  depth: number;
}

export interface ExpandedSubtreeSelection {
  keys: string[];
  rootKeys: string[];
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

/** Expands explicitly selected rows to their complete visible subtrees. */
export function expandSelectionToSubtrees(
  entries: readonly VisibleSelectionEntry[],
  explicitKeys: readonly string[],
): ExpandedSubtreeSelection {
  const explicit = new Set(explicitKeys);
  const expanded = new Set<string>();
  const rootKeys: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!explicit.has(entry.key)) continue;
    if (!expanded.has(entry.key)) rootKeys.push(entry.key);
    expanded.add(entry.key);
    for (let cursor = index + 1; cursor < entries.length; cursor += 1) {
      const descendant = entries[cursor];
      if (descendant.depth <= entry.depth) break;
      expanded.add(descendant.key);
    }
  }

  return {
    keys: entries.filter((entry) => expanded.has(entry.key)).map((entry) => entry.key),
    rootKeys,
  };
}

/**
 * Keeps only deletable content roots. Date rows and transient placeholder rows can
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
