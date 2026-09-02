import type { TreeBlock } from "../../../components/treeBlock";
import type { NodeRecord, NotebookState } from "../../../domain/model";
import { ROOT_ID } from "../../../domain/model";
import { CANVAS_SUPERTAG_ID } from "../../../domain/supertags";
import { buildChildIndex } from "../../../domain/tree";

export interface CanvasCardLayout {
  node: NodeRecord;
  childCount: number;
}

export type TreeLayoutRow = TreeBlock & {
  /** Present only when this expanded row replaces its visible subtree with a local Canvas grid. */
  localCanvasCards?: readonly CanvasCardLayout[];
};

/** Builds the exact row sequence rendered by the tree before spacing is classified. */
export function treeLayoutRows(
  nodes: readonly (NodeRecord & { depth?: number })[],
  state: Pick<NotebookState, "nodes" | "collapsed">,
  ghostSuppressed: Readonly<Record<string, boolean>>,
  rootGhostParentId: string | null,
  localCanvases = false,
): TreeLayoutRow[] {
  const rows: TreeLayoutRow[] = [];
  const childCounts = new Map<string, number>();
  for (const node of Object.values(state.nodes)) {
    if (!node.deletedAt && node.parentId) {
      childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1);
    }
  }
  const childIndex = localCanvases ? buildChildIndex(state) : null;
  let hiddenCanvasDepth: number | null = null;

  for (const node of nodes) {
    const depth = node.depth ?? 0;
    if (hiddenCanvasDepth !== null) {
      if (depth > hiddenCanvasDepth) continue;
      hiddenCanvasDepth = null;
    }
    const hasChildren = (childCounts.get(node.id) ?? 0) > 0;
    const isExpanded = state.collapsed[node.id] !== undefined
      ? !state.collapsed[node.id]
      : hasChildren;
    const localCanvasCards = localCanvases
      && node.kind === "content"
      && node.supertagIds?.includes(CANVAS_SUPERTAG_ID)
      && isExpanded
      && hasChildren
      ? (childIndex?.get(node.id) ?? [])
        .filter((child) => child.kind === "content")
        .map((child) => ({ node: child, childCount: childCounts.get(child.id) ?? 0 }))
      : undefined;
    rows.push({
      kind: "node",
      key: node.id,
      parentId: node.parentId ?? ROOT_ID,
      depth,
      node,
      hasChildren,
      emptyTarget: node.kind === "content" && node.markdown.trim().length === 0 && !hasChildren
        ? { kind: "node", nodeId: node.id }
        : null,
      ...(localCanvasCards ? { localCanvasCards } : {}),
    });

    if (localCanvasCards) {
      hiddenCanvasDepth = depth;
      continue;
    }
    const showsChildGhost = isExpanded
      && !hasChildren
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
