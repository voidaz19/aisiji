import { describe, expect, it } from "vitest";
import { createTreeDropSlots } from "./dropSlots";
import { createEmptyState, ROOT_ID, type NotebookState } from "./model";
import { createNode } from "./tree";

function addNode(state: NotebookState, id: string, parentId: string, markdown: string): NotebookState {
  return createNode(state, parentId, markdown, "content", null, null, { nodeId: id, now: 1 }).state;
}

describe("tree drop slots", () => {
  it("emits one vertical exit slot for each ancestor level", () => {
    let state = addNode(createEmptyState(), "week", ROOT_ID, "week");
    state = addNode(state, "plan", "week", "plan");
    state = addNode(state, "step", "plan", "step");
    state = addNode(state, "next", ROOT_ID, "next");
    state = addNode(state, "moving", ROOT_ID, "moving");

    const slots = createTreeDropSlots(
      state,
      [
        { ...state.nodes.week, depth: 0 },
        { ...state.nodes.plan, depth: 1 },
        { ...state.nodes.step, depth: 2 },
        { ...state.nodes.next, depth: 0 },
        { ...state.nodes.moving, depth: 0 },
      ],
      ROOT_ID,
      "moving",
    );

    expect(slots.filter((slot) => slot.afterNodeId === "step")).toMatchObject([
      { parentId: "plan", beforeId: null, depth: 2 },
      { parentId: "week", beforeId: null, depth: 1 },
      { parentId: ROOT_ID, beforeId: "next", depth: 0 },
    ]);
  });

  it("does not expose slots inside the dragged subtree", () => {
    let state = addNode(createEmptyState(), "parent", ROOT_ID, "parent");
    state = addNode(state, "child", "parent", "child");
    state = addNode(state, "next", ROOT_ID, "next");

    const slots = createTreeDropSlots(
      state,
      [
        { ...state.nodes.parent, depth: 0 },
        { ...state.nodes.child, depth: 1 },
        { ...state.nodes.next, depth: 0 },
      ],
      ROOT_ID,
      "parent",
    );

    expect(slots.every((slot) => slot.parentId !== "parent" && slot.parentId !== "child")).toBe(true);
  });
});
