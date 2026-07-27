import { describe, expect, it } from "vitest";
import { createEmptyState } from "./model";
import { createNode } from "./tree";
import { keysInRange, selectedContentRoots } from "./nodeSelection";

describe("keysInRange", () => {
  const order = ["date", "a", "ghost:parent", "b"];

  it("returns an inclusive range in either direction", () => {
    expect(keysInRange(order, { anchorKey: "a", headKey: "b" })).toEqual([
      "a",
      "ghost:parent",
      "b",
    ]);
    expect(keysInRange(order, { anchorKey: "b", headKey: "a" })).toEqual([
      "a",
      "ghost:parent",
      "b",
    ]);
  });
});

describe("selectedContentRoots", () => {
  it("keeps dates and ghosts selectable without treating them as deletable data", () => {
    let state = createEmptyState();
    const date = createNode(state, "root", "2026-07-26", "date", "2026-07-26");
    state = date.state;
    const parent = createNode(state, date.node.id, "parent");
    state = parent.state;
    const child = createNode(state, parent.node.id, "child");
    state = child.state;

    expect(selectedContentRoots(state, [date.node.id, parent.node.id, child.node.id, `ghost:${date.node.id}`]))
      .toEqual([parent.node.id]);
  });
});
