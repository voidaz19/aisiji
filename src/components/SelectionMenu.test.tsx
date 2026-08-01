import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Copy } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateSelectionMenuPosition, SelectionMenu, selectionMenuIcons } from "./SelectionMenu";

afterEach(cleanup);

describe("calculateSelectionMenuPosition", () => {
  it("keeps a selection toolbar above and centered on its anchor by default", () => {
    expect(calculateSelectionMenuPosition(
      { left: 300, right: 500, top: 120, bottom: 140 },
      { width: 220, height: 40 },
      { width: 1000, height: 800 },
    )).toEqual({ left: 290, top: 74, placement: "above" });
  });

  it("flips below a selection near the top edge and clamps horizontally", () => {
    expect(calculateSelectionMenuPosition(
      { left: 960, right: 1000, top: 12, bottom: 32 },
      { width: 220, height: 40 },
      { width: 1000, height: 800 },
    )).toEqual({ left: 772, top: 38, placement: "below" });
  });

  it("left-aligns a node toolbar with its selected object", () => {
    expect(calculateSelectionMenuPosition(
      { left: 180, right: 700, top: 200, bottom: 240 },
      { width: 180, height: 40 },
      { width: 1000, height: 800 },
      { alignment: "start" },
    )).toEqual({ left: 180, top: 154, placement: "above" });
  });
});

describe("SelectionMenu", () => {
  it("renders icon actions with accessible labels in a toolbar", () => {
    render(
      <SelectionMenu
        anchor={{ left: 20, right: 60, top: 20, bottom: 40 }}
        ariaLabel="文本选区菜单"
        actions={[{ id: "copy", label: "复制文本", icon: Copy, onSelect: vi.fn() }]}
      />,
    );

    expect(document.body.querySelector('[role="toolbar"][aria-label="文本选区菜单"]')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="复制文本"]')).not.toBeNull();
  });

  it("uses conventional list indentation icons for hierarchy actions", () => {
    render(
      <SelectionMenu
        anchor={{ left: 20, right: 60, top: 80, bottom: 100 }}
        ariaLabel="节点选区菜单"
        actions={[
          { id: "indent", label: "缩进节点", icon: selectionMenuIcons.indent, onSelect: vi.fn() },
          { id: "outdent", label: "提升节点", icon: selectionMenuIcons.outdent, onSelect: vi.fn() },
        ]}
      />,
    );

    expect(document.body.querySelector('button[aria-label="缩进节点"] .lucide-list-indent-increase')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="提升节点"] .lucide-list-indent-decrease')).not.toBeNull();
  });

  it("shows a visible confirmation after a successful copy action", async () => {
    render(
      <SelectionMenu
        anchor={{ left: 20, right: 60, top: 80, bottom: 100 }}
        ariaLabel="文本选区菜单"
        actions={[{
          id: "copy",
          label: "复制文本",
          icon: Copy,
          onSelect: async () => true,
          feedback: "已复制",
        }]}
      />,
    );

    fireEvent.click(document.body.querySelector('button[aria-label="复制文本"]')!);

    await waitFor(() => expect(document.body.querySelector('[role="status"]')?.textContent).toBe("已复制"));
  });
});
