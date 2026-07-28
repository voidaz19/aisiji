import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { useNotebookStore } from "../store/useNotebookStore";
import { planMultilinePaste } from "./editorClipboard";
import { createEditorKeymap } from "./editorKeymap";
import { crossNodeNavigationKeymap } from "./editorNavigation";
import { editorTheme, livePreview } from "./editorTheme";

interface Props {
  nodeId: string;
  value: string;
  variant?: "node" | "root";
}

export function InlineEditor({ nodeId, value, variant = "node" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const syncingValue = useRef(false);
  const [nearViewport, setNearViewport] = useState(
    variant === "root" || typeof IntersectionObserver === "undefined",
  );
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
  const isActiveNode = useNotebookStore((state) => state.activeNodeId === nodeId);
  const activeNodeCursor = useNotebookStore((state) => state.activeNodeCursor);
  const shouldMountEditor = variant === "root" || isActiveNode || nearViewport;

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
        markdown(),
        history(),
        livePreview,
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
            indent: () => { indent(nodeId); return true; },
            outdent: () => { outdent(nodeId); return true; },
            backspace: (editor) => {
              const pos = editor.state.selection.main.head;
              const hasSelection = !editor.state.selection.main.empty;
              if (pos === 0 && !hasSelection) { mergeWithPrev(nodeId); return true; }
              return false;
            },
            delete: (editor) => {
              const docLen = editor.state.doc.length;
              const pos = editor.state.selection.main.head;
              const hasSelection = !editor.state.selection.main.empty;
              if (pos === docLen && !hasSelection) { mergeWithNext(nodeId); return true; }
              return false;
            },
            remove: () => { remove(nodeId); return true; },
          }),
          ...crossNodeNavigationKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingValue.current) editMarkdown(nodeId, update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          focus: () => { setActiveNode(nodeId); return false; },
          mousedown: (_event, editor) => {
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
    return () => { view.current?.destroy(); view.current = undefined; };
  }, [nodeId, shouldMountEditor, variant]);

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

  return (
    <div
      className={`inline-editor ${variant === "root" ? "root-inline-editor" : ""}`}
      ref={host}
      aria-label={variant === "root" ? "根节点内容" : "节点内容"}
      data-editor-mounted={shouldMountEditor || undefined}
    >
      {!shouldMountEditor && <div className="inline-editor-placeholder">{value || " "}</div>}
    </div>
  );
}
