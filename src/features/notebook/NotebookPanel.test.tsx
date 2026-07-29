import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT_ID, type NodeRecord } from "../../domain/model";
import { visibleNodes } from "../../domain/tree";
import { useNotebookStore } from "../../store/useNotebookStore";
import { NotebookPanel } from "./NotebookPanel";
import { visibleNodesForView } from "./model/notebookView";

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
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

function ReactiveOutline() {
  const nodes = useNotebookStore((state) => state.nodes);
  const collapsed = useNotebookStore((state) => state.collapsed);
  return (
    <NotebookPanel
      view="outline"
      activeRoot={null}
      rootId={ROOT_ID}
      visibleNodes={visibleNodesForView({ nodes, collapsed }, "outline", ROOT_ID, "")}
    />
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

function installTreeMotionMocks() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const row = this.matches("[data-tree-block-key]")
      ? this
      : this.closest<HTMLElement>("[data-tree-block-key]");
    if (!row) return box(0, 0, 0, 0);
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const top = Math.max(0, rows.indexOf(row)) * 40;
    const left = this.classList.contains("node-bullet")
      ? 40 + Number(row.dataset.depth ?? 0) * 24
      : 0;
    return box(left, top, left + 800, top + 32);
  });
  const animate = vi.fn(() => ({
    cancel: vi.fn(),
    finished: new Promise<void>(() => undefined),
  }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });

  const flushFrame = () => {
    const callbacks = frames.splice(0);
    act(() => callbacks.forEach((callback) => callback(performance.now())));
  };
  return { animate, flushFrame };
}

