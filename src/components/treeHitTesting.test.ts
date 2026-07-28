import { describe, expect, it } from "vitest";
import { treeBlockAtPoint } from "./treeHitTesting";

describe("treeBlockAtPoint", () => {
  it("assigns a block's layout gap to that block", () => {
    const tree = document.createElement("div");
    tree.className = "tree-list";
    const first = document.createElement("div");
    first.dataset.treeBlockKey = "first";
    first.style.marginBottom = "8px";
    const second = document.createElement("div");
    second.dataset.treeBlockKey = "second";
    tree.append(first, second);
    document.body.append(tree);
    Object.defineProperty(tree, "getBoundingClientRect", { value: () => rect(0, 0, 200, 100) });
    Object.defineProperty(first, "getBoundingClientRect", { value: () => rect(0, 0, 200, 24) });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => rect(0, 32, 200, 56) });

    expect(treeBlockAtPoint(tree, 40, 28)?.dataset.treeBlockKey).toBe("first");
    expect(treeBlockAtPoint(tree, 40, 40)?.dataset.treeBlockKey).toBe("second");
  });
});

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) } as DOMRect;
}
