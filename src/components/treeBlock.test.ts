import { describe, expect, it } from "vitest";
import type { NodeRecord } from "../domain/model";
import { treeBlockSubtreeKeys, type TreeBlock } from "./treeBlock";

function node(id: string, parentId: string, depth: number): Extract<TreeBlock, { kind: "node" }> {
  const record: NodeRecord & { depth: number } = {
    id,
    kind: "content",
    parentId,
    sortKey: 1,
    markdown: id,
    dateKey: null,
    deletedAt: null,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    depth,
  };
  return { kind: "node", key: id, parentId, depth, node: record, hasChildren: false, emptyTarget: null };
}

describe("tree block behavior model", () => {
  it("keeps persisted and placeholder descendants in one dragged subtree", () => {
    const blocks: TreeBlock[] = [
      node("parent", "root", 0),
      node("child", "parent", 1),
      {
        kind: "placeholder",
        key: "ghost:child",
        parentId: "child",
        depth: 2,
        emptyTarget: { kind: "placeholder", parentId: "child" },
      },
      node("sibling", "root", 0),
    ];

    expect([...treeBlockSubtreeKeys(blocks, "parent")]).toEqual([
      "parent",
      "child",
      "ghost:child",
    ]);
  });
});
