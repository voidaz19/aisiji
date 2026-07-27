import type { TreeBlock } from "../../../components/treeBlock";
import type { NodeRecord, NotebookState } from "../../../domain/model";
import { ROOT_ID } from "../../../domain/model";
import { childrenOf, isNodeExpanded } from "../../../domain/tree";

export type TreeLayoutRow = TreeBlock;

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
    const children = childrenOf(state, node.id);
    rows.push({
      kind: "node",
      key: node.id,
      parentId: node.parentId ?? ROOT_ID,
      depth,
      node,
      emptyTarget: node.kind === "content" && node.markdown.trim().length === 0 && children.length === 0
        ? { kind: "node", nodeId: node.id }
        : null,
    });

    const showsChildGhost = isNodeExpanded(state, node.id)
      && children.length === 0
      && ghostSuppressed[node.id] !== true;
    if (showsChildGhost) {
      rows.push({
        kind: "placeholder",
        key: `ghost:${node.id}`,
        parentId: node.id,
        depth: depth + 1,
        emptyTarget: { kind: "placeholder", parentId: node.id },
      });
    }
  }

  if (rootGhostParentId !== null) {
    rows.push({
      kind: "placeholder",
      key: `ghost:${rootGhostParentId}`,
      parentId: rootGhostParentId,
      depth: 0,
      emptyTarget: { kind: "placeholder", parentId: rootGhostParentId },
    });
  }

  return rows;
}
