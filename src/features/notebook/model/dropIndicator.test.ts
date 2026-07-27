import { describe, expect, it } from "vitest";
import type { TreeDropSlot } from "../../../domain/dropSlots";
import { closestDropSlot, layoutDropSlots as calculateDropSlots, noMoveZone, type DropBlockRects, type DropSlotLayoutOptions } from "./dropIndicator";

const defaultOptions: DropSlotLayoutOptions = {
  lineLeftByDepth: new Map([[0, 52], [1, 88], [2, 124]]),
  hitLeftByDepth: new Map([[0, 52], [1, 88], [2, 124]]),
};

function layoutDropSlots(
  slots: readonly TreeDropSlot[],
  rects: DropBlockRects,
  endY: number,
  options: DropSlotLayoutOptions = defaultOptions,
) {
  return calculateDropSlots(slots, rects, endY, options);
}

const slots: TreeDropSlot[] = [
  { id: "plan:end", parentId: "plan", beforeId: null, depth: 2, afterBlock: { kind: "block", key: "step" }, nextBlockKey: "next" },
  { id: "week:end", parentId: "week", beforeId: null, depth: 1, afterBlock: { kind: "subtree", key: "plan" }, nextBlockKey: "next" },
  { id: "root:next", parentId: "root", beforeId: "next", depth: 0, afterBlock: { kind: "subtree", key: "week" }, nextBlockKey: "next" },
];

function blocks(): DropBlockRects {
  return {
    blocks: new Map([
      ["step", { top: 100, bottom: 132, left: 124, right: 200 }],
      ["next", { top: 160, bottom: 192, left: 52, right: 200 }],
    ]),
    subtrees: new Map([
      ["plan", { top: 70, bottom: 140, left: 88, right: 200 }],
      ["week", { top: 40, bottom: 148, left: 52, right: 200 }],
    ]),
  };
}

