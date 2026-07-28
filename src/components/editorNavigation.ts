import { EditorView, type KeyBinding } from "@codemirror/view";
import { useNotebookStore } from "../store/useNotebookStore";
import { atMarkdownVisualEnd, atMarkdownVisualStart } from "./markdown/markdownDecorations";

type NavigationDirection = "left" | "right" | "up" | "down";

export const crossNodeNavigationKeymap: readonly KeyBinding[] = [
  { key: "ArrowLeft", run: (view) => moveAcrossNodeBoundary(view, "left") },
  { key: "ArrowRight", run: (view) => moveAcrossNodeBoundary(view, "right") },
  { key: "ArrowUp", run: (view) => moveAcrossNodeBoundary(view, "up") },
  { key: "ArrowDown", run: (view) => moveAcrossNodeBoundary(view, "down") },
];

function moveAcrossNodeBoundary(view: EditorView, direction: NavigationDirection): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const forward = direction === "right" || direction === "down";
  if (direction === "left" && !atMarkdownVisualStart(view, selection.head)) return false;
  if (direction === "right" && !atMarkdownVisualEnd(view, selection.head)) return false;

  if (direction === "up" || direction === "down") {
    const visualLineBoundary = view.moveToLineBoundary(selection, forward, true);
    const documentBoundary = forward ? view.state.doc.length : 0;
    if (visualLineBoundary.head !== documentBoundary) return false;
  }

  const adjacent = adjacentEditor(view, forward);
  if (!adjacent) return focusVirtualAdjacent(view, direction, forward);

  const anchor = direction === "left"
    ? adjacent.state.doc.length
    : direction === "right"
      ? 0
      : verticalAnchor(view, adjacent, forward);
  adjacent.dispatch({ selection: { anchor }, scrollIntoView: true });
  adjacent.focus();
  return true;
}

function focusVirtualAdjacent(view: EditorView, direction: NavigationDirection, forward: boolean): boolean {
  const row = view.dom.closest<HTMLElement>("[data-tree-row='true']");
  const key = forward ? row?.dataset.navigationNextKey : row?.dataset.navigationPreviousKey;
  if (!key) return false;
  const store = useNotebookStore.getState();
  if (key.startsWith("ghost:")) {
    store.focusGhost(key.slice(6));
    return true;
  }
  const target = store.nodes[key];
  if (!target || target.deletedAt || target.kind !== "content") return false;
  const sourceHead = view.state.selection.main.head;
  const sourceLine = view.state.doc.lineAt(sourceHead);
  const cursor = direction === "left"
    ? "end"
    : direction === "right"
      ? 0
      : Math.min(sourceHead - sourceLine.from, target.markdown.length);
  store.focusNode(key, cursor);
  return true;
}

function adjacentEditor(view: EditorView, forward: boolean): EditorView | null {
  const host = view.dom.closest<HTMLElement>(".inline-editor");
  if (!host) return null;
  const scope = host.closest<HTMLElement>(".content-area") ?? host.ownerDocument;
  const hosts = Array.from(scope.querySelectorAll<HTMLElement>(".inline-editor"));
  const currentIndex = hosts.indexOf(host);
  if (currentIndex < 0) return null;

  for (
    let index = currentIndex + (forward ? 1 : -1);
    index >= 0 && index < hosts.length;
    index += forward ? 1 : -1
  ) {
    const adjacent = EditorView.findFromDOM(hosts[index]);
    if (adjacent) return adjacent;
  }
  return null;
}

function verticalAnchor(source: EditorView, target: EditorView, forward: boolean): number {
  const sourceHead = source.state.selection.main.head;
  const targetEdge = forward ? 0 : target.state.doc.length;
  const sourceCoords = source.coordsAtPos(sourceHead);
  const targetCoords = target.coordsAtPos(targetEdge);
  if (sourceCoords && targetCoords) {
    const position = target.posAtCoords({
      x: sourceCoords.left,
      y: (targetCoords.top + targetCoords.bottom) / 2,
    });
    if (position !== null) return position;
  }

  const sourceLine = source.state.doc.lineAt(sourceHead);
  const targetLine = forward
    ? target.state.doc.line(1)
    : target.state.doc.line(target.state.doc.lines);
  const column = sourceHead - sourceLine.from;
  return targetLine.from + Math.min(column, targetLine.length);
}
