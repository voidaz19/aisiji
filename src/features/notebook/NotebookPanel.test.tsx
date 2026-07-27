import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT_ID } from "../../domain/model";
import { visibleNodes } from "../../domain/tree";
import { useNotebookStore } from "../../store/useNotebookStore";
import { NotebookPanel } from "./NotebookPanel";

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderOutline(layoutDebug = false) {
  const state = useNotebookStore.getState();
  return render(
    <NotebookPanel
      view="outline"
      activeRoot={null}
      rootId={ROOT_ID}
      visibleNodes={visibleNodes(state, ROOT_ID)}
      layoutDebug={layoutDebug}
    />,
  );
}

function dragTo(target: Element): void {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => target),
  });
}

describe("NotebookPanel node range selection", () => {
  it("separates selected root rows from the selected parent subtree", () => {
    const state = useNotebookStore.getState();
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const content = Object.values(state.nodes).find((node) => node.kind === "content")!;
    useNotebookStore.setState({ collapsed: { ...state.collapsed, [content.id]: false } });
    const { container } = renderOutline();
    const dateRow = container.querySelector<HTMLElement>(`[data-selection-key="${date.id}"]`)!;
    const childGhostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${content.id}"]`)!;
    const ghostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    dragTo(ghostRow);

    fireEvent.pointerDown(dateRow.querySelector(".date-content")!, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 20, clientY: 200 });

    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(2);
    expect(container.querySelectorAll(".selection-subtree-box")).toHaveLength(1);
    expect(dateRow.classList.contains("is-node-selected")).toBe(true);
    expect(childGhostRow.classList.contains("is-node-selected")).toBe(false);
    expect(ghostRow.classList.contains("is-node-selected")).toBe(true);
  });

  it("keeps a selected empty parent subtree box around its ghost row", () => {
    const state = useNotebookStore.getState();
    const content = Object.values(state.nodes).find((node) => node.kind === "content")!;
    useNotebookStore.setState({ collapsed: { ...state.collapsed, [content.id]: false } });
    const { container } = renderOutline();
    const contentRow = container.querySelector<HTMLElement>(`[data-selection-key="${content.id}"]`)!;
    const ghostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${content.id}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    dragTo(ghostRow);

    fireEvent.pointerDown(contentRow.querySelector(".node-content")!, { button: 0, pointerId: 3 });
    fireEvent.pointerMove(area, { pointerId: 3, clientX: 20, clientY: 200 });

    expect(contentRow.classList.contains("is-node-selected")).toBe(true);
    expect(contentRow.classList.contains("has-subtree-selection")).toBe(true);
    expect(ghostRow.classList.contains("is-node-selected")).toBe(false);
    expect(ghostRow.classList.contains("layout-gap-subtree-end")).toBe(true);
    expect(container.querySelectorAll(".selection-subtree-box")).toHaveLength(1);
    expect(container.querySelectorAll(".selection-subtree-box > .selection-subtree-root")).toHaveLength(1);
  });

  it("keeps the root ghost outside subtree-end spacing", () => {
    const { container } = renderOutline();
    const rootGhostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;

    expect(rootGhostRow.classList.contains("layout-gap-between-subtrees")).toBe(true);
    expect(rootGhostRow.classList.contains("layout-gap-subtree-end")).toBe(false);
  });

  it("draws one debug block for every rendered node row", () => {
    const { container, getByLabelText } = renderOutline(true);
    fireEvent.click(getByLabelText("节点块"));
    const rootNodeBlock = container.querySelector<HTMLElement>('.node-layout-box[data-depth="0"]')!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;

    expect(container.querySelectorAll(".node-layout-box")).toHaveLength(
      container.querySelectorAll("[data-tree-row='true']").length,
    );
    expect(rootNodeBlock.style.left).toBe("36px");
    expect(rootNodeBlock.style.right).toBe("8px");
    expect(treeList.style.getPropertyValue("--tree-layout-animation-duration")).toBe("100ms");
    expect(treeList.style.getPropertyValue("--tree-layout-animation-easing")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("renders persisted and placeholder rows through the common tree block contract", () => {
    const { container } = renderOutline();
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-row='true']"));

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => Boolean(row.dataset.treeBlockKey))).toBe(true);
    expect(rows.every((row) => row.dataset.treeBlockKind === "node" || row.dataset.treeBlockKind === "placeholder")).toBe(true);
    expect(rows.some((row) => row.dataset.treeBlockKind === "placeholder")).toBe(true);
  });

  it("toggles each debug block type without changing tree rows", () => {
    const { container, getByLabelText } = renderOutline(true);
    const rowCount = container.querySelectorAll("[data-tree-row='true']").length;

    fireEvent.click(getByLabelText("节点块"));
    expect(container.querySelectorAll(".node-layout-box")).toHaveLength(rowCount);
    expect(container.querySelectorAll("[data-tree-row='true']")).toHaveLength(rowCount);

    fireEvent.click(getByLabelText("节点列表"));
    expect(container.querySelector(".tree-list")?.hasAttribute("data-debug-tree-list")).toBe(true);
  });

  it("measures debug blocks from stable layout offsets instead of animated screen coordinates", () => {
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.treeRow === "true" ? 42 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.treeRow === "true" ? 24 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.treeRow === "true" ? 142 : 0;
      return { x: 0, y: top, top, right: 0, bottom: top + 24, left: 0, width: 0, height: 24, toJSON: () => ({}) };
    });

    const { container, getByLabelText } = renderOutline(true);
    fireEvent.click(getByLabelText("节点块"));
    const nodeBlock = container.querySelector<HTMLElement>(".node-layout-box")!;

    expect(nodeBlock.style.top).toBe("42px");
    expect(nodeBlock.style.height).toBe("24px");
  });

  it("deletes selected content while preserving selected date and ghost rows", () => {
    const state = useNotebookStore.getState();
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const content = Object.values(state.nodes).find((node) => node.kind === "content")!;
    const { container } = renderOutline();
    const dateRow = container.querySelector<HTMLElement>(`[data-selection-key="${date.id}"]`)!;
    const ghostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    dragTo(ghostRow);

    fireEvent.pointerDown(dateRow.querySelector(".date-content")!, { button: 0, pointerId: 2 });
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 20, clientY: 200 });
    fireEvent.keyDown(area, { key: "Delete" });

    expect(useNotebookStore.getState().nodes[date.id].deletedAt).toBeNull();
    expect(useNotebookStore.getState().nodes[content.id].deletedAt).not.toBeNull();
  });
});
