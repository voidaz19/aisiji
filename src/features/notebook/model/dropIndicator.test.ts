import { describe, expect, it } from "vitest";
import type { TreeDropSlot } from "../../../domain/dropSlots";
import { closestDropSlot, layoutDropSlots, pointerYFromTranslatedRect } from "./dropIndicator";

const slots: TreeDropSlot[] = [
  { id: "plan:end", parentId: "plan", beforeId: null, depth: 2, afterNodeId: "step", nextNodeId: "next" },
  { id: "week:end", parentId: "week", beforeId: null, depth: 1, afterNodeId: "step", nextNodeId: "next" },
  { id: "root:next", parentId: "root", beforeId: "next", depth: 0, afterNodeId: "step", nextNodeId: "next" },
];

describe("drop indicator layout", () => {
  it("tracks the pointer's original offset inside the dragged row", () => {
    expect(pointerYFromTranslatedRect({ top: 180, bottom: 212 }, 100, 7)).toBe(87);
    expect(pointerYFromTranslatedRect({ top: 180, bottom: 212 }, 100, null)).toBe(96);
  });

  it("centers each hierarchy choice inside its measured portion of the gap", () => {
    const layouts = layoutDropSlots(
      slots,
      new Map([
        ["step", { top: 100, bottom: 132 }],
        ["next", { top: 160, bottom: 192 }],
      ]),
      220,
    );

    expect(layouts.map((layout) => layout.depth)).toEqual([2, 1, 0]);
    expect(layouts[0].top).toBeLessThan(layouts[1].top);
    expect(layouts[1].top).toBeLessThan(layouts[2].top);
    expect(layouts.map((layout) => layout.left)).toEqual([124, 88, 52]);
    expect(layouts.map((layout) => layout.top)).toEqual([
      132 + 28 / 6,
      146,
      160 - 28 / 6,
    ]);
  });

  it("selects the nearest vertical slot without using horizontal position", () => {
    const layouts = layoutDropSlots(
      slots,
      new Map([
        ["step", { top: 100, bottom: 132 }],
        ["next", { top: 160, bottom: 192 }],
      ]),
      220,
    );

    expect(closestDropSlot(layouts, layouts[1].top + 1)?.id).toBe("week:end");
    expect(closestDropSlot(layouts, layouts[1].top + 1, 0)).toBeNull();
  });

  it("places end-of-tree exits downward from deep to shallow", () => {
    const endSlots: TreeDropSlot[] = [
      { id: "week:end", parentId: "week", beforeId: null, depth: 1, afterNodeId: "moving", nextNodeId: null },
      { id: "root:end", parentId: "root", beforeId: null, depth: 0, afterNodeId: "moving", nextNodeId: null },
    ];
    const layouts = layoutDropSlots(
      endSlots,
      new Map([["moving", { top: 100, bottom: 132 }]]),
      164,
    );

    expect(layouts.map((layout) => layout.depth)).toEqual([1, 0]);
    expect(layouts.map((layout) => layout.top)).toEqual([140, 156]);
  });

  it("centers a single choice in the measured space between objects", () => {
    const singleSlot: TreeDropSlot[] = [
      { id: "root:next", parentId: "root", beforeId: "next", depth: 0, afterNodeId: "current", nextNodeId: "next" },
    ];
    const layouts = layoutDropSlots(
      singleSlot,
      new Map([
        ["current", { top: 100, bottom: 132 }],
        ["next", { top: 148, bottom: 180 }],
      ]),
      220,
    );

    expect(layouts[0].top).toBe(140);
  });

  it("uses measured bullet anchors for exact horizontal alignment", () => {
    const layouts = layoutDropSlots(
      slots,
      new Map([
        ["step", { top: 100, bottom: 132 }],
        ["next", { top: 160, bottom: 192 }],
      ]),
      220,
      { anchorsByDepth: new Map([[0, 49.5], [1, 77.5], [2, 105.5]]) },
    );

    expect(layouts.map((layout) => layout.left)).toEqual([105.5, 77.5, 49.5]);
  });
});
