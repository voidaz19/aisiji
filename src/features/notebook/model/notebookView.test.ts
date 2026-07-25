import { describe, expect, it } from "vitest";
import { ROOT_ID } from "../../../domain/model";
import { createNode, createSeedState, deleteSubtree } from "../../../domain/tree";
import { breadcrumbPath, findDateNode, visibleNodesForView } from "./notebookView";

describe("notebook view selectors", () => {
  it("builds breadcrumbs within the current view boundary", () => {
    let state = createSeedState("2026-07-25");
    const date = findDateNode(state, "2026-07-25")!;
    const parentResult = createNode(state, date.id, "parent");
    state = parentResult.state;
    const childResult = createNode(state, parentResult.node.id, "child");
    state = childResult.state;

    expect(breadcrumbPath(state.nodes, childResult.node, date.id).map((node) => node.id)).toEqual([
      parentResult.node.id,
      childResult.node.id,
    ]);
  });

  it("hides empty date containers from the global outline", () => {
    let state = createSeedState("2026-07-25");
    const date = findDateNode(state, "2026-07-25")!;
    const onlyChild = Object.values(state.nodes).find((node) => node.parentId === date.id)!;
    state = deleteSubtree(state, onlyChild.id);

    expect(visibleNodesForView(state, "outline", ROOT_ID, "").some((node) => node.id === date.id)).toBe(false);
  });

  it("searches active nodes without depending on tree expansion", () => {
    const state = createSeedState("2026-07-25");
    const content = Object.values(state.nodes).find((node) => node.kind === "content")!;
    state.nodes[content.id] = { ...content, markdown: "Modular architecture" };

    expect(visibleNodesForView(state, "search", ROOT_ID, "ARCHITECTURE").map((node) => node.id)).toEqual([
      content.id,
    ]);
  });
});
