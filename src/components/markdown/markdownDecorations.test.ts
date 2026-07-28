import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotebookStore } from "../../store/useNotebookStore";
import { editorTheme } from "../editorTheme";
import { createMarkdownEditorExtensions } from "./markdownEditor";
import { toggleMarkdownSourceMode } from "./markdownPreviewState";
import {
  deleteVisibleBackward,
  moveAcrossVisibleComponentBackward,
  moveAcrossVisibleComponentForward,
} from "./markdownVisibleEditing";
import { atMarkdownVisualEnd, atMarkdownVisualStart, markdownAtomsAt } from "./markdownDecorations";

const views: EditorView[] = [];

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

function createView(doc: string, anchor = 0, parentClassName = "") {
  const parent = document.createElement("div");
  parent.className = parentClassName;
  const mount = parentClassName === "tree-list"
    ? (() => {
      const row = document.createElement("div");
      row.className = "tree-row";
      parent.append(row);
      return row;
    })()
    : parent;
  document.body.append(parent);
  const view = new EditorView({
    parent: mount,
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [...createMarkdownEditorExtensions(), editorTheme],
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
});

describe("Markdown live preview", () => {
  it("styles parsed formats and does not parse bold inside inline code", () => {
    const view = createView("start **bold** and `**code**`");

    expect(view.dom.querySelectorAll(".cm-live-bold")).toHaveLength(1);
    expect(view.dom.querySelector(".cm-live-bold")?.textContent).toBe("bold");
    expect(view.dom.querySelector(".cm-live-code")?.textContent).toBe("**code**");
  });

  it("reveals the current marks anywhere inside the syntax range", () => {
    const view = createView("start **bold**");
    expect(view.contentDOM.textContent).toBe("start bold");

    view.focus();
    view.dispatch({ selection: { anchor: 8 } });
    expect(view.contentDOM.textContent).toBe("start **bold**");

    view.dispatch({ selection: { anchor: 9 } });
    expect(view.contentDOM.textContent).toBe("start **bold**");

    view.dispatch({ selection: { anchor: 5 } });
    expect(view.contentDOM.textContent).toBe("start bold");
  });

  it("reveals only the innermost syntax range when formats are nested", () => {
    const source = "**bold *italic***";
    const innerPosition = source.indexOf("italic") + 2;
    const view = createView(source, innerPosition);
    view.focus();
    view.dispatch({ selection: { anchor: innerPosition } });

    expect(view.contentDOM.textContent).toBe("bold *italic*");
  });

  it("keeps a multi-character mark visible when the caret is inside it", () => {
    const view = createView("**bold**", 4);
    view.focus();
    view.dispatch({ selection: { anchor: 7 } });

    expect(view.contentDOM.textContent).toBe("**bold**");

    view.dispatch({ selection: { anchor: 1 } });
    expect(view.contentDOM.textContent).toBe("**bold**");
  });

  it("hides heading spacing and reveals the prefix at the content boundary", () => {
    const view = createView("# heading", 4);
    expect(view.contentDOM.textContent).toBe("heading");

    view.focus();
    view.dispatch({ selection: { anchor: 2 } });
    expect(view.contentDOM.textContent).toBe("# heading");
  });

  it("toggles full source for the current editor and resets it on blur", () => {
    const view = createView("prefix **bold**", 0);
    view.focus();
    expect(view.contentDOM.textContent).toBe("prefix bold");

    expect(toggleMarkdownSourceMode(view)).toBe(true);
    expect(view.contentDOM.textContent).toBe("prefix **bold**");

    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    expect(view.contentDOM.textContent).toBe("prefix bold");
    button.remove();
  });

  it("shows the raw task marker only in source mode", () => {
    const view = createView("[ ] todo", 6);
    view.focus();
    expect(view.dom.querySelector(".cm-live-task-checkbox")).not.toBeNull();

    toggleMarkdownSourceMode(view);

    expect(view.dom.querySelector(".cm-live-task-checkbox")).toBeNull();
    expect(view.contentDOM.textContent).toBe("[ ] todo");
  });

  it("enables synthesized italic styling for fonts without an italic face", () => {
    const view = createView("*中文斜体*");
    const italic = view.dom.querySelector<HTMLElement>(".cm-live-italic");

    expect(italic).not.toBeNull();
    expect(getComputedStyle(italic!).fontStyle).toBe("italic");
    expect(getComputedStyle(italic!).fontSynthesis).toContain("style");
  });

  it("renders a task checkbox and toggles the stored Markdown marker", () => {
    const view = createView("[ ] todo", 8);
    const checkbox = view.dom.querySelector<HTMLInputElement>(".cm-live-task-checkbox");

    expect(checkbox).not.toBeNull();
    expect(checkbox?.checked).toBe(false);
    checkbox?.click();

    expect(view.state.doc.toString()).toBe("[x] todo");
    expect(view.dom.querySelector<HTMLInputElement>(".cm-live-task-checkbox")?.checked).toBe(true);
  });

  it("applies all six supported heading levels and quote styling", () => {
    const source = "# one\n### three\n#### four\n###### six\n> quote";
    const view = createView(source, source.length);

    expect(view.dom.querySelectorAll(".cm-live-heading")).toHaveLength(4);
    expect(view.dom.querySelectorAll(".cm-live-heading-6")).toHaveLength(1);
    expect(view.dom.querySelectorAll(".cm-live-quote")).toHaveLength(1);
  });

  it("renders a safe inline link while preserving unsafe targets as source", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const safe = createView("[site](https://example.com/path)");
    const link = safe.dom.querySelector<HTMLButtonElement>(".cm-live-link")!;

    expect(safe.contentDOM.textContent).toBe("site");
    expect(link.querySelector(".cm-live-link-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(link.querySelector<HTMLImageElement>(".cm-live-link-favicon")?.src).toBe("https://example.com/favicon.ico");
    link.querySelector<HTMLImageElement>(".cm-live-link-favicon")?.dispatchEvent(new Event("error"));
    expect(link.querySelector(".cm-live-link-icon svg")).not.toBeNull();
    link.click();
    expect(open).not.toHaveBeenCalled();
    expect(safe.dom.querySelector(".cm-live-link-menu")?.textContent).toContain("打开");
    expect(safe.dom.querySelector(".cm-live-link-menu")).not.toBeNull();

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(open).toHaveBeenCalledWith("https://example.com/path", "_blank", "noopener,noreferrer");

    const unsafe = createView("[bad](javascript:alert(1))");
    expect(unsafe.dom.querySelector(".cm-live-link")).toBeNull();
    expect(unsafe.contentDOM.textContent).toContain("javascript:");
  });

  it("keeps a link preview visible while the caret remains at its end", () => {
    const view = createView("[站点](bilibili.com)", "[站点](bilibili.com)".length);
    view.focus();

    expect(view.contentDOM.textContent).toBe("站点");
    expect(view.dom.querySelector(".cm-live-link")?.getAttribute("title")).toBe("https://bilibili.com/");
  });

  it("keeps link source editable until the caret leaves an auto-closed target", () => {
    const source = "[站点](example.c)";
    const closingMark = source.indexOf(")");
    const view = createView(source, closingMark);
    view.focus();

    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBe(closingMark);
    expect(view.dom.querySelector(".cm-live-link")).toBeNull();
    view.dispatch({ changes: { from: closingMark, insert: "o" }, selection: { anchor: closingMark + 1 } });
    expect(view.state.doc.toString()).toBe("[站点](example.co)");
    expect(view.dom.querySelector(".cm-live-link")).toBeNull();

    view.dispatch({ changes: { from: closingMark + 1, insert: "m" }, selection: { anchor: closingMark + 2 } });
    expect(view.state.doc.toString()).toBe("[站点](example.com)");
    expect(view.dom.querySelector(".cm-live-link")).toBeNull();

    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(view.dom.querySelector(".cm-live-link")?.getAttribute("title")).toBe("https://example.com/");
  });

  it("treats the complete external link as one symmetric atomic component", () => {
    const source = "a[站点](https://example.com)b";
    const componentFrom = 1;
    const componentTo = source.indexOf("b");
    const view = createView(source, componentFrom);

    expect(moveAcrossVisibleComponentForward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(componentTo);
    expect(moveAcrossVisibleComponentBackward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(componentFrom);
  });

  it("counts an atomic component as one unit of visible node content", () => {
    const source = "[站点](https://example.com)";
    const view = createView(source, 0);

    expect(atMarkdownVisualStart(view, 0)).toBe(true);
    expect(atMarkdownVisualEnd(view, 0)).toBe(false);
    expect(atMarkdownVisualStart(view, source.length)).toBe(false);
    expect(atMarkdownVisualEnd(view, source.length)).toBe(true);
  });

  it("does not make hidden link syntax atomic in source mode", () => {
    const source = "[站点](https://example.com)";
    const view = createView(source, 1);
    view.focus();
    toggleMarkdownSourceMode(view);

    expect(view.moveByChar(view.state.selection.main, true).head).toBe(2);
  });

  it("skips a complete node link widget as one visible component", () => {
    const source = "[[node:missing]]tail";
    const view = createView(source, 0);
    view.focus();

    expect(view.moveByChar(view.state.selection.main, true).head).toBe(source.indexOf("tail"));
  });

  it("crosses a preview component symmetrically from either outside edge", () => {
    const source = "a[[node:missing]]b";
    const componentFrom = 1;
    const componentTo = source.indexOf("b");
    const view = createView(source, componentFrom);

    expect(moveAcrossVisibleComponentForward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(componentTo);
    expect(moveAcrossVisibleComponentBackward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(componentFrom);
  });

  it("edits an external link through its menu", () => {
    const view = createView("[站点](https://example.com)");
    view.dom.querySelector<HTMLButtonElement>(".cm-live-link")!.click();
    const buttons = Array.from(view.dom.querySelectorAll<HTMLButtonElement>(".cm-live-link-menu-item"));
    buttons.find((button) => button.textContent === "修改")!.click();
    expect(view.dom.querySelector(".cm-live-link-form")).not.toBeNull();
    const inputs = view.dom.querySelectorAll<HTMLInputElement>(".cm-live-link-form input");
    inputs[0].value = "新标题";
    inputs[1].value = "bilibili.com";
    view.dom.querySelector<HTMLFormElement>(".cm-live-link-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe("[新标题](bilibili.com)");
  });

  it("deletes an external link through its menu", () => {
    const view = createView("before [站点](https://example.com) after");
    view.dom.querySelector<HTMLButtonElement>(".cm-live-link")!.click();
    const buttons = Array.from(view.dom.querySelectorAll<HTMLButtonElement>(".cm-live-link-menu-item"));

    buttons.find((button) => button.textContent === "删除")!.click();

    expect(view.state.doc.toString()).toBe("before  after");
    expect(view.state.selection.main.head).toBe("before ".length);
    expect(view.dom.querySelector(".cm-live-link-menu")).toBeNull();
  });

  it("allows an open link menu to overflow a short tree list", () => {
    const view = createView("[站点](https://example.com)", 0, "tree-list");
    const treeList = view.dom.closest<HTMLElement>(".tree-list")!;
    const link = view.dom.querySelector<HTMLButtonElement>(".cm-live-link")!;

    link.click();
    expect(treeList.classList.contains("has-link-menu")).toBe(true);

    link.click();
    expect(treeList.classList.contains("has-link-menu")).toBe(false);
  });

  it("deletes a complete preview component as a unit", () => {
    const source = "[[node:missing]]tail";
    const view = createView(source, "[[node:missing]]".length);

    expect(deleteVisibleBackward(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("tail");
  });

  it("renders node links with the current title and opens an available node", () => {
    const target = Object.values(useNotebookStore.getState().nodes).find((node) => node.kind === "content")!;
    useNotebookStore.getState().editMarkdown(target.id, "Target node");
    const view = createView(`[[node:${target.id}]]`);
    const link = view.dom.querySelector<HTMLButtonElement>(".cm-live-node-link")!;

    expect(link.textContent).toBe("Target node");
    expect(link.querySelector(".cm-live-node-link-icon svg")).not.toBeNull();
    link.click();
    expect(useNotebookStore.getState().activeRootId).toBe(target.id);
  });

  it("renders registered image and file attachments without exposing their Markdown", () => {
    const state = useNotebookStore.getState();
    useNotebookStore.setState({
      attachments: {
        ...state.attachments,
        image: { id: "image", nodeId: "root", name: "preview.png", mime: "image/png", size: 1, sha256: "hash", localPath: "blob:preview", remotePath: "remote", pinned: false, createdAt: 1 },
        file: { id: "file", nodeId: "root", name: "notes.pdf", mime: "application/pdf", size: 1, sha256: "hash", localPath: "blob:file", remotePath: "remote", pinned: false, createdAt: 1 },
      },
    });

    const image = createView("![Preview](attachment://image)");
    expect(image.contentDOM.textContent).toBe("Preview");
    expect(image.dom.querySelector<HTMLImageElement>(".cm-live-image-preview img")?.src).toBe("blob:preview");

    const file = createView("[download](attachment://file)");
    expect(file.contentDOM.textContent).toBe("notes.pdf");
    expect(file.dom.querySelector(".cm-live-attachment")).not.toBeNull();

    const unsafe = createView("![bad](javascript:alert(1))");
    expect(unsafe.dom.querySelector(".cm-live-image-preview")).toBeNull();
    expect(unsafe.contentDOM.textContent).toContain("javascript:");
  });

  it("keeps horizontal-rule source cursor-addressable without an atomic or replacement range", () => {
    const view = createView("---");
    const separator = view.dom.querySelector<HTMLElement>(".cm-live-horizontal-rule")!;
    expect(separator).not.toBeNull();
    expect(markdownAtomsAt(view, 0, "from")).toHaveLength(0);

    view.focus();
    view.dispatch({ selection: { anchor: 1 } });

    expect(view.contentDOM.textContent).toBe("---");
    expect(view.dom.querySelector(".cm-live-horizontal-rule")).toBeNull();
    expect(view.moveByChar(view.state.selection.main, true).head).toBe(2);
  });
});
