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

    expect(slots.filter((slot) => slot.nextBlockKey === "next")).toMatchObject([
      { parentId: "plan", beforeId: null, depth: 2, afterBlock: { kind: "block", key: "step" } },
      { parentId: "week", beforeId: null, depth: 1, afterBlock: { kind: "subtree", key: "plan" } },
      { parentId: ROOT_ID, beforeId: "next", depth: 0, afterBlock: { kind: "subtree", key: "week" } },
    ]);
  });

  it("anchors a first-child slot after the parent node block rather than its subtree", () => {
    let state = addNode(createEmptyState(), "parent", ROOT_ID, "parent");
    state = addNode(state, "child", "parent", "child");

    const slots = createTreeDropSlots(
      state,
      [
        { ...state.nodes.parent, depth: 0 },
        { ...state.nodes.child, depth: 1 },
      ],
      ROOT_ID,
    );

    expect(slots.find((slot) => slot.beforeId === "child")).toMatchObject({
      depth: 1,
      afterBlock: { kind: "block", key: "parent" },
    });
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

  it("keeps the dragged node's current position as a no-op slot", () => {
    let state = addNode(createEmptyState(), "before", ROOT_ID, "before");
    state = addNode(state, "moving", ROOT_ID, "moving");
    state = addNode(state, "after", ROOT_ID, "after");

    const slots = createTreeDropSlots(
      state,
      [
        { ...state.nodes.before, depth: 0 },
        { ...state.nodes.moving, depth: 0 },
        { ...state.nodes.after, depth: 0 },
      ],
      ROOT_ID,
      "moving",
    );

    expect(slots.filter((slot) => slot.isNoop)).toMatchObject([
      { beforeId: "moving", afterBlock: { kind: "block", key: "before" }, isNoop: true },
      { beforeId: "after", afterBlock: { kind: "block", key: "moving" }, isNoop: true },
    ]);
  });

  it("uses the placeholder itself as the child target and keeps only the outer slot below the subtree", () => {
    let state = addNode(createEmptyState(), "parent", ROOT_ID, "parent");
    state = addNode(state, "next", ROOT_ID, "next");
    state = addNode(state, "moving", ROOT_ID, "moving");

    const slots = createTreeDropSlots(
      state,
      [
        { ...state.nodes.parent, depth: 0 },
        { ...state.nodes.next, depth: 0 },
        { ...state.nodes.moving, depth: 0 },
      ],
      ROOT_ID,
      "moving",
      [{ parentId: "parent" }],
    );

    expect(slots.some((slot) => slot.parentId === "parent")).toBe(false);
    expect(slots.find((slot) => slot.parentId === ROOT_ID && slot.beforeId === "next")).toMatchObject({
      depth: 0,
      afterBlock: { kind: "subtree", key: "parent" },
      nextBlockKey: "next",
    });
  });
});
