import { describe, expect, it } from "vitest";
import { calculateCommandMenuPosition } from "./EditorCommandMenu";

describe("calculateCommandMenuPosition", () => {
  it("places a caret menu below and slightly to the right when space is available", () => {
    expect(calculateCommandMenuPosition(
      { kind: "caret", left: 200, right: 201, top: 120, bottom: 140 },
      { width: 256, height: 300 },
      { width: 1000, height: 800 },
    )).toEqual({ left: 204, top: 146, placement: "below" });
  });

  it("flips above the caret when the lower viewport cannot fit the menu", () => {
    expect(calculateCommandMenuPosition(
      { kind: "caret", left: 400, right: 401, top: 700, bottom: 720 },
      { width: 256, height: 300 },
      { width: 1000, height: 800 },
    )).toEqual({ left: 404, top: 394, placement: "above" });
  });

  it("keeps the edge nearest the caret anchored when an above menu shrinks", () => {
    expect(calculateCommandMenuPosition(
      { kind: "caret", left: 400, right: 401, top: 700, bottom: 720 },
      { width: 256, height: 100 },
      { width: 1000, height: 800 },
      "above",
    )).toEqual({ left: 404, top: 594, placement: "above" });
  });

  it("keeps the menu inside both horizontal viewport edges", () => {
    expect(calculateCommandMenuPosition(
      { kind: "caret", left: 970, right: 971, top: 120, bottom: 140 },
      { width: 256, height: 300 },
      { width: 1000, height: 800 },
    ).left).toBe(736);
    expect(calculateCommandMenuPosition(
      { kind: "trigger", left: 2, right: 20, top: 120, bottom: 140 },
      { width: 256, height: 300 },
      { width: 1000, height: 800 },
    ).left).toBe(8);
  });
});
