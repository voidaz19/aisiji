import { describe, expect, it } from "vitest";
import { childrenOf, createNode, createSeedState, indentNode, isNodeExpanded, moveAfter, moveAsFirstChild, moveAsLastChild, outdentNode, toggleCollapsed, visibleNodes } from "./tree";
import { ROOT_ID } from "./model";

describe("tree domain", () => {
  it("creates a visible date and child", () => {
    const state = createSeedState("2026-07-20");
    expect(visibleNodes(state, ROOT_ID)).toHaveLength(2);
  });

  it("indents and outdents without creating a cycle", () => {
    let state = createSeedState("2026-07-20");
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const first = Object.values(state.nodes).find((node) => node.parentId === date.id)!;
    let result = createNode(state, date.id, "second");
    state = result.state;
    const second = result.node;
    state = indentNode(state, second.id);
    expect(state.nodes[second.id].parentId).toBe(first.id);
    state = outdentNode(state, second.id);
    expect(state.nodes[second.id].parentId).toBe(date.id);
  });

  it("moves a whole node before or after a target", () => {
    let state = createSeedState("2026-07-20");
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const first = Object.values(state.nodes).find((node) => node.parentId === date.id)!;
    const result = createNode(state, date.id, "second");
    state = result.state;
    state = moveAfter(state, first.id, result.node.id);
    expect(visibleNodes(state, date.id).map((node) => node.id)).toEqual([result.node.id, first.id]);
    state = moveAsFirstChild(state, first.id, date.id);
    expect(state.nodes[first.id].parentId).toBe(date.id);
  });

  it("treats empty nodes as collapsed until explicitly expanded", () => {
    const state = createSeedState("2026-07-20");
    const child = Object.values(state.nodes).find((node) => node.kind === "content")!;
    expect(isNodeExpanded(state, child.id)).toBe(false);
    expect(isNodeExpanded(toggleCollapsed(state, child.id), child.id)).toBe(true);
  });

  it("moves a dropped node to the end of a virtual target's sibling list", () => {
    let state = createSeedState("2026-07-20");
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const first = Object.values(state.nodes).find((node) => node.parentId === date.id)!;
    const secondResult = createNode(state, date.id, "second");
    state = secondResult.state;
    state = moveAsLastChild(state, first.id, date.id);
    const children = visibleNodes(state, date.id);
    expect(children[children.length - 1].id).toBe(first.id);
    expect(secondResult.node.parentId).toBe(date.id);
  });

  it("orders a new root-level content node after existing content siblings, not date nodes", () => {
    let state = createSeedState("2026-07-20");
    const firstContentResult = createNode(state, ROOT_ID, "first root content");
    state = firstContentResult.state;
    const secondContentResult = createNode(state, ROOT_ID, "second root content");
    state = secondContentResult.state;
    const rootChildren = childrenOf(state, ROOT_ID);
    const contentOrder = rootChildren.filter((node) => node.kind === "content").map((node) => node.id);
    expect(contentOrder).toEqual([firstContentResult.node.id, secondContentResult.node.id]);
  });

  it("inserts a new sibling right after the node it was created from (Enter behavior), not always at the end", () => {
    let state = createSeedState("2026-07-20");
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const first = Object.values(state.nodes).find((node) => node.parentId === date.id)!;
    // Simulate typing a third sibling directly (append), then pressing Enter
    // on `first`, which should land between `first` and the third sibling --
    // not after the third one at the very end.
    const thirdResult = createNode(state, date.id, "third");
    state = thirdResult.state;
    const enterResult = createNode(state, date.id, "", "content", null, first.id);
    state = enterResult.state;
    const order = childrenOf(state, date.id).filter((node) => node.kind === "content").map((node) => node.id);
    expect(order).toEqual([first.id, enterResult.node.id, thirdResult.node.id]);
  });
});
