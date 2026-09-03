import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { newId, ROOT_ID, type AttachmentRecord } from "../domain/model";
import { useNotebookStore } from "../store/useNotebookStore";
import { markAppPerformance } from "../shared/performanceProbe";
import { planAttachmentInsertion } from "./attachmentInsertion";
import {
  attachmentInsertionRequestExtension,
  beginPendingAttachmentUpload,
  finishPendingAttachmentUpload,
  pendingAttachmentUploadExtension,
  pendingAttachmentUploadRange,
} from "./attachmentUploadState";
import { planMultilinePaste } from "./editorClipboard";
import { EditorCommandMenu, type FileInsertOutcome, type FileInsertStatus } from "./EditorCommandMenu";
import { SelectionMenu, selectionMenuIcons, type SelectionMenuAnchor } from "./SelectionMenu";
import { createEditorKeymap } from "./editorKeymap";
import { crossNodeNavigationKeymap } from "./editorNavigation";
import { editorTheme } from "./editorTheme";
import { runWithEditorNode, type EditorTarget } from "./editorTarget";
import { createMarkdownEditorExtensions } from "./markdown/markdownEditor";
import { atMarkdownVisualEnd, atMarkdownVisualStart } from "./markdown/markdownDecorations";
import { toggleBold, toggleHighlight, toggleInlineCode, toggleItalic, toggleStrikethrough } from "./markdown/markdownCommands";
import { chooseAttachmentPaths, listenNativeFileDrop } from "../platform/nativeAttachments";
import { hasTauriRuntime } from "../platform/runtime";
import { writeClipboardText } from "../platform/clipboard";
import { SupertagChips } from "./SupertagChip";

interface Props {
  nodeId: string;
  value: string;
  variant?: "node" | "root";
}