describe("drop indicator layout", () => {
  it("anchors every hierarchy choice to its concrete block boundary", () => {
    const layouts = layoutDropSlots(slots, blocks(), 220);

    expect(layouts.map((layout) => layout.depth)).toEqual([2, 1, 0]);
    expect(layouts.map((layout) => layout.top)).toEqual([136, 144, 154]);
    expect(layouts.map((layout) => layout.left)).toEqual([124, 88, 52]);
  });

  it("uses horizontal position to select hierarchy at one vertical boundary", () => {
    const layouts = layoutDropSlots(slots, blocks(), 220);

    expect(closestDropSlot(layouts, { x: 60, y: 120 })?.id).toBe("root:next");
    expect(closestDropSlot(layouts, { x: 90, y: 120 })?.id).toBe("week:end");
    expect(closestDropSlot(layouts, { x: 150, y: 120 })?.id).toBe("plan:end");
  });

  it("starts a child's before-zone at the child hierarchy, not its parent block", () => {
    const childSlot: TreeDropSlot[] = [{
      id: "parent:child",
      parentId: "parent",
      beforeId: "child",
      depth: 1,
      afterBlock: { kind: "block", key: "parent" },
      nextBlockKey: "child",
    }];
    const layouts = layoutDropSlots(childSlot, {
      blocks: new Map([
        ["parent", { top: 40, bottom: 64, left: 52, right: 200 }],
        ["child", { top: 72, bottom: 96, left: 88, right: 200 }],
      ]),
      subtrees: new Map(),
    }, 120);

    expect(layouts[0].hitZone.left).toBe(88);
    expect(closestDropSlot(layouts, { x: 70, y: 75 })).toBeNull();
    expect(closestDropSlot(layouts, { x: 100, y: 75 })?.id).toBe("parent:child");
  });

  it("uses vertical position to select hierarchy at the same horizontal coordinate", () => {
    const layouts = layoutDropSlots(slots, blocks(), 220);

    expect(closestDropSlot(layouts, { x: 130, y: 120 })?.id).toBe("plan:end");
    expect(closestDropSlot(layouts, { x: 130, y: 137 })?.id).toBe("week:end");
    expect(closestDropSlot(layouts, { x: 130, y: 145 })?.id).toBe("root:next");
  });

  it("does not move when the pointer is in the current-position slot", () => {
    const layouts = layoutDropSlots([
      { ...slots[0], isNoop: true },
      slots[1],
      slots[2],
    ], blocks(), 220);

    expect(closestDropSlot(layouts, { x: 150, y: 120 })).toBeNull();
  });

  it("derives hierarchy hit regions from block centers and boundaries", () => {
    const layouts = layoutDropSlots(slots, blocks(), 220);
    expect(layouts.find((slot) => slot.id === "plan:end")?.hitZone).toEqual({
      top: 116,
      bottom: 136,
      left: 124,
      right: 200,
    });
    for (const layout of layouts) {
      expect(layout.hitZone.right).toBe(200);
    }
    expect(layouts.find((slot) => slot.id === "week:end")?.hitZone.top).toBe(105);
    expect(layouts.find((slot) => slot.id === "root:next")?.hitZone.top).toBe(94);
  });

  it("reserves the actual source block rectangle as a no-move region", () => {
    const layouts = layoutDropSlots(slots, blocks(), 220);
    const sourceZone = { top: 140, bottom: 150, left: 100, right: 180 };

    expect(closestDropSlot(layouts, { x: 120, y: 145 }, sourceZone)).toBeNull();
    expect(closestDropSlot(layouts, { x: 60, y: 145 }, sourceZone)?.id).toBe("root:next");
  });

  it("shows adjacent no-op cells as one continuous debug region", () => {
    const layouts = layoutDropSlots([
      { ...slots[0], isNoop: true },
      { ...slots[1], isNoop: true },
      slots[2],
    ], blocks(), 220);

    expect(noMoveZone(layouts, {
      top: 110,
      bottom: 130,
      left: 124,
      right: 200,
    })).toEqual({ top: 105, bottom: 144, left: 88, right: 200 });
  });

  it("places end-of-tree exits after their nested block boundaries", () => {
    const endSlots: TreeDropSlot[] = [
      { id: "week:end", parentId: "week", beforeId: null, depth: 1, afterBlock: { kind: "block", key: "moving" }, nextBlockKey: null },
      { id: "root:end", parentId: "root", beforeId: null, depth: 0, afterBlock: { kind: "subtree", key: "week" }, nextBlockKey: null },
    ];
    const layouts = layoutDropSlots(
      endSlots,
      {
        blocks: new Map([["moving", { top: 100, bottom: 132, left: 88, right: 200 }]]),
        subtrees: new Map([["week", { top: 70, bottom: 140, left: 52, right: 200 }]]),
      },
      164,
    );

    expect(layouts.map((layout) => layout.depth)).toEqual([1, 0]);
    expect(layouts.map((layout) => layout.top)).toEqual([136, 152]);
  });

  it("centers a single choice between its block and the next block", () => {
    const singleSlot: TreeDropSlot[] = [
      { id: "root:next", parentId: "root", beforeId: "next", depth: 0, afterBlock: { kind: "block", key: "current" }, nextBlockKey: "next" },
    ];
    const layouts = layoutDropSlots(
      singleSlot,
      {
        blocks: new Map([
          ["current", { top: 100, bottom: 132, left: 52, right: 200 }],
          ["next", { top: 148, bottom: 180, left: 52, right: 200 }],
        ]),
        subtrees: new Map(),
      },
      220,
    );

    expect(layouts[0].top).toBe(140);
  });

  it("uses a following subtree's midpoint as the other half of the hit region", () => {
    const layouts = layoutDropSlots([{
      id: "root:next-tree",
      parentId: "root",
      beforeId: "next-tree",
      depth: 0,
      afterBlock: { kind: "block", key: "current" },
      nextBlockKey: "next-tree",
    }], {
      blocks: new Map([
        ["current", { top: 0, bottom: 24, left: 52, right: 200 }],
        ["next-tree", { top: 30, bottom: 54, left: 52, right: 200 }],
      ]),
      subtrees: new Map([
        ["next-tree", { top: 30, bottom: 100, left: 52, right: 200 }],
      ]),
    }, 140);

    expect(layouts[0].hitZone).toEqual({ top: 12, bottom: 65, left: 52, right: 200 });
  });

  it("uses the first subtree's midpoint for the before-first region", () => {
    const layouts = layoutDropSlots([{
      id: "root:first-tree",
      parentId: "root",
      beforeId: "first-tree",
      depth: 0,
      afterBlock: null,
      nextBlockKey: "first-tree",
    }], {
      blocks: new Map([
        ["first-tree", { top: 10, bottom: 34, left: 52, right: 200 }],
      ]),
      subtrees: new Map([
        ["first-tree", { top: 10, bottom: 90, left: 52, right: 200 }],
      ]),
    }, 120);

    expect(layouts[0].hitZone).toEqual({ top: 0, bottom: 50, left: 52, right: 200 });
  });

  it("uses measured bullet anchors for exact horizontal alignment", () => {
    const layouts = layoutDropSlots(slots, blocks(), 220, {
      lineLeftByDepth: new Map([[0, 49.5], [1, 77.5], [2, 105.5]]),
      hitLeftByDepth: new Map([[0, 44], [1, 72], [2, 100]]),
    });

    expect(layouts.map((layout) => layout.left)).toEqual([105.5, 77.5, 49.5]);
    expect(layouts.map((layout) => layout.hitZone.left)).toEqual([100, 72, 44]);
  });
});
