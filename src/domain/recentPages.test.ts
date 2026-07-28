import { describe, expect, it } from "vitest";
import { createEmptyState, ROOT_ID } from "./model";
import { createNode } from "./tree";
import { recentPages, recentPageTitle } from "./recentPages";

describe("recent edited pages", () => {
  it("uses recorded page identities without inferring them from edited descendants", () => {
    let state = createEmptyState();
    const pageResult = createNode(state, ROOT_ID, "页面 A", "content", null, null, { nodeId: "page-a", now: 1 });
    state = pageResult.state;
    state = createNode(state, pageResult.node.id, "内部节点", "content", null, null, { nodeId: "child", now: 2 }).state;
    state.recentPageEdits = { [ROOT_ID]: 10, [pageResult.node.id]: 20 };

    const recent = recentPages(state);

    expect(recent.map(({ page }) => page.id)).toEqual(["page-a", ROOT_ID]);
    expect(recent.map(({ page }) => recentPageTitle(page))).toEqual(["页面 A", "所有笔记"]);
    expect(recent.some(({ page }) => page.id === "child")).toBe(false);
  });

  it("omits deleted pages and applies the result limit after sorting", () => {
    let state = createEmptyState();
    for (let index = 0; index < 10; index += 1) {
      const result = createNode(state, ROOT_ID, `page ${index}`, "content", null, null, {
        nodeId: `page-${index}`,
        now: index + 1,
      });
      state = result.state;
      state.recentPageEdits[`page-${index}`] = index;
    }
    state.nodes["page-9"] = { ...state.nodes["page-9"], deletedAt: 100 };

    expect(recentPages(state, 3).map(({ page }) => page.id)).toEqual(["page-8", "page-7", "page-6"]);
  });
});
