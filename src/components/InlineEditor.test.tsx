import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentRecord } from "../domain/model";
import type { AttachmentPathSource } from "../platform/attachments";
import type { NativeFileDropHandler } from "../platform/nativeAttachments";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";
import { InlineEditor } from "./InlineEditor";

const nativeAttachmentMocks = vi.hoisted(() => ({
  chooseAttachmentPaths: vi.fn(),
  listenNativeFileDrop: vi.fn(),
  dropHandler: undefined as NativeFileDropHandler | undefined,
}));
const originalElementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");

vi.mock("../platform/nativeAttachments", () => ({
  chooseAttachmentPaths: nativeAttachmentMocks.chooseAttachmentPaths,
  listenNativeFileDrop: nativeAttachmentMocks.listenNativeFileDrop,
}));

function firstContentNode() {
  return Object.values(useNotebookStore.getState().nodes).find(
    (node) => node.kind === "content" && !node.deletedAt,
  )!;
}

function StoreEditor({ nodeId }: { nodeId: string }) {
  const value = useNotebookStore((state) => state.nodes[nodeId].markdown);
  return <InlineEditor nodeId={nodeId} value={value} />;
}

function visibleEditorText(editor: EditorView) {
  const clone = editor.contentDOM.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".cm-live-hidden-mark").forEach((node) => node.remove());
  return clone.textContent ?? "";
}

