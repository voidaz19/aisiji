import type { EmptyNodeTarget } from "../domain/emptyDrop";
import type { NodeRecord } from "../domain/model";

interface TreeBlockBase {
  key: string;
  parentId: string;
  depth: number;
  emptyTarget: EmptyNodeTarget | null;
}

export interface PersistedTreeBlock extends TreeBlockBase {
  kind: "node";
  node: NodeRecord & { depth?: number };
  hasChildren: boolean;
}

export interface PlaceholderTreeBlock extends TreeBlockBase {
  kind: "placeholder";
}

export type TreeBlock = PersistedTreeBlock | PlaceholderTreeBlock;

/** Returns every visible block that moves with a persisted subtree root. */
export function treeBlockSubtreeKeys(blocks: readonly TreeBlock[], rootNodeId: string): Set<string> {
  const rootIndex = blocks.findIndex((block) => block.kind === "node" && block.node.id === rootNodeId);
  if (rootIndex < 0) return new Set();

  const rootDepth = blocks[rootIndex].depth;
  const keys = new Set<string>([blocks[rootIndex].key]);
  for (let index = rootIndex + 1; index < blocks.length; index += 1) {
    if (blocks[index].depth <= rootDepth) break;
    keys.add(blocks[index].key);
  }
  return keys;
}