describe("NotebookPanel draft structure commands", () => {
  it("does not materialize the page ghost when Tab cannot indent it", () => {
    const beforeIds = Object.keys(useNotebookStore.getState().nodes);
    const { container } = render(<ReactiveOutline />);
    const content = container.querySelector<HTMLElement>(
      `[data-selection-key="ghost:${ROOT_ID}"] .cm-content`,
    )!;

    fireEvent.keyDown(content, { key: "Tab", code: "Tab", keyCode: 9, which: 9 });

    expect(Object.keys(useNotebookStore.getState().nodes)).toEqual(beforeIds);
    expect(container.querySelector(`[data-selection-key="ghost:${ROOT_ID}"]`)).not.toBeNull();
  });

  it("does not materialize a direct child ghost when Shift+Tab hits the page boundary", () => {
    const pageId = useNotebookStore.getState().createChild(ROOT_ID, "page")!;
    useNotebookStore.setState((state) => ({
      activeRootId: pageId,
      collapsed: { ...state.collapsed, [pageId]: false },
    }));
    const beforeIds = Object.keys(useNotebookStore.getState().nodes);
    const { container } = render(<ReactiveOutline />);
    const content = container.querySelector<HTMLElement>(
      `[data-selection-key="ghost:${pageId}"] .cm-content`,
    )!;

    fireEvent.keyDown(content, { key: "Tab", code: "Tab", shiftKey: true, keyCode: 9, which: 9 });

    expect(Object.keys(useNotebookStore.getState().nodes)).toEqual(beforeIds);
    expect(container.querySelector(`[data-selection-key="ghost:${pageId}"]`)).not.toBeNull();
  });

  it("materializes and indents the page ghost after its persisted row mounts", async () => {
    const previousId = useNotebookStore.getState().createChild(ROOT_ID, "previous sibling")!;
    const beforeIds = new Set(Object.keys(useNotebookStore.getState().nodes));
    const motion = installTreeMotionMocks();
    const { container } = render(<ReactiveOutline />);
    motion.flushFrame();
    const content = container.querySelector<HTMLElement>(
      `[data-selection-key="ghost:${ROOT_ID}"] .cm-content`,
    )!;

    fireEvent.keyDown(content, { key: "Tab", code: "Tab", keyCode: 9, which: 9 });
    motion.flushFrame();
    motion.flushFrame();

    await waitFor(() => {
      const created = Object.values(useNotebookStore.getState().nodes)
        .filter((node) => !beforeIds.has(node.id));
      expect(created).toHaveLength(1);
      expect(created[0]?.parentId).toBe(previousId);
    });
    expect(motion.animate).toHaveBeenCalled();
  });

  it("reuses the page ghost for consecutive Tab submissions", async () => {
    const previousId = useNotebookStore.getState().createChild(ROOT_ID, "previous sibling")!;
    const beforeIds = new Set(Object.keys(useNotebookStore.getState().nodes));
    const motion = installTreeMotionMocks();
    const { container } = render(<ReactiveOutline />);
    motion.flushFrame();

    const pressPageGhostTab = () => {
      const content = container.querySelector<HTMLElement>(
        `[data-selection-key="ghost:${ROOT_ID}"] .cm-content`,
      )!;
      fireEvent.keyDown(content, { key: "Tab", code: "Tab", keyCode: 9, which: 9 });
      motion.flushFrame();
      motion.flushFrame();
    };

    pressPageGhostTab();
    await waitFor(() => expect(
      Object.values(useNotebookStore.getState().nodes).filter((node) => !beforeIds.has(node.id)),
    ).toHaveLength(1));

    pressPageGhostTab();
    await waitFor(() => {
      const created = Object.values(useNotebookStore.getState().nodes)
        .filter((node) => !beforeIds.has(node.id));
      expect(created).toHaveLength(2);
      expect(created.every((node) => node.parentId === previousId)).toBe(true);
    });
  });

  it("materializes and outdents a child ghost with a layout animation", async () => {
    const parentId = useNotebookStore.getState().createChild(ROOT_ID, "parent")!;
    useNotebookStore.setState((state) => ({
      collapsed: { ...state.collapsed, [parentId]: false },
    }));
    const beforeIds = new Set(Object.keys(useNotebookStore.getState().nodes));
    const motion = installTreeMotionMocks();
    const { container } = render(<ReactiveOutline />);
    motion.flushFrame();
    const content = container.querySelector<HTMLElement>(
      `[data-selection-key="ghost:${parentId}"] .cm-content`,
    )!;

    fireEvent.keyDown(content, { key: "Tab", code: "Tab", shiftKey: true, keyCode: 9, which: 9 });
    motion.flushFrame();
    motion.flushFrame();

    await waitFor(() => {
      const created = Object.values(useNotebookStore.getState().nodes)
        .filter((node) => !beforeIds.has(node.id));
      expect(created).toHaveLength(1);
      expect(created[0]?.parentId).toBe(ROOT_ID);
    });
    expect(motion.animate).toHaveBeenCalled();
  });

  it("animates a real node indent when it replaces an empty parent's ghost", async () => {
    const parentId = useNotebookStore.getState().createChild(ROOT_ID, "empty parent")!;
    const movingId = useNotebookStore.getState().createChild(ROOT_ID, "moving node")!;
    useNotebookStore.setState((state) => ({
      collapsed: { ...state.collapsed, [parentId]: false },
    }));
    const motion = installTreeMotionMocks();
    const { container } = render(<ReactiveOutline />);
    motion.flushFrame();
    expect(container.querySelector(`[data-selection-key="ghost:${parentId}"]`)).not.toBeNull();

    act(() => useNotebookStore.getState().indent(movingId));

    await waitFor(() => {
      expect(useNotebookStore.getState().nodes[movingId].parentId).toBe(parentId);
      expect(container.querySelector(`[data-selection-key="ghost:${parentId}"]`)).toBeNull();
      expect(motion.animate).toHaveBeenCalled();
    });
  });
});

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

  it("projects root-heading side gutters to a real editor position", () => {
    const store = useNotebookStore.getState();
    const content = Object.values(store.nodes).find((node) => node.kind === "content")!;
    store.editMarkdown(content.id, "root canvas");
    const state = useNotebookStore.getState();
    const activeContent = state.nodes[content.id];
    const { container } = render(
      <NotebookPanel
        view="outline"
        activeRoot={activeContent}
        rootId={activeContent.id}
        visibleNodes={visibleNodes(state, activeContent.id)}
      />,
    );
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const heading = container.querySelector<HTMLElement>(".root-node-heading")!;
    const rootEditor = EditorView.findFromDOM(heading.querySelector<HTMLElement>(".inline-editor")!)!;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(4);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === heading) return box(100, 80, 900, 120);
      if (this.classList.contains("cm-content")) return box(200, 80, 800, 120);
      if (this.classList.contains("tree-list")) return box(100, 180, 900, 400);
      const rowIndex = rows.indexOf(this);
      if (rowIndex >= 0) return box(100, 180 + rowIndex * 32, 900, 204 + rowIndex * 32);
      return box(0, 0, 0, 0);
    });

    fireEvent.pointerDown(area, { button: 0, pointerId: 1, clientX: 20, clientY: 100 });

    expect(useNotebookStore.getState().activeNodeId).toBe(activeContent.id);
    expect(rootEditor.state.selection.main.head).toBe(3);
    expect(posAtCoords).toHaveBeenCalledWith({ x: 201, y: 100 }, false);

    fireEvent.pointerDown(area, { button: 0, pointerId: 2, clientX: 20, clientY: 135 });

    expect(rootEditor.state.selection.main.head).toBe(4);
    expect(posAtCoords).toHaveBeenLastCalledWith({ x: 201, y: 119 }, false);
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

    fireEvent.pointerDown(treeList, { button: 0, pointerId: 1, clientX: 700, clientY: contentTop + 26 });

    expect(useNotebookStore.getState().activeNodeId).toBe(content.id);
    useNotebookStore.getState().setActiveNode(null);
    const ghostIndex = rows.findIndex((row) => row.dataset.selectionKey === `ghost:${ROOT_ID}`);

    fireEvent.pointerDown(treeList, { button: 0, pointerId: 2, clientX: 700, clientY: 4 + ghostIndex * 32 + 26 });

    expect(useNotebookStore.getState().activeGhostParentId).toBe(ROOT_ID);
  });

  it("uses the page ghost as the landing point for canvas whitespace after the tree", () => {
    useNotebookStore.getState().setActiveNode(null);
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === treeList) return box(0, 100, 860, 260);
      return box(0, 0, 860, 800);
    });

    fireEvent.pointerDown(area, { button: 0, pointerId: 1, clientX: 700, clientY: 700 });

    expect(container.querySelector(".content-area")?.classList.contains("is-editable-canvas")).toBe(true);
    expect(useNotebookStore.getState().activeGhostParentId).toBe(ROOT_ID);
  });

  it("resolves blank canvas focus before the current editor can blur", async () => {
    const state = useNotebookStore.getState();
    const content = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.getState().focusNode(content.id, 0);
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    const sourceRow = container.querySelector<HTMLElement>(`[data-node-id="${content.id}"]`)!;
    const sourceEditor = EditorView.findFromDOM(sourceRow.querySelector<HTMLElement>(".inline-editor")!)!;
    const blurTargets: Array<string | null> = [];
    sourceEditor.contentDOM.addEventListener("blur", () => {
      blurTargets.push(useNotebookStore.getState().activeGhostParentId);
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === treeList) return box(0, 100, 860, 260);
      return box(0, 0, 860, 800);
    });

    expect(sourceEditor.hasFocus).toBe(true);
    const dispatchResult = fireEvent.pointerDown(area, {
      button: 0,
      pointerId: 1,
      clientX: 700,
      clientY: 700,
    });

    expect(dispatchResult).toBe(false);
    expect(useNotebookStore.getState().activeGhostParentId).toBe(ROOT_ID);
    await waitFor(() => expect(blurTargets).toEqual([ROOT_ID]));
  });

  it("keeps the click canvas full width while the document column stays constrained", () => {
    const { container } = renderOutline();

    expect(container.querySelector(".content-area")).not.toBeNull();
    expect(container.querySelector(".content-area > .content-canvas-inner")).not.toBeNull();
  });

  it("uses the row under the pointer even when clicking in the canvas side gutter", () => {
    const state = useNotebookStore.getState();
    const content = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.getState().editMarkdown(content.id, "canvas position");
    useNotebookStore.getState().setActiveNode(null);
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const contentIndex = rows.findIndex((row) => row.dataset.nodeId === content.id);
    const contentEditor = EditorView.findFromDOM(rows[contentIndex].querySelector<HTMLElement>(".inline-editor")!)!;
    const contentTop = 4 + contentIndex * 32;
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(7);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === treeList) return box(100, 0, 900, 240);
      if (this.classList.contains("cm-content")) return box(200, contentTop, 800, contentTop + 24);
      const rowIndex = rows.indexOf(this);
      if (rowIndex >= 0) return box(100, 4 + rowIndex * 32, 900, 28 + rowIndex * 32);
      return box(0, 0, 0, 0);
    });

    fireEvent.pointerDown(area, { button: 0, pointerId: 1, clientX: 20, clientY: contentTop + 10 });

    expect(useNotebookStore.getState().activeNodeId).toBe(content.id);
    expect(contentEditor.state.selection.main.head).toBe(2);
    expect(posAtCoords).toHaveBeenLastCalledWith({ x: 201, y: contentTop + 10 }, false);

    fireEvent.pointerDown(area, { button: 0, pointerId: 2, clientX: 980, clientY: contentTop + 10 });

    expect(contentEditor.state.selection.main.head).toBe(7);
    expect(posAtCoords).toHaveBeenLastCalledWith({ x: 799, y: contentTop + 10 }, false);
  });

  it.each(["search", "trash"] as const)("does not turn %s into an editable canvas", (view) => {
    const { container } = render(
      <NotebookPanel view={view} activeRoot={null} rootId={ROOT_ID} visibleNodes={[]} />,
    );
    const area = container.querySelector<HTMLElement>(".content-area")!;
    useNotebookStore.getState().setActiveNode(null);

    fireEvent.pointerDown(area, { button: 0, pointerId: 1, clientX: 700, clientY: 700 });

    expect(area.classList.contains("is-editable-canvas")).toBe(false);
    expect(useNotebookStore.getState().activeGhostParentId).toBeNull();
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

  it("keeps the editor selection logically intact during node preview and clears it on commit", () => {
    const state = useNotebookStore.getState();
    const source = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.getState().editMarkdown(source.id, "preview selection");
    const { container } = renderOutline();
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const targetRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const host = sourceRow.querySelector<HTMLElement>(".inline-editor")!;
    const editor = EditorView.findFromDOM(host)!;
    dragTo(targetRow);
    fireEvent.pointerDown(host.querySelector(".cm-content")!, { button: 0, pointerId: 4 });
    editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });
    fireEvent.pointerMove(area, { pointerId: 4, clientX: 20, clientY: 200 });
    fireEvent.mouseMove(area, { buttons: 1, clientX: 20, clientY: 200 });

    expect(editor.state.selection.main.empty).toBe(false);
    expect(editor.hasFocus).toBe(true);
    expect(area.classList.contains("has-node-selection")).toBe(true);

    fireEvent.pointerUp(area, { pointerId: 4 });

    expect(editor.state.selection.main.empty).toBe(true);
    expect(editor.hasFocus).toBe(false);
    expect(document.activeElement).toBe(area);
  });

  it.each([
    { label: "left", clientX: 120 },
    { label: "right", clientX: 920 },
  ])("promotes a drag beyond the node layout on the $label to a single-node selection", ({ clientX }) => {
    const state = useNotebookStore.getState();
    const source = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const sourceIndex = rows.indexOf(sourceRow);
    const sourceTop = 100 + sourceIndex * 32;
    const content = sourceRow.querySelector<HTMLElement>(".cm-content")!;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === treeList) return box(100, 100, 900, 100 + rows.length * 32);
      const rowIndex = rows.indexOf(this);
      if (rowIndex >= 0) return box(100, 100 + rowIndex * 32, 900, 124 + rowIndex * 32);
      return box(0, 0, 0, 0);
    });
    dragTo(area);

    fireEvent.pointerDown(content, { button: 0, pointerId: 8, clientX: 300, clientY: sourceTop + 12 });
    fireEvent.pointerMove(area, { pointerId: 8, clientX, clientY: sourceTop + 12 });

    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(1);
    expect(sourceRow.classList.contains("is-node-selected")).toBe(true);
    expect(document.activeElement).toBe(content);

    fireEvent.pointerUp(area, { pointerId: 8 });

    expect(document.activeElement).toBe(area);
  });

  it("continues a node selection vertically through either page side gutter", () => {
    const store = useNotebookStore.getState();
    const source = Object.values(store.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    const targetId = store.createSibling(source.id, "side target")!;
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const targetRow = container.querySelector<HTMLElement>(`[data-selection-key="${targetId}"]`)!;
    const sourceTop = 100 + rows.indexOf(sourceRow) * 32;
    const targetTop = 100 + rows.indexOf(targetRow) * 32;
    const content = sourceRow.querySelector<HTMLElement>(".cm-content")!;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === treeList) return box(100, 100, 900, 100 + rows.length * 32);
      const rowIndex = rows.indexOf(this);
      if (rowIndex >= 0) return box(100, 100 + rowIndex * 32, 900, 124 + rowIndex * 32);
      return box(0, 0, 0, 0);
    });
    dragTo(area);

    fireEvent.pointerDown(content, { button: 0, pointerId: 9, clientX: 300, clientY: sourceTop + 12 });
    fireEvent.pointerMove(area, { pointerId: 9, clientX: 20, clientY: sourceTop + 12 });
    fireEvent.pointerMove(area, { pointerId: 9, clientX: 980, clientY: targetTop + 12 });

    expect(sourceRow.classList.contains("is-node-selected")).toBe(true);
    expect(targetRow.classList.contains("is-node-selected")).toBe(true);
  });

  it("keeps a horizontal drag inside the node layout as a text selection", () => {
    const state = useNotebookStore.getState();
    const source = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.getState().editMarkdown(source.id, "select text");
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const content = sourceRow.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(sourceRow.querySelector<HTMLElement>(".inline-editor")!)!;
    vi.spyOn(sourceRow, "getBoundingClientRect").mockReturnValue(box(100, 100, 900, 124));
    editor.dispatch({ selection: { anchor: 0, head: 6 } });
    editor.focus();
    dragTo(content);

    fireEvent.pointerDown(content, { button: 0, pointerId: 10, clientX: 300, clientY: 112 });
    fireEvent.pointerMove(area, { pointerId: 10, clientX: 500, clientY: 112 });

    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(0);
    expect(editor.state.selection.main.empty).toBe(false);
    expect(editor.hasFocus).toBe(true);
  });

  it.each([
    { label: "empty", markdown: "" },
    { label: "wrapped text", markdown: "first line\nsecond line" },
  ])("returns a $label drag from node preview to text selection", ({ markdown }) => {
    const state = useNotebookStore.getState();
    const source = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.getState().editMarkdown(source.id, markdown);
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const sourceTop = 100 + rows.indexOf(sourceRow) * 40;
    const content = sourceRow.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(sourceRow.querySelector<HTMLElement>(".inline-editor")!)!;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === treeList) return box(100, 100, 900, 100 + rows.length * 40);
      const rowIndex = rows.indexOf(this);
      if (rowIndex >= 0) return box(100, 100 + rowIndex * 40, 900, 132 + rowIndex * 40);
      return box(0, 0, 0, 0);
    });
    editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });
    editor.focus();
    dragTo(area);

    fireEvent.pointerDown(content, { button: 0, pointerId: 11, clientX: 300, clientY: sourceTop + 16 });
    fireEvent.pointerMove(area, { pointerId: 11, clientX: 20, clientY: sourceTop + 16 });

    expect(sourceRow.classList.contains("is-node-selected")).toBe(true);
    expect(area.classList.contains("has-node-selection")).toBe(true);
    expect(editor.state.selection.main.from).toBe(0);
    expect(editor.state.selection.main.to).toBe(editor.state.doc.length);
    expect(editor.hasFocus).toBe(true);

    fireEvent.pointerMove(area, { pointerId: 11, clientX: 300, clientY: sourceTop + 16 });

    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(0);
    expect(area.classList.contains("has-node-selection")).toBe(false);
    expect(editor.state.selection.main.from).toBe(0);
    expect(editor.state.selection.main.to).toBe(editor.state.doc.length);
    expect(editor.hasFocus).toBe(true);

    fireEvent.pointerUp(area, { pointerId: 11 });

    expect(editor.state.selection.main.from).toBe(0);
    expect(editor.state.selection.main.to).toBe(editor.state.doc.length);
    expect(editor.hasFocus).toBe(true);
  });

  it("returns from a cross-node preview to the anchor editor", () => {
    const store = useNotebookStore.getState();
    const source = Object.values(store.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    const targetId = store.createSibling(source.id, "preview target")!;
    store.editMarkdown(source.id, "anchor text");
    const { container } = renderOutline();
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const treeList = container.querySelector<HTMLElement>(".tree-list")!;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const targetRow = container.querySelector<HTMLElement>(`[data-selection-key="${targetId}"]`)!;
    const sourceTop = 100 + rows.indexOf(sourceRow) * 40;
    const targetTop = 100 + rows.indexOf(targetRow) * 40;
    const content = sourceRow.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(sourceRow.querySelector<HTMLElement>(".inline-editor")!)!;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === treeList) return box(100, 100, 900, 100 + rows.length * 40);
      const rowIndex = rows.indexOf(this);
      if (rowIndex >= 0) return box(100, 100 + rowIndex * 40, 900, 132 + rowIndex * 40);
      return box(0, 0, 0, 0);
    });
    editor.dispatch({ selection: { anchor: 1, head: 6 } });
    editor.focus();
    dragTo(area);

    fireEvent.pointerDown(content, { button: 0, pointerId: 12, clientX: 300, clientY: sourceTop + 16 });
    fireEvent.pointerMove(area, { pointerId: 12, clientX: 980, clientY: targetTop + 16 });

    expect(sourceRow.classList.contains("is-node-selected")).toBe(true);
    expect(targetRow.classList.contains("is-node-selected")).toBe(true);

    fireEvent.pointerMove(area, { pointerId: 12, clientX: 300, clientY: sourceTop + 16 });
    fireEvent.pointerUp(area, { pointerId: 12 });

    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(0);
    expect(editor.state.selection.main.from).toBe(1);
    expect(editor.state.selection.main.to).toBe(6);
    expect(editor.hasFocus).toBe(true);
  });

  it.each([
    { label: "empty", markdown: "" },
    { label: "non-empty", markdown: "editable node" },
  ])("returns focus from a node selection to a $label editor without content-specific handling", async ({ markdown }) => {
    const state = useNotebookStore.getState();
    const source = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    useNotebookStore.getState().editMarkdown(source.id, markdown);
    const { container } = renderOutline();
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const targetRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    const content = sourceRow.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(sourceRow.querySelector<HTMLElement>(".inline-editor")!)!;
    editor.focus();
    dragTo(targetRow);

    fireEvent.pointerDown(content, { button: 0, pointerId: 6 });
    fireEvent.pointerMove(area, { pointerId: 6, clientX: 20, clientY: 200 });

    expect(document.activeElement).toBe(content);
    expect(editor.hasFocus).toBe(true);
    expect(container.querySelectorAll(".is-node-selected").length).toBeGreaterThan(1);

    fireEvent.pointerUp(area, { pointerId: 6 });
    expect(document.activeElement).toBe(area);
    expect(editor.hasFocus).toBe(false);
    fireEvent.pointerDown(content, { button: 0, pointerId: 7 });
    fireEvent.mouseDown(content, { button: 0 });

    await waitFor(() => expect(editor.hasFocus).toBe(true));
    expect(document.activeElement).toBe(content);
    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(0);
    expect(editor.state.selection.main.empty).toBe(true);
  });

  it("clears a multi-node selection with an unmodified arrow key", () => {
    const state = useNotebookStore.getState();
    const source = Object.values(state.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    const { container } = renderOutline();
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${source.id}"]`)!;
    const targetRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    dragTo(targetRow);

    fireEvent.pointerDown(sourceRow.querySelector(".node-content")!, { button: 0, pointerId: 5 });
    fireEvent.pointerMove(area, { pointerId: 5, clientX: 20, clientY: 200 });
    expect(container.querySelectorAll(".is-node-selected").length).toBeGreaterThan(1);

    fireEvent.keyDown(area, { key: "ArrowDown", code: "ArrowDown" });

    expect(container.querySelectorAll(".is-node-selected")).toHaveLength(0);
  });

  it.each([
    { key: "ArrowDown", source: "first", target: "second" },
    { key: "ArrowUp", source: "second", target: "first" },
  ] as const)("promotes a $key text selection at its boundary before extending to adjacent nodes", async ({ key, source, target }) => {
    const store = useNotebookStore.getState();
    const first = Object.values(store.nodes).find((node) => node.kind === "content" && !node.deletedAt)!;
    store.editMarkdown(first.id, "first node");
    const secondId = store.createSibling(first.id, "second node")!;
    const { container } = renderOutline();
    const sourceId = source === "first" ? first.id : secondId;
    const targetId = target === "first" ? first.id : secondId;
    const sourceRow = container.querySelector<HTMLElement>(`[data-selection-key="${sourceId}"]`)!;
    const sourceEditor = EditorView.findFromDOM(sourceRow.querySelector<HTMLElement>(".inline-editor")!)!;
    const content = sourceRow.querySelector<HTMLElement>(".cm-content")!;
    sourceEditor.dispatch({
      selection: key === "ArrowDown"
        ? { anchor: 0, head: sourceEditor.state.doc.length }
        : { anchor: sourceEditor.state.doc.length, head: 0 },
    });
    sourceEditor.focus();

    fireEvent.keyDown(content, { key, code: key, shiftKey: true });
    expect(sourceEditor.state.selection.main.empty).toBe(true);
    expect(sourceRow.classList.contains("is-node-selected")).toBe(true);

    fireEvent.keyDown(content, { key, code: key, shiftKey: true });
    await waitFor(() => expect(
      container.querySelector<HTMLElement>(`[data-selection-key="${targetId}"]`)?.classList.contains("is-node-selected"),
    ).toBe(true));
    expect(sourceRow.classList.contains("is-node-selected")).toBe(true);
  });

  it.each(["ArrowUp", "ArrowDown"] as const)("keeps Shift+%s inside text when the caret has not reached the node boundary", (key) => {
    const store = useNotebookStore.getState();
    const node = Object.values(store.nodes).find((candidate) => candidate.kind === "content" && !candidate.deletedAt)!;
    store.editMarkdown(node.id, "middle text");
    const { container } = renderOutline();
    const row = container.querySelector<HTMLElement>(`[data-selection-key="${node.id}"]`)!;
    const editor = EditorView.findFromDOM(row.querySelector<HTMLElement>(".inline-editor")!)!;
    const content = row.querySelector<HTMLElement>(".cm-content")!;
    editor.dispatch({ selection: { anchor: 6 } });
    editor.focus();

    fireEvent.keyDown(content, { key, code: key, shiftKey: true });

    expect(row.classList.contains("is-node-selected")).toBe(false);
    expect(editor.state.selection.main.empty).toBe(false);
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

  it("focuses the page ghost after deleting every node on the current page", async () => {
    const state = useNotebookStore.getState();
    const date = Object.values(state.nodes).find((node) => node.kind === "date")!;
    const { container } = render(<ReactiveOutline />);
    const dateRow = container.querySelector<HTMLElement>(`[data-selection-key="${date.id}"]`)!;
    const rootGhostRow = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"]`)!;
    const area = container.querySelector<HTMLElement>(".content-area")!;
    dragTo(rootGhostRow);

    fireEvent.pointerDown(dateRow.querySelector(".date-content")!, { button: 0, pointerId: 3 });
    fireEvent.pointerMove(area, { pointerId: 3, clientX: 20, clientY: 200 });
    fireEvent.keyDown(area, { key: "Delete" });

    await waitFor(() => {
      const ghost = container.querySelector<HTMLElement>(`[data-selection-key="ghost:${ROOT_ID}"] .ghost-editor`);
      expect(ghost?.querySelector(".cm-focused")).not.toBeNull();
    });
    expect(useNotebookStore.getState().activeGhostParentId).toBe(ROOT_ID);
  });
});
