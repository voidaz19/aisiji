import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CANVAS_SUPERTAG_ID } from "../../domain/supertags";
import { useNotebookStore } from "../../store/useNotebookStore";
import { CanvasPanel } from "./CanvasPanel";

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(cleanup);

describe("CanvasPanel", () => {
  it("renders direct children in tree order and creates ordinary child nodes", () => {
    const store = useNotebookStore.getState();
    const rootId = store.createChild("root", "项目")!;
    store.createChild(rootId, "第一张卡片");
    store.createChild(rootId, "第二张卡片");
    store.addSupertag(rootId, CANVAS_SUPERTAG_ID);
    const root = useNotebookStore.getState().nodes[rootId];
    const { container, getByRole } = render(<CanvasPanel root={root} />);

    expect(Array.from(container.querySelectorAll("[data-canvas-card-id]")).map((item) => item.textContent)).toEqual([
      expect.stringContaining("第一张卡片"),
      expect.stringContaining("第二张卡片"),
    ]);
    fireEvent.click(getByRole("button", { name: "新建节点" }));
    expect(Object.values(useNotebookStore.getState().nodes).filter((node) => node.parentId === rootId && !node.deletedAt)).toHaveLength(3);
  });

  it("removes only the Canvas tag", () => {
    const store = useNotebookStore.getState();
    const rootId = store.createChild("root", "项目")!;
    store.addSupertag(rootId, CANVAS_SUPERTAG_ID);
    const { getByRole } = render(<CanvasPanel root={useNotebookStore.getState().nodes[rootId]} />);

    fireEvent.click(getByRole("button", { name: "移除 Canvas 标签" }));
    expect(useNotebookStore.getState().nodes[rootId].supertagIds).not.toContain(CANVAS_SUPERTAG_ID);
  });
});
