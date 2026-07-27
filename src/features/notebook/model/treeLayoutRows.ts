import type { NodeRecord, NotebookState } from "../../../domain/model";
import { childrenOf, isNodeExpanded } from "../../../domain/tree";

export type TreeLayoutRow =
  | { kind: "node"; key: string; depth: number; node: NodeRecord & { depth?: number } }
  | { kind: "ghost"; key: string; depth: number; parentId: string };

/** Builds the exact row sequence rendered by the tree before spacing is classified. */
export function treeLayoutRows(
  nodes: readonly (NodeRecord & { depth?: number })[],
  state: NotebookState,
  ghostSuppressed: Readonly<Record<string, boolean>>,
  rootGhostParentId: string | null,
): TreeLayoutRow[] {
  const rows: TreeLayoutRow[] = [];

  for (const node of nodes) {
    const depth = node.depth ?? 0;
    rows.push({ kind: "node", key: node.id, depth, node });

    const showsChildGhost = isNodeExpanded(state, node.id)
      && childrenOf(state, node.id).length === 0
      && ghostSuppressed[node.id] !== true;
    if (showsChildGhost) {
      rows.push({ kind: "ghost", key: `ghost:${node.id}`, depth: depth + 1, parentId: node.id });
    }
  }

  if (rootGhostParentId !== null) {
    rows.push({ kind: "ghost", key: `ghost:${rootGhostParentId}`, depth: 0, parentId: rootGhostParentId });
  }

  return rows;
}
