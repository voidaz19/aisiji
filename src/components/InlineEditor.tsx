import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { useNotebookStore } from "../store/useNotebookStore";
import { editorTheme, livePreview } from "./editorTheme";

interface Props { nodeId: string; value: string; }

export function InlineEditor({ nodeId, value }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const syncingValue = useRef(false);
  const editMarkdown = useNotebookStore((state) => state.editMarkdown);
  const setActiveNode = useNotebookStore((state) => state.setActiveNode);
  const createSibling = useNotebookStore((state) => state.createSibling);
  const splitNode = useNotebookStore((state) => state.splitNode);
  const createChild = useNotebookStore((state) => state.createChild);
  const indent = useNotebookStore((state) => state.indent);
  const outdent = useNotebookStore((state) => state.outdent);
  const mergeWithPrev = useNotebookStore((state) => state.mergeWithPrev);
  const isActiveNode = useNotebookStore((state) => state.activeNodeId === nodeId);
  const activeNodeCursor = useNotebookStore((state) => state.activeNodeCursor);

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        livePreview,
        keymap.of([
          {
            key: "Enter",
            run: (editor) => {
              const doc = editor.state.doc.toString();
              const pos = editor.state.selection.main.head;
              const before = doc.slice(0, pos);
              const after = doc.slice(pos);
              // Splitting keeps text before the cursor on this node and moves
              // text after the cursor into a new sibling, matching how outliners
              // like Workflowy/Roam treat Enter as a content split rather than
              // always inserting a blank line below.
              splitNode(nodeId, before, after);
              return true;
            },
          },
          {
            key: "Mod-Enter",
            run: () => { createChild(nodeId, ""); return true; },
          },
          {
            key: "Tab",
            run: () => { indent(nodeId); return true; },
          },
          {
            key: "Shift-Tab",
            run: () => { outdent(nodeId); return true; },
          },
          {
            key: "Backspace",
            run: (editor) => {
              const pos = editor.state.selection.main.head;
              const hasSelection = !editor.state.selection.main.empty;
              // Only intercept Backspace at the very start of the node (no
              // selection) so a normal in-text delete still behaves normally.
              if (pos === 0 && !hasSelection) { mergeWithPrev(nodeId); return true; }
              return false;
            },
          },
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
            if (!text.includes("\n")) return false;
            event.preventDefault();
            const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
            if (lines.length) {
              editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: lines[0] } });
              for (const line of lines.slice(1)) createSibling(nodeId, line.trim());
            }
            return true;
          },
        }),
        editorTheme,
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => { view.current?.destroy(); view.current = undefined; };
  }, [nodeId]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    syncingValue.current = true;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    syncingValue.current = false;
  }, [value]);

  useEffect(() => {
    // Creating a sibling/child (e.g. pressing Enter) marks the new node as
    // active in the store, but nothing moves DOM focus there on its own --
    // CodeMirror has no idea a brand new sibling view just mounted. Without
    // this, the caret stays on the node you pressed Enter from instead of
    // jumping to the new empty line, which is the whole point of Enter in
    // an outliner. `activeNodeCursor` also lets merge/split operations land
    // the caret at the exact join/split point instead of always resetting
    // to the start of the node.
    const editor = view.current;
    if (!isActiveNode || !editor || editor.hasFocus) return;
    editor.focus();
    const docLength = editor.state.doc.length;
    const anchor = activeNodeCursor === "end" || activeNodeCursor === null
      ? docLength
      : Math.min(activeNodeCursor, docLength);
    editor.dispatch({ selection: { anchor } });
  }, [isActiveNode, activeNodeCursor]);

  return <div className="inline-editor" ref={host} aria-label="节点内容" />;
}
