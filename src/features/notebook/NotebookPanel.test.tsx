import { cleanup, fireEvent, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT_ID, type NodeRecord } from "../../domain/model";
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

function box(left: number, top: number, right: number, bottom: number): DOMRect {
  return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) } as DOMRect;
}

describe("NotebookPanel root heading", () => {
  it("uses the same full-width heading contract for date and content roots", () => {
    const state = useNotebookStore.getState();
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const content = Object.values(state.nodes).find((node) => node.kind === "content")!;
    const { container, rerender } = render(
      <NotebookPanel
        view="outline"
        activeRoot={date}
        rootId={date.id}
        visibleNodes={visibleNodes(state, date.id)}
      />,
    );

    expect(container.querySelector("h1.view-root-heading")).not.toBeNull();

    rerender(
      <NotebookPanel
        view="outline"
        activeRoot={content}
        rootId={content.id}
        visibleNodes={visibleNodes(state, content.id)}
      />,
    );

    expect(container.querySelector(".root-node-heading.view-root-heading")).not.toBeNull();
  });
});

describe("NotebookPanel node range selection", () => {
  it("windows a large outline instead of mounting every row", async () => {
    const state = useNotebookStore.getState();
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const nodes: NodeRecord[] = [];
    for (let index = 0; index < 1_000; index += 1) {
      nodes.push({
        id: `virtual-${index}`,
        kind: "content",
        parentId: date.id,
        sortKey: index * 1_000,
        markdown: `virtual row ${index}`,
        dateKey: null,
        deletedAt: null,
        revision: 1,
        createdAt: index + 1,
        updatedAt: index + 1,
        depth: 0,
      } as NodeRecord & { depth: number });
    }
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(860);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.classList.contains("tree-row") ? 31 : 600;
      return { x: 0, y: 0, top: 0, right: 860, bottom: height, left: 0, width: 860, height, toJSON: () => ({}) };
    });

    const { container } = render(
      <NotebookPanel view="outline" activeRoot={null} rootId={date.id} visibleNodes={nodes} />,
    );

    await vi.waitFor(() => expect(container.querySelectorAll("[data-tree-row='true']").length).toBeGreaterThan(0));
    expect(container.querySelectorAll("[data-tree-row='true']").length).toBeLessThan(100);
    expect(container.querySelector<HTMLElement>(".tree-list")!.style.height).not.toBe("");
  });

  it("renders deleted nodes without mounting CodeMirror editors", () => {
    const store = useNotebookStore.getState();
    const content = Object.values(store.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    store.editMarkdown(content.id, "deleted note");
    store.remove(content.id);
    const state = useNotebookStore.getState();
    const deletedNodes = Object.values(state.nodes).filter((node) => Boolean(node.deletedAt));

    const { container } = render(
      <NotebookPanel
        view="trash"
        activeRoot={null}
        rootId={ROOT_ID}
        visibleNodes={deletedNodes}
      />,
    );

    expect(container.querySelectorAll(".inline-editor")).toHaveLength(0);
    expect(container.querySelector(".node-readonly")?.textContent).toBe("deleted note");
  });

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

  it("routes tree-list whitespace clicks to the nearest block", () => {
    const state = useNotebookStore.getState();
    const content = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.getState().setActiveNode(null);
    const { container } = renderOutline();
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const contentIndex = rows.findIndex((row) => row.dataset.nodeId === content.id);
    const contentTop = 4 + contentIndex * 32;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("tree-list")) return box(0, 0, 860, 200);
      const rowIndex = rows.indexOf(this);
      if (rowIndex >= 0) return box(0, 4 + rowIndex * 32, 860, 28 + rowIndex * 32);
      return box(0, 0, 0, 0);
    });
    rows.forEach((row) => { row.style.marginBottom = "8px"; });

    fireEvent.click(treeList, { clientX: 700, clientY: contentTop + 26 });

    expect(useNotebookStore.getState().activeNodeId).toBe(content.id);
    useNotebookStore.getState().setActiveNode(null);
    const ghostIndex = rows.findIndex((row) => row.dataset.selectionKey === `ghost:${ROOT_ID}`);

    fireEvent.click(treeList, { clientX: 700, clientY: 4 + ghostIndex * 32 + 26 });

    expect(useNotebookStore.getState().activeGhostParentId).toBe(ROOT_ID);
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

  it("clears editor text selection for the rest of a cross-node mouse drag", () => {
    const state = useNotebookStore.getState();
    const source = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    const { container } = renderOutline();
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const targetRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const host = sourceRow.querySelector<HTMLElement>(".inline-editor")!;
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });

    dragTo(targetRow);
    fireEvent.pointerDown(host.querySelector(".cm-content")!, { button: 0, pointerId: 4 });
    fireEvent.pointerMove(area, { pointerId: 4, clientX: 20, clientY: 200 });
    editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });
    fireEvent.mouseMove(area, { buttons: 1, clientX: 20, clientY: 200 });

    expect(editor.state.selection.main.empty).toBe(true);
  });

  it("keeps the root ghost outside subtree-end spacing", () => {
    const { container } = renderOutline();
    const rootGhostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;

    expect(rootGhostRow.classList.contains("layout-gap-between-subtrees")).toBe(true);
    expect(rootGhostRow.classList.contains("layout-gap-subtree-end")).toBe(false);
  });

  it("draws a hierarchy line for the current view root", () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("node-bullet") ? 32 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("node-bullet") ? 20 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-tree-row='true']"));
      const index = rows.indexOf(this);
      return index >= 0 ? index * 32 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.treeRow === "true" ? 24 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const row = this.closest<HTMLElement>("[data-tree-row='true']");
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-tree-row='true']"));
      const rowTop = row ? Math.max(0, rows.indexOf(row)) * 32 : 0;
      const isDot = this.classList.contains("node-dot");
      const left = isDot ? 39 : 0;
      const width = isDot ? 6 : 860;
      const height = isDot ? 6 : 24;
      const top = isDot ? rowTop + 9 : rowTop;
      return { x: left, y: top, top, right: left + width, bottom: top + height, left, width, height, toJSON: () => ({}) };
    });

    const { container } = renderOutline();
    const rootGuide = container.querySelector<SVGGElement>(`[data-hierarchy-node-id="${ROOT_ID}"]`);

    expect(rootGuide).not.toBeNull();
    expect(rootGuide?.querySelector(".hierarchy-line")?.getAttribute("d")).toMatch(/^M 14 3 V /);
  });

  it("keeps the root hierarchy line when its only child is the new-node placeholder", () => {
    const state = useNotebookStore.getState();
    const content = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.setState({
      nodes: Object.fromEntries(Object.entries(state.nodes).filter(([, node]) => (
        node.id === ROOT_ID || node.id === content.id
      ))),
      collapsed: { [content.id]: false },
    });
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("node-bullet") ? 32 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("node-bullet") ? 20 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.treeRow === "true" ? 24 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const isDot = this.classList.contains("node-dot");
      const left = isDot ? 39 : 0;
      const width = isDot ? 6 : 860;
      const height = isDot ? 6 : 24;
      const top = isDot ? 9 : 0;
      return { x: left, y: top, top, right: left + width, bottom: top + height, left, width, height, toJSON: () => ({}) };
    });

    const { container } = render(
      <NotebookPanel
        view="outline"
        activeRoot={content}
        rootId={content.id}
        visibleNodes={[]}
      />,
    );

    expect(container.querySelector(`[data-hierarchy-node-id="${content.id}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-selection-key="ghost:${content.id}"]`)).not.toBeNull();
  });

  it("draws one debug block for every rendered node row", () => {
    const { container, getByLabelText } = renderOutline(true);
    fireEvent.click(getByLabelText("节点块"));
    const rootNodeBlock = container.querySelector<HTMLElement>('.node-layout-box[data-depth="0"]')!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;

    expect(container.querySelectorAll(".node-layout-box")).toHaveLength(
      container.querySelectorAll("[data-tree-row='true']").length,
    );
    expect(rootNodeBlock.style.left).toBe("32px");
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