function attachmentFor(name: string, index = 0): AttachmentRecord {
  return {
    id: `attachment-${index}-${name}`,
    nodeId: "node",
    name,
    mime: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
    size: 3,
    sha256: `hash-${index}`,
    localPath: `C:\\app\\attachments\\${index}`,
    remotePath: `remote/${index}`,
    pinned: false,
    createdAt: index,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
  nativeAttachmentMocks.chooseAttachmentPaths.mockReset();
  nativeAttachmentMocks.listenNativeFileDrop.mockReset();
  nativeAttachmentMocks.dropHandler = undefined;
  nativeAttachmentMocks.listenNativeFileDrop.mockImplementation(async (handler: NativeFileDropHandler) => {
    nativeAttachmentMocks.dropHandler = handler;
    return vi.fn();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalElementFromPointDescriptor) {
    Object.defineProperty(document, "elementFromPoint", originalElementFromPointDescriptor);
  } else {
    Reflect.deleteProperty(document, "elementFromPoint");
  }
});

describe("InlineEditor", () => {
  it("commits root editor content immediately when switching nodes", () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first root");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second root")!;
    const { getByLabelText, rerender } = render(
      <InlineEditor nodeId={first.id} value="first root" variant="root" />,
    );

    rerender(<InlineEditor nodeId={secondId} value="second root" variant="root" />);

    const host = getByLabelText("根节点内容");
    const editor = EditorView.findFromDOM(host)!;
    expect(host.querySelector(".inline-editor-placeholder")).toBeNull();
    expect(editor.state.doc.toString()).toBe("second root");
  });

  it("keeps an offscreen node lightweight until it approaches the viewport", async () => {
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(next: IntersectionObserverCallback) { callback = next; }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = "";
      thresholds = [];
    });
    const node = firstContentNode();
    useNotebookStore.setState({ activeNodeId: null });
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");

    expect(host.querySelector(".cm-editor")).toBeNull();
    expect(host.querySelector(".inline-editor-placeholder")?.textContent).toBe(node.markdown || " ");
    await act(async () => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(host.querySelector(".cm-editor")).not.toBeNull();
    expect(observe).toHaveBeenCalledWith(host);
  });

  it("removes the selected text when Enter splits a node", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "alpha SELECT omega");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;
    const from = editor.state.doc.toString().indexOf("SELECT");

    editor.dispatch({ selection: { anchor: from, head: from + "SELECT".length } });
    fireEvent.keyDown(content, { key: "Enter", code: "Enter" });

    const state = useNotebookStore.getState();
    expect(state.nodes[node.id].markdown).toBe("alpha ");
    expect(state.nodes[state.activeNodeId!].markdown).toBe(" omega");
  });

  it("creates and focuses the next node when Enter is pressed in an empty node", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;

    fireEvent.keyDown(content, { key: "Enter", code: "Enter" });

    const state = useNotebookStore.getState();
    const siblings = childrenOf(state, node.parentId!).filter((candidate) => candidate.kind === "content");
    expect(siblings.map((candidate) => candidate.id)).toEqual([node.id, state.activeNodeId]);
    expect(state.nodes[state.activeNodeId!].markdown).toBe("");
    expect(state.activeNodeCursor).toBe(0);
  });

  it("supports text undo and both redo shortcuts", async () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "start");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;

    editor.dispatch({ changes: { from: editor.state.doc.length, insert: "X" } });
    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("startX");

    fireEvent.keyDown(content, { key: "z", code: "KeyZ", ctrlKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("start"));

    fireEvent.keyDown(content, { key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("startX"));

    fireEvent.keyDown(content, { key: "z", code: "KeyZ", ctrlKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("start"));

    fireEvent.keyDown(content, { key: "y", code: "KeyY", ctrlKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("startX"));
  });

  it("applies and removes Markdown formatting with editor shortcuts", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "format me");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;

    editor.dispatch({ selection: { anchor: 0, head: 6 } });
    fireEvent.keyDown(content, { key: "b", code: "KeyB", ctrlKey: true });
    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("**format** me");

    fireEvent.keyDown(content, { key: "b", code: "KeyB", ctrlKey: true });
    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("format me");
  });

  it("applies existing Markdown commands from the unified menu", () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "format me");
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 0, head: 6 } });

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "粗体" }));

    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("**format** me");
    expect(editor.hasFocus).toBe(true);
  });

  it("shows a compact menu for a non-empty inline selection", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "select me");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 0, head: 6 } });
    editor.focus();

    await waitFor(() => expect(document.body.querySelector('[role="toolbar"][aria-label="文本选区菜单"]')).not.toBeNull());
    expect(document.body.querySelector('button[aria-label="粗体"]')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="复制文本"]')).not.toBeNull();
  });

  it("waits until text dragging ends before showing the inline selection menu", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "drag select");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;
    editor.focus();

    fireEvent.mouseDown(content, { button: 0 });
    editor.dispatch({ selection: { anchor: 0, head: 4 }, userEvent: "select.pointer" });

    expect(document.body.querySelector('[role="toolbar"][aria-label="文本选区菜单"]')).toBeNull();

    fireEvent.pointerUp(document, { button: 0 });

    await waitFor(() => expect(document.body.querySelector('[role="toolbar"][aria-label="文本选区菜单"]')).not.toBeNull());
  });

  it("shows newly inserted strikethrough marks while the formatted text stays selected", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "format me");
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 0, head: 6 } });

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "删除线" }));

    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("~~format~~ me");
    await waitFor(() => expect(editor.hasFocus).toBe(true));
    await waitFor(() => expect(editor.contentDOM.textContent).toBe("~~format~~ me"));
    expect(editor.state.selection.main).toEqual(EditorSelection.range(2, 8));
  });

  it("toggles the command menu by pressing and releasing Control alone", async () => {
    const node = firstContentNode();
    const { getByLabelText, getByRole, queryByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.focus();

    fireEvent.keyDown(document, { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });

    await waitFor(() => expect(getByRole("dialog", { name: "插入与格式菜单" })).toBeTruthy());
    expect(getByRole("dialog", { name: "插入与格式菜单" }).classList.contains("is-caret-anchored")).toBe(true);
    expect(getByLabelText("搜索操作")).toBe(document.activeElement);

    fireEvent.keyDown(document, { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });

    await waitFor(() => expect(queryByRole("dialog", { name: "插入与格式菜单" })).toBeNull());
    expect(editor.hasFocus).toBe(true);
  });

  it("moves keyboard ownership from the note to the positioned command menu", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "unchanged");
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });
    editor.focus();

    fireEvent.keyDown(document, { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });

    const search = await waitFor(() => getByLabelText("搜索操作"));
    await waitFor(() => expect(search).toBe(document.activeElement));
    expect(getByRole("dialog", { name: "插入与格式菜单" }).style.visibility).not.toBe("hidden");

    fireEvent.change(search, { target: { value: "斜体" } });
    fireEvent.keyDown(search, { key: "ArrowDown", code: "ArrowDown" });

    expect((search as HTMLInputElement).value).toBe("斜体");
    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("unchanged");
  });

  it("keeps the command menu anchored to the trigger while filtering and restores editor focus on Escape", async () => {
    const node = firstContentNode();
    const { getByLabelText, getByRole, queryByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    const trigger = getByRole("button", { name: "打开插入与格式菜单" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 400, right: 418, top: 700, bottom: 718, width: 18, height: 18, x: 400, y: 700,
      toJSON: () => ({}),
    });
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("editor-command-menu")) {
        const filtered = Boolean(this.querySelector<HTMLInputElement>("[aria-label='搜索操作']")?.value);
        const height = filtered ? 100 : 300;
        return { left: 0, right: 256, top: 0, bottom: height, width: 256, height, x: 0, y: 0, toJSON: () => ({}) };
      }
      return originalGetBoundingClientRect.call(this);
    });

    editor.focus();
    fireEvent.click(trigger);
    const search = await waitFor(() => getByLabelText("搜索操作"));
    const dialog = getByRole("dialog", { name: "插入与格式菜单" });
    await waitFor(() => expect(dialog.style.visibility).not.toBe("hidden"));
    const initialPosition = { left: Number.parseFloat(dialog.style.left), top: Number.parseFloat(dialog.style.top) };

    fireEvent.change(search, { target: { value: "斜体" } });
    await waitFor(() => expect(Number.parseFloat(dialog.style.top)).not.toBe(initialPosition.top));
    const filteredPosition = { left: Number.parseFloat(dialog.style.left), top: Number.parseFloat(dialog.style.top) };
    expect(filteredPosition.left).toBe(initialPosition.left);
    expect(filteredPosition.top + 100).toBe(initialPosition.top + 300);

    fireEvent.keyDown(search, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(queryByRole("dialog", { name: "插入与格式菜单" })).toBeNull());
    expect(editor.hasFocus).toBe(true);
  });

  it("does not open the command menu when Control participates in another shortcut", () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "format me");
    const { getByLabelText, queryByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 0, head: 6 } });
    editor.focus();

    fireEvent.keyDown(document, { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireEvent.keyDown(content, { key: "b", code: "KeyB", ctrlKey: true });
    fireEvent.keyUp(content, { key: "b", code: "KeyB", ctrlKey: true });
    fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });

    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("**format** me");
    expect(queryByRole("dialog", { name: "插入与格式菜单" })).toBeNull();
  });

  it("searches and executes the selected command from the keyboard", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "format me");
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 0, head: 6 } });
    editor.focus();

    fireEvent.keyDown(document, { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });
    const search = await waitFor(() => getByLabelText("搜索操作"));
    fireEvent.change(search, { target: { value: "斜体" } });
    fireEvent.keyDown(search, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("*format* me"));
    expect(editor.hasFocus).toBe(true);
    expect(getByRole("button", { name: "打开插入与格式菜单" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("inserts a node-link query from the unified menu", () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "left right");
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const editor = EditorView.findFromDOM(getByLabelText("节点内容"))!;
    editor.dispatch({ selection: { anchor: 5 } });

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "链接节点" }));

    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("left [[right");
    expect(editor.state.selection.main.head).toBe(7);
  });

  it("inserts multiple selected files at the caret in selection order", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "before after");
    const first = "C:\\source\\one.txt";
    const second = "C:\\source\\two.pdf";
    nativeAttachmentMocks.chooseAttachmentPaths.mockResolvedValue([first, second]);
    const addAttachment = vi.fn(async (_nodeId: string, source: AttachmentPathSource) =>
      attachmentFor(source.path.endsWith("one.txt") ? "one.txt" : "two.pdf", source.path.endsWith("one.txt") ? 1 : 2));
    useNotebookStore.setState({ addAttachment });
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const editor = EditorView.findFromDOM(getByLabelText("节点内容"))!;
    editor.dispatch({ selection: { anchor: 6 } });

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "插入文件" }));

    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe(
      "before [one.txt](attachment://attachment-1-one.txt) [two.pdf](attachment://attachment-2-two.pdf) after",
    ));
    expect(addAttachment.mock.calls.map((call) => call[1].path)).toEqual([first, second]);
  });

  it("does not import pasted files and points to the desktop flows", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "note");
    const file = new File(["paste"], "pasted.txt", { type: "text/plain" });
    const addAttachment = vi.fn(async () => attachmentFor("pasted.txt", 1));
    useNotebookStore.setState({ addAttachment });
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 4 } });

    fireEvent.paste(host.querySelector<HTMLElement>(".cm-content")!, {
      clipboardData: { files: [file], getData: () => "" },
    });

    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("note");
    expect(addAttachment).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    expect(getByRole("status").textContent).toContain("请使用桌面文件拖放");
  });

  it("accepts Tauri native dropped paths on the target node row", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "before after");
    const path = "C:\\source\\dropped.txt";
    const addAttachment = vi.fn(async (_nodeId: string, source: AttachmentPathSource) =>
      attachmentFor(source.path.endsWith("dropped.txt") ? "dropped.txt" : "other.txt", 1));
    useNotebookStore.setState({ addAttachment });
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    const { getByLabelText } = render(
      <div data-tree-row="true" data-node-id={node.id}>
        <StoreEditor nodeId={node.id} />
      </div>,
    );
    const host = getByLabelText("节点内容");
    const row = host.closest<HTMLElement>("[data-tree-row='true']")!;
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 6 } });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => row),
    });
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(6);
    await waitFor(() => expect(nativeAttachmentMocks.dropHandler).toBeDefined());
    nativeAttachmentMocks.dropHandler!({
      type: "drop",
      paths: [path],
      position: { x: 10, y: 10 } as never,
    });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe(
      "before [dropped.txt](attachment://attachment-1-dropped.txt) after",
    ));
    expect(addAttachment).toHaveBeenCalledOnce();
    expect(row).toBeTruthy();
  });

  it("ignores native drops whose coordinates target another row", async () => {
    const node = firstContentNode();
    const otherNodeId = useNotebookStore.getState().createSibling(node.id, "other")!;
    const path = "C:\\source\\row-drop.txt";
    const addAttachment = vi.fn(async () => attachmentFor("row-drop.txt", 1));
    useNotebookStore.setState({ addAttachment });
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    const { getByLabelText } = render(
      <div data-tree-row="true" data-node-id={node.id}>
        <StoreEditor nodeId={node.id} />
      </div>,
    );
    const host = getByLabelText("节点内容");
    render(
      <div data-tree-row="true" data-node-id={otherNodeId} />,
      { container: document.body.appendChild(document.createElement("div")) },
    );
    const otherRow = document.querySelector<HTMLElement>(`[data-node-id="${otherNodeId}"]`)!;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => otherRow),
    });
    await waitFor(() => expect(nativeAttachmentMocks.dropHandler).toBeDefined());
    nativeAttachmentMocks.dropHandler!({ type: "drop", paths: [path], position: { x: 10, y: 10 } as never });
    expect(addAttachment).not.toHaveBeenCalled();
    expect(host).toBeTruthy();
  });

  it("keeps the pending file insertion anchored while the document changes", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "before after");
    const path = "C:\\source\\late.txt";
    const pending = deferred<AttachmentRecord>();
    useNotebookStore.setState({ addAttachment: vi.fn((_nodeId: string, _source: AttachmentPathSource) => pending.promise) });
    nativeAttachmentMocks.chooseAttachmentPaths.mockResolvedValue([path]);
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 6 } });

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "插入文件" }));
    await waitFor(() => expect(host.querySelector(".cm-pending-attachment")?.textContent).toBe("正在添加文件..."));
    editor.dispatch({ changes: { from: 0, insert: "X" } });
    await act(async () => pending.resolve(attachmentFor("late.txt", 1)));

    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe(
      "Xbefore [late.txt](attachment://attachment-1-late.txt) after",
    ));
  });

  it("preserves selected text when every file insertion fails", async () => {
    const node = firstContentNode();
    useNotebookStore.getState().editMarkdown(node.id, "keep selected text");
    const path = "C:\\source\\bad.txt";
    const addAttachment = vi.fn()
      .mockRejectedValueOnce(new Error("无法读取文件"))
      .mockResolvedValue(attachmentFor("bad.txt", 1));
    useNotebookStore.setState({ addAttachment });
    nativeAttachmentMocks.chooseAttachmentPaths.mockResolvedValue([path]);
    const { getByLabelText, getByRole } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;
    editor.dispatch({ selection: { anchor: 5, head: 13 } });

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "插入文件" }));

    await waitFor(() => expect(getByRole("status").textContent).toContain("无法读取文件"));
    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("keep selected text");
    expect(host.querySelector(".cm-pending-attachment")).toBeNull();

    fireEvent.click(getByRole("button", { name: "重试" }));
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe(
      "keep [bad.txt](attachment://attachment-1-bad.txt) text",
    ));
    expect(addAttachment).toHaveBeenCalledTimes(2);
  });

  it("toggles the current node Markdown source with Mod-Shift-M", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "prefix **format**");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;

    editor.dispatch({ selection: { anchor: 0 } });
    expect(visibleEditorText(editor)).toBe("prefix format");

    fireEvent.keyDown(content, { key: "M", code: "KeyM", ctrlKey: true, shiftKey: true });
    expect(visibleEditorText(editor)).toBe("prefix **format**");

    fireEvent.keyDown(content, { key: "M", code: "KeyM", ctrlKey: true, shiftKey: true });
    expect(visibleEditorText(editor)).toBe("prefix format");
  });

  it("moves horizontally across adjacent node boundaries", async () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second")!;
    const { getAllByLabelText } = render(
      <>
        <StoreEditor nodeId={first.id} />
        <StoreEditor nodeId={secondId} />
      </>,
    );
    const hosts = getAllByLabelText("节点内容");
    const contents = hosts.map((host) => host.querySelector<HTMLElement>(".cm-content")!);
    const editors = hosts.map((host) => EditorView.findFromDOM(host)!);

    act(() => {
      editors[0].dispatch({ selection: { anchor: editors[0].state.doc.length } });
      editors[0].focus();
    });
    fireEvent.keyDown(contents[0], { key: "ArrowRight", code: "ArrowRight" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(secondId));
    expect(editors[1].state.selection.main.head).toBe(0);

    fireEvent.keyDown(contents[1], { key: "ArrowLeft", code: "ArrowLeft" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(first.id));
    expect(editors[0].state.selection.main.head).toBe(editors[0].state.doc.length);
  });

  it("crosses an atomic link before moving to the next node", async () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "[站点](https://example.com)");
    const secondId = useNotebookStore.getState().createSibling(first.id, "next")!;
    const { getAllByLabelText } = render(
      <>
        <StoreEditor nodeId={first.id} />
        <StoreEditor nodeId={secondId} />
      </>,
    );
    const hosts = getAllByLabelText("节点内容");
    const editors = hosts.map((host) => EditorView.findFromDOM(host)!);
    const contents = hosts.map((host) => host.querySelector<HTMLElement>(".cm-content")!);

    act(() => {
      editors[0].dispatch({ selection: { anchor: 0 } });
      editors[0].focus();
    });
    fireEvent.keyDown(contents[0], { key: "ArrowRight", code: "ArrowRight" });
    expect(editors[0].state.selection.main.head).toBe(editors[0].state.doc.length);
    expect(useNotebookStore.getState().activeNodeId).toBe(first.id);

    fireEvent.keyDown(contents[0], { key: "ArrowRight", code: "ArrowRight" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(secondId));
    expect(editors[1].state.selection.main.head).toBe(0);
  });

  it("deletes an only atomic link before considering a merge with the previous node", () => {
    const previous = firstContentNode();
    useNotebookStore.getState().editMarkdown(previous.id, "previous");
    const linkId = useNotebookStore.getState().createSibling(previous.id, "[站点](https://example.com)")!;
    const { getByLabelText } = render(<StoreEditor nodeId={linkId} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;

    act(() => {
      editor.dispatch({ selection: { anchor: editor.state.doc.length } });
      editor.focus();
    });
    fireEvent.keyDown(content, { key: "Backspace", code: "Backspace" });

    const state = useNotebookStore.getState();
    expect(state.nodes[previous.id].markdown).toBe("previous");
    expect(state.nodes[linkId].markdown).toBe("");
    expect(childrenOf(state, previous.parentId!).map((node) => node.id)).toContain(linkId);
  });

  it("moves focus to an adjacent virtualized node that is not mounted", async () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second")!;
    const { getByLabelText } = render(
      <div data-tree-row="true" data-navigation-next-key={secondId}>
        <StoreEditor nodeId={first.id} />
      </div>,
    );
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;

    act(() => {
      editor.dispatch({ selection: { anchor: editor.state.doc.length } });
      editor.focus();
    });
    fireEvent.keyDown(host.querySelector<HTMLElement>(".cm-content")!, { key: "ArrowRight", code: "ArrowRight" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(secondId));
    expect(useNotebookStore.getState().activeNodeCursor).toBe(0);
  });

  it("moves vertically across adjacent nodes while preserving the text column", async () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second")!;
    const { getAllByLabelText } = render(
      <>
        <StoreEditor nodeId={first.id} />
        <StoreEditor nodeId={secondId} />
      </>,
    );
    const hosts = getAllByLabelText("节点内容");
    const contents = hosts.map((host) => host.querySelector<HTMLElement>(".cm-content")!);
    const editors = hosts.map((host) => EditorView.findFromDOM(host)!);

    act(() => {
      editors[0].dispatch({ selection: { anchor: 3 } });
      editors[0].focus();
    });
    fireEvent.keyDown(contents[0], { key: "ArrowDown", code: "ArrowDown" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(secondId));
    expect(editors[1].state.selection.main.head).toBe(3);

    fireEvent.keyDown(contents[1], { key: "ArrowUp", code: "ArrowUp" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(first.id));
    expect(editors[0].state.selection.main.head).toBe(3);
  });

  it("pastes multiline text at the selection without loss or reordering", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "left SELECT right");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;
    const from = editor.state.doc.toString().indexOf("SELECT");

    editor.dispatch({ selection: { anchor: from, head: from + "SELECT".length } });
    fireEvent.paste(content, {
      clipboardData: { getData: () => "one\r\n\r\n  three  " },
    });

    const state = useNotebookStore.getState();
    const siblings = childrenOf(state, node.parentId!).filter((item) => item.kind === "content");
    const nodeIndex = siblings.findIndex((item) => item.id === node.id);
    expect(siblings.slice(nodeIndex, nodeIndex + 3).map((item) => item.markdown)).toEqual([
      "left one",
      "",
      "  three   right",
    ]);
  });
});