export function InlineEditor({ nodeId, value, variant = "node" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const syncingValue = useRef(false);
  const failedPaths = useRef<readonly string[]>([]);
  const [nearViewport, setNearViewport] = useState(
    variant === "root" || typeof IntersectionObserver === "undefined",
  );
  const [fileStatus, setFileStatus] = useState<FileInsertStatus>({ kind: "idle", message: "" });
  const [inlineSelectionAnchor, setInlineSelectionAnchor] = useState<SelectionMenuAnchor | null>(null);
  const selectionMenuSync = useRef<(editor: EditorView) => void>(() => undefined);
  const textSelectionDragging = useRef(false);
  const editMarkdown = useNotebookStore((state) => state.editMarkdown);
  const setActiveNode = useNotebookStore((state) => state.setActiveNode);
  const createSibling = useNotebookStore((state) => state.createSibling);
  const splitNode = useNotebookStore((state) => state.splitNode);
  const createChild = useNotebookStore((state) => state.createChild);
  const indent = useNotebookStore((state) => state.indent);
  const outdent = useNotebookStore((state) => state.outdent);
  const mergeWithPrev = useNotebookStore((state) => state.mergeWithPrev);
  const mergeWithNext = useNotebookStore((state) => state.mergeWithNext);
  const remove = useNotebookStore((state) => state.remove);
  const removeSupertag = useNotebookStore((state) => state.removeSupertag);
  const supertagIds = useNotebookStore((state) => state.nodes[nodeId]?.supertagIds);
  const addAttachment = useNotebookStore((state) => state.addAttachment);
  const isActiveNode = useNotebookStore((state) => state.activeNodeId === nodeId);
  const activeNodeCursor = useNotebookStore((state) => state.activeNodeCursor);
  const editorParentId = useNotebookStore((state) => state.nodes[nodeId]?.parentId ?? ROOT_ID);
  const editorTarget: EditorTarget = {
    kind: "node",
    nodeId,
    parentId: editorParentId,
    materialize: () => nodeId,
  };
  const shouldMountEditor = variant === "root" || isActiveNode || nearViewport;
  selectionMenuSync.current = (editor) => {
    const range = editor.state.selection.main;
    const contentArea = host.current?.closest<HTMLElement>(".content-area");
    const commandMenuOpen = host.current?.parentElement?.querySelector(".editor-command-trigger[aria-expanded='true']");
    if (textSelectionDragging.current || !editor.hasFocus || range.empty || editor.composing || commandMenuOpen
      || contentArea?.classList.contains("has-node-selection")) {
      setInlineSelectionAnchor(null);
      return;
    }
    const from = editor.coordsAtPos(range.from, -1);
    const to = editor.coordsAtPos(range.to, 1);
    const fallback = editor.dom.getBoundingClientRect();
    const left = Math.min(from?.left ?? fallback.left, to?.left ?? fallback.left);
    const right = Math.max(from?.right ?? fallback.right, to?.right ?? fallback.right);
    const top = Math.min(from?.top ?? fallback.top, to?.top ?? fallback.top);
    const bottom = Math.max(from?.bottom ?? fallback.bottom, to?.bottom ?? fallback.bottom);
    setInlineSelectionAnchor({ left, right, top, bottom });
  };

  const insertPaths = useCallback(async (
    paths: readonly string[],
    targetEditor = view.current,
  ): Promise<FileInsertOutcome> => {
    if (!targetEditor || !paths.length) return { inserted: 0, failed: 0 };
    const selection = targetEditor.state.selection.main;
    const uploadId = newId("attachment-upload");
    beginPendingAttachmentUpload(targetEditor, uploadId, selection.from, selection.to, paths.length);
    setFileStatus({
      kind: "loading",
      message: paths.length === 1 ? `正在添加文件` : `正在添加 ${paths.length} 个文件`,
    });

    const results = await Promise.allSettled(paths.map((path) => addAttachment(nodeId, { path })));
    const attachments = results
      .filter((result): result is PromiseFulfilledResult<AttachmentRecord> => result.status === "fulfilled")
      .map((result) => result.value);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    failedPaths.current = paths.filter((_path, index) => results[index].status === "rejected");
    if (view.current === targetEditor) {
      const range = pendingAttachmentUploadRange(targetEditor, uploadId);
      const plan = range
        ? planAttachmentInsertion(
          targetEditor.state.doc.toString(),
          range.from,
          range.to,
          attachments,
        )
        : null;
      if (plan) {
        targetEditor.dispatch({
          changes: { from: plan.from, to: plan.to, insert: plan.insert },
          selection: { anchor: plan.anchor },
          effects: finishPendingAttachmentUpload(uploadId),
          scrollIntoView: true,
          userEvent: "input",
        });
      } else {
        targetEditor.dispatch({ effects: finishPendingAttachmentUpload(uploadId) });
      }
      targetEditor.focus();
    }

    if (failures.length) {
      const firstReason = failures[0].reason instanceof Error ? failures[0].reason.message : "文件读取失败";
      setFileStatus({
        kind: "error",
        message: attachments.length
          ? `已插入 ${attachments.length} 个，${failures.length} 个失败：${firstReason}`
          : `插入失败：${firstReason}`,
      });
    } else {
      failedPaths.current = [];
      setFileStatus({ kind: "idle", message: "" });
    }
    return { inserted: attachments.length, failed: failures.length };
  }, [addAttachment, nodeId]);

  const pickFiles = useCallback(async (): Promise<FileInsertOutcome> => {
    try {
      return await insertPaths(await chooseAttachmentPaths());
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法选择文件";
      setFileStatus({ kind: "error", message });
      return { inserted: 0, failed: 1 };
    }
  }, [insertPaths]);

  useEffect(() => {
    const element = host.current;
    if (!element || variant === "root" || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { root: element.closest(".content-area"), rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [variant]);

  useLayoutEffect(() => {
    if (!host.current || !shouldMountEditor) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...createMarkdownEditorExtensions(nodeId, {
          applySupertag: (editor, supertagId) => runWithEditorNode(editorTarget, editor, (targetNodeId) => {
            useNotebookStore.getState().addSupertag(targetNodeId, supertagId);
            return true;
          }),
        }),
        pendingAttachmentUploadExtension,
        attachmentInsertionRequestExtension((paths, targetEditor) => {
          if (view.current === targetEditor) void insertPaths(paths, targetEditor);
        }),
        history(),
        EditorView.lineWrapping,
        keymap.of([
          ...createEditorKeymap({
            enter: (editor) => {
              const doc = editor.state.doc.toString();
              const { from, to } = editor.state.selection.main;
              splitNode(nodeId, doc.slice(0, from), doc.slice(to));
              return true;
            },
            createChild: () => { createChild(nodeId, ""); return true; },
            indent: (editor) => runWithEditorNode(editorTarget, editor, (targetNodeId) => {
              indent(targetNodeId);
              return true;
            }),
            outdent: (editor) => runWithEditorNode(editorTarget, editor, (targetNodeId) => {
              outdent(targetNodeId);
              return true;
            }),
            backspace: (editor) => {
              return runWithEditorNode(editorTarget, editor, (targetNodeId) => {
                const pos = editor.state.selection.main.head;
                const hasSelection = !editor.state.selection.main.empty;
                if (atMarkdownVisualStart(editor, pos) && !hasSelection) { mergeWithPrev(targetNodeId); return true; }
                return false;
              });
            },
            delete: (editor) => {
              return runWithEditorNode(editorTarget, editor, (targetNodeId) => {
                const docLen = editor.state.doc.length;
                const pos = editor.state.selection.main.head;
                const hasSelection = !editor.state.selection.main.empty;
                if ((pos === docLen || atMarkdownVisualEnd(editor, pos)) && !hasSelection) { mergeWithNext(targetNodeId); return true; }
                return false;
              });
            },
            remove: () => { remove(nodeId); return true; },
          }),
          ...crossNodeNavigationKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingValue.current) {
            markAppPerformance("markdown:codemirror-commit");
            editMarkdown(nodeId, update.state.doc.toString());
            markAppPerformance("markdown:store-commit");
          }
          if (update.selectionSet || update.focusChanged || update.docChanged) selectionMenuSync.current(update.view);
        }),
        EditorView.domEventHandlers({
          focus: () => { setActiveNode(nodeId); return false; },
          mousedown: (_event, editor) => {
            textSelectionDragging.current = true;
            setInlineSelectionAnchor(null);
            // Dragging a text selection can leave DOM focus on whatever
            // element previously had it (or nothing at all) if the browser
            // doesn't treat the drag as a focus-worthy interaction. Without
            // focus, keydown for Backspace/Delete never reaches this view,
            // so the selection looks highlighted but nothing is deletable
            // until the user clicks once first. Force focus proactively so
            // drag-selecting alone is enough.
            if (!editor.hasFocus) queueMicrotask(() => editor.focus());
            return false;
          },
          paste: (event, editor) => {
            const files = event.clipboardData?.files ? Array.from(event.clipboardData.files) : [];
            if (files.length) {
              event.preventDefault();
              setFileStatus({ kind: "error", message: "请使用桌面文件拖放或“插入文件”导入附件" });
              return true;
            }
            const text = event.clipboardData?.getData("text/plain") ?? "";
            const selection = editor.state.selection.main;
            const plan = planMultilinePaste(
              editor.state.doc.toString(),
              selection.from,
              selection.to,
              text,
            );
            if (!plan) return false;
            event.preventDefault();
            editor.dispatch({
              changes: {
                from: 0,
                to: editor.state.doc.length,
                insert: plan.currentMarkdown,
              },
            });
            let insertionAnchor = nodeId;
            for (const line of plan.followingMarkdown) {
              const createdId = variant === "root"
                ? createChild(nodeId, line)
                : createSibling(insertionAnchor, line);
              if (createdId) insertionAnchor = createdId;
            }
            return true;
          },
        }),
        editorTheme,
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    selectionMenuSync.current(view.current);
    return () => { view.current?.destroy(); view.current = undefined; };
  }, [nodeId, shouldMountEditor, variant, insertPaths]);

  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    syncingValue.current = true;
    const docLen = editor.state.doc.length;
    let selection: { anchor: number } | undefined = undefined;
    if (isActiveNode && activeNodeCursor !== null) {
      const anchor = activeNodeCursor === "end" ? value.length : Math.min(activeNodeCursor, value.length);
      selection = { anchor };
    }
    editor.dispatch({
      changes: { from: 0, to: docLen, insert: value },
      ...(selection ? { selection } : {}),
    });
    syncingValue.current = false;
  }, [value, isActiveNode, activeNodeCursor]);

  useLayoutEffect(() => {
    const editor = view.current;
    if (!isActiveNode || !editor) return;
    if (!editor.hasFocus) editor.focus();
    if (activeNodeCursor !== null) {
      const docLength = editor.state.doc.length;
      const anchor = activeNodeCursor === "end" ? docLength : Math.min(activeNodeCursor, docLength);
      editor.dispatch({ selection: { anchor } });
    }
  }, [isActiveNode, activeNodeCursor]);

  useEffect(() => {
    if (!hasTauriRuntime() || !shouldMountEditor) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const deviceScale = window.devicePixelRatio || 1;
    void listenNativeFileDrop((event) => {
      if (disposed || event.type !== "drop") return;
      const clientX = event.position.x / deviceScale;
      const clientY = event.position.y / deviceScale;
      const targetRow = rowAtPoint(clientX, clientY);
      if (targetRow?.dataset.nodeId !== nodeId) return;
      const editor = view.current;
      if (!editor || !event.paths.length) return;
      const position = dropPosition(editor, clientX, clientY);
      if (position !== null) editor.dispatch({ selection: { anchor: position } });
      void insertPaths(event.paths, editor);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch((error) => {
      if (disposed) return;
      setFileStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "无法监听桌面文件拖放",
      });
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [insertPaths, nodeId, shouldMountEditor]);

  useEffect(() => {
    const area = host.current?.closest<HTMLElement>(".content-area");
    const shell = host.current?.closest<HTMLElement>(".inline-editor-shell");
    if (!shell) return;
    const hideForCommandMenu = (event: Event) => {
      if ((event.target as Element | null)?.closest(".editor-command-trigger")) setInlineSelectionAnchor(null);
    };
    const finishTextSelection = () => {
      if (!textSelectionDragging.current) return;
      textSelectionDragging.current = false;
      setTimeout(() => {
        if (view.current) selectionMenuSync.current(view.current);
      }, 0);
    };
    const cancelTextSelection = () => {
      textSelectionDragging.current = false;
      setInlineSelectionAnchor(null);
    };
    shell.addEventListener("click", hideForCommandMenu, true);
    document.addEventListener("pointerup", finishTextSelection);
    document.addEventListener("mouseup", finishTextSelection);
    document.addEventListener("pointercancel", cancelTextSelection);
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      if (view.current) selectionMenuSync.current(view.current);
    });
    if (area) observer?.observe(area, { attributes: true, attributeFilter: ["class"] });
    observer?.observe(shell, { attributes: true, subtree: true, attributeFilter: ["class", "aria-expanded"] });
    const refreshPosition = () => {
      if (view.current) selectionMenuSync.current(view.current);
    };
    window.addEventListener("resize", refreshPosition);
    window.addEventListener("scroll", refreshPosition, true);
    return () => {
      observer?.disconnect();
      shell.removeEventListener("click", hideForCommandMenu, true);
      document.removeEventListener("pointerup", finishTextSelection);
      document.removeEventListener("mouseup", finishTextSelection);
      document.removeEventListener("pointercancel", cancelTextSelection);
      window.removeEventListener("resize", refreshPosition);
      window.removeEventListener("scroll", refreshPosition, true);
    };
  }, [shouldMountEditor]);

  return (
    <div
      className={`inline-editor-shell ${variant === "root" ? "root-inline-editor-shell" : ""}`}
    >
      <div
        className={`inline-editor ${variant === "root" ? "root-inline-editor" : ""}`}
        ref={host}
        aria-label={variant === "root" ? "根节点内容" : "节点内容"}
        data-editor-mounted={shouldMountEditor || undefined}
      >
        {!shouldMountEditor && <div className="inline-editor-placeholder">{value || " "}</div>}
      </div>
      <SupertagChips supertagIds={supertagIds} onRemove={(supertagId) => removeSupertag(nodeId, supertagId)} />
      {shouldMountEditor && (
        <EditorCommandMenu
          getEditor={() => view.current}
          onOpenChange={(open) => { if (open) setInlineSelectionAnchor(null); }}
          onPickFiles={pickFiles}
          onRetryFiles={() => insertPaths(failedPaths.current)}
          fileStatus={fileStatus}
        />
      )}
      <SelectionMenu
        anchor={inlineSelectionAnchor}
        ariaLabel="文本选区菜单"
        className="inline-selection-menu"
        actions={inlineSelectionActions(view, setInlineSelectionAnchor)}
      />
    </div>
  );
}

function inlineSelectionActions(
  view: MutableRefObject<EditorView | undefined>,
  setAnchor: (anchor: SelectionMenuAnchor | null) => void,
) {
  const run = (command: (target: EditorView) => boolean) => {
    const editor = view.current;
    if (!editor || editor.state.selection.main.empty) return;
    command(editor);
    editor.focus();
    setAnchor(null);
    queueMicrotask(() => {
      if (view.current) {
        const range = view.current.state.selection.main;
        if (!range.empty) setAnchor(selectionAnchorForEditor(view.current));
      }
    });
  };
  const copy = async () => {
    const editor = view.current;
    if (!editor) return false;
    const range = editor.state.selection.main;
    if (range.empty) return false;
    const copied = await writeClipboardText(editor.state.sliceDoc(range.from, range.to));
    editor.focus();
    return copied;
  };
  const cut = async () => {
    const editor = view.current;
    if (!editor) return false;
    const range = editor.state.selection.main;
    if (range.empty) return false;
    if (!await writeClipboardText(editor.state.sliceDoc(range.from, range.to))) return false;
    editor.dispatch({ changes: { from: range.from, to: range.to, insert: "" }, selection: { anchor: range.from }, userEvent: "delete" });
    editor.focus();
    setAnchor(null);
    return true;
  };
  return [
    { id: "bold", label: "粗体", icon: selectionMenuIcons.bold, onSelect: () => run(toggleBold) },
    { id: "italic", label: "斜体", icon: selectionMenuIcons.italic, onSelect: () => run(toggleItalic) },
    { id: "strikethrough", label: "删除线", icon: selectionMenuIcons.strikethrough, onSelect: () => run(toggleStrikethrough) },
    { id: "highlight", label: "高亮", icon: selectionMenuIcons.highlight, onSelect: () => run(toggleHighlight) },
    { id: "code", label: "行内代码", icon: selectionMenuIcons.code, onSelect: () => run(toggleInlineCode) },
    { id: "copy", label: "复制文本", icon: selectionMenuIcons.copy, onSelect: copy, feedback: "已复制", failureFeedback: "复制失败" },
    { id: "cut", label: "剪切文本", icon: selectionMenuIcons.cut, onSelect: cut, failureFeedback: "剪切失败" },
  ] as const;
}

function selectionAnchorForEditor(editor: EditorView): SelectionMenuAnchor | null {
  const range = editor.state.selection.main;
  if (range.empty) return null;
  const from = editor.coordsAtPos(range.from, -1);
  const to = editor.coordsAtPos(range.to, 1);
  const fallback = editor.dom.getBoundingClientRect();
  return {
    left: Math.min(from?.left ?? fallback.left, to?.left ?? fallback.left),
    right: Math.max(from?.right ?? fallback.right, to?.right ?? fallback.right),
    top: Math.min(from?.top ?? fallback.top, to?.top ?? fallback.top),
    bottom: Math.max(from?.bottom ?? fallback.bottom, to?.bottom ?? fallback.bottom),
  };
}

function dropPosition(editor: EditorView, clientX: number, clientY: number): number | null {
  try {
    return editor.posAtCoords({ x: clientX, y: clientY });
  } catch {
    return null;
  }
}

function rowAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const target = typeof document.elementFromPoint === "function"
    ? document.elementFromPoint(clientX, clientY)
    : null;
  return target?.closest<HTMLElement>("[data-tree-row='true'], .root-node-heading") ?? null;
}
