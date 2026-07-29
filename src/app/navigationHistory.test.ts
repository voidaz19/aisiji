import { describe, expect, it } from "vitest";
import {
  canNavigate,
  createNavigationHistory,
  navigationTarget,
  recordNavigation,
} from "./navigationHistory";

describe("page navigation history", () => {
  it("moves backward and forward through view and breadcrumb locations", () => {
    const home = { view: "home", rootId: "root" } as const;
    const outline = { view: "outline", rootId: "root" } as const;
    const note = { view: "outline", rootId: "note-a" } as const;
    let history = createNavigationHistory(home);
    history = recordNavigation(history, outline);
    history = recordNavigation(history, note);

    const back = navigationTarget(history, -1)!;
    expect(back.location).toEqual(outline);
    expect(canNavigate(back.history, 1)).toBe(true);

    const forward = navigationTarget(back.history, 1)!;
    expect(forward.location).toEqual(note);
  });

  it("does not duplicate the current location and clears forward history after branching", () => {
    const home = { view: "home", rootId: "root" } as const;
    const outline = { view: "outline", rootId: "root" } as const;
    const settings = { view: "settings", rootId: "root" } as const;
    let history = createNavigationHistory(home);
    history = recordNavigation(history, outline);
    expect(recordNavigation(history, outline)).toBe(history);

    history = navigationTarget(history, -1)!.history;
    history = recordNavigation(history, settings);

    expect(history.entries).toEqual([home, settings]);
    expect(canNavigate(history, 1)).toBe(false);
  });
});
