import type { TreeLayoutGap } from "../../../shared/treeLayout";

export interface VisibleLayoutNode {
  id?: string;
  depth?: number;
}

export interface VisibleSubtreeNode extends VisibleLayoutNode {
  id: string;
}

export interface VisibleSubtreeGroup {
  rootId: string;
  depth: number;
  startIndex: number;
  endIndex: number;
}

export interface MeasuredTreeRow {
  key: string;
  depth: number;
  top: number;
  bottom: number;
}

export interface MeasuredTreeBlock {
  rootId: string;
  depth: number;
  top: number;
  bottom: number;
  rootHeight: number;
  isSubtree: boolean;
}

/** Describes which kind of vertical space follows a visible node. */
export function visibleLayoutGap(
  nodes: readonly VisibleLayoutNode[],
  index: number,
): TreeLayoutGap {
  const current = nodes[index];
  const next = nodes[index + 1];
  if (!current) return "between-subtrees";

  const currentDepth = current.depth ?? 0;
  if (!next) return currentDepth > 0 ? "subtree-end" : "between-subtrees";
  const nextDepth = next.depth ?? 0;
  if (nextDepth > currentDepth) return "inside-subtree";
  if (nextDepth < currentDepth) return "subtree-end";
  return "between-subtrees";
}

/** Counts how many nested subtree boundaries are crossed after a visible row. */
export function visibleSubtreeExitCount(
  nodes: readonly VisibleLayoutNode[],
  index: number,
): number {
  const current = nodes[index];
  if (!current) return 0;
  const currentDepth = current.depth ?? 0;
  const nextDepth = nodes[index + 1]?.depth ?? 0;
  return Math.max(0, currentDepth - nextDepth);
}

/** Returns one fixed inset for every containing subtree boundary. */
export function subtreeBottomInset(rootDepth: number, lastDepth: number, gap: number): number {
  return Math.max(0, lastDepth - rootDepth) * gap;
}

/** Measures every node block and expanded subtree block from the same row geometry. */
export function measuredTreeBlocks(rows: readonly MeasuredTreeRow[], subtreeGap: number): MeasuredTreeBlock[] {
  const endIndices = new Array<number>(rows.length);
  const openRoots: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    while (openRoots.length && rows[openRoots[openRoots.length - 1]].depth >= rows[index].depth) {
      endIndices[openRoots.pop()!] = index - 1;
    }
    openRoots.push(index);
  }
  while (openRoots.length) endIndices[openRoots.pop()!] = rows.length - 1;

  return rows.map((root, startIndex) => {
    const endIndex = endIndices[startIndex];
    const last = rows[endIndex];
    return {
      rootId: root.key,
      depth: root.depth,
      top: root.top,
      bottom: last.bottom + subtreeBottomInset(root.depth, last.depth, subtreeGap),
      rootHeight: root.bottom - root.top,
      isSubtree: endIndex > startIndex,
    };
  });
}

/** Finds visible parent subtrees without depending on DOM geometry. */
export function visibleSubtreeGroups(nodes: readonly VisibleSubtreeNode[]): VisibleSubtreeGroup[] {
  const groups: VisibleSubtreeGroup[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const root = nodes[index];
    const firstChild = nodes[index + 1];
    const rootDepth = root.depth ?? 0;
    if (!firstChild || (firstChild.depth ?? 0) <= rootDepth) continue;
    let endIndex = index + 1;
    while (endIndex + 1 < nodes.length && (nodes[endIndex + 1].depth ?? 0) > rootDepth) endIndex += 1;
    groups.push({ rootId: root.id, depth: rootDepth, startIndex: index, endIndex });
  }
  return groups;
}
