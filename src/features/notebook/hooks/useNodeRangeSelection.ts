import { useCallback, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { EditorView } from "@codemirror/view";
import { expandSelectionToSubtrees, keysInRange, type NodeRangeSelection, type VisibleSelectionEntry } from "../../../domain/nodeSelection";
import { useNotebookStore } from "../../../store/useNotebookStore";

const GHOST_PREFIX = "ghost:";

interface DragState {
  anchorKey: string;
  pointerId: number;
  nodeMode: boolean;
}

export function useNodeRangeSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<NodeRangeSelection | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const removeNodes = useNotebookStore((state) => state.removeNodes);
  const nodes = useNotebookStore((state) => state.nodes);

  const entries = selectionEntries(containerRef.current);
  const order = entries.map((entry) => entry.key);
  const entrySignature = entries.map((entry) => entry.key + ":" + entry.depth).join("\u0000");
  const explicitKeys = useMemo(
    () => selection ? keysInRange(order, selection) : [],
    [entrySignature, selection],
  );
  const expandedSelection = useMemo(
    () => expandSelectionToSubtrees(entries, explicitKeys),
    [entrySignature, explicitKeys],
  );
  const selectedKeys = useMemo(() => new Set(expandedSelection.keys), [expandedSelection.keys]);
  const selectionRootKeys = useMemo(() => new Set(expandedSelection.rootKeys), [expandedSelection.rootKeys]);

  const clear = useCallback((focusKey?: string) => {
    setSelection(null);
    if (focusKey) focusSelectionKey(containerRef.current, focusKey);
  }, [containerRef]);

  const onPointerDownCapture = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (isInteractiveControl(event.target)) {
      drag.current = null;
      setSelection(null);
      return;
    }
    const key = selectionKeyFromTarget(event.target);
    setSelection(null);
    drag.current = null;
    if (!key) return;
    drag.current = { anchorKey: key, pointerId: event.pointerId, nodeMode: false };
  }, []);

  const onPointerMoveCapture = useCallback((event: PointerEvent<HTMLElement>) => {
    const currentDrag = drag.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    const hit = document.elementFromPoint?.(event.clientX, event.clientY) ?? event.target;
    const headKey = selectionKeyFromTarget(hit);
    if (!headKey) return;

    if (!currentDrag.nodeMode && headKey === currentDrag.anchorKey) return;
    if (!currentDrag.nodeMode) {
      currentDrag.nodeMode = true;
      collapseEditorSelections(containerRef.current);
      window.getSelection()?.removeAllRanges();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    setSelection({ anchorKey: currentDrag.anchorKey, headKey });
  }, [containerRef]);

  const finishPointerSelection = useCallback((event: PointerEvent<HTMLElement>) => {
    const currentDrag = drag.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (currentDrag.nodeMode) {
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }, []);

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onKeyDownCapture = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const currentOrder = rowOrder(containerRef.current);
    if (selection) {
      if (event.key === "Escape") {
        event.preventDefault();
        clear(selection.headKey);
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        const keys = expandedKeysInSelection(containerRef.current, selection);
        const fallback = deletionFallback(currentOrder, keys);
        removeNodes(keys, fallback);
        setSelection(null);
        if (fallback) requestAnimationFrame(() => focusSelectionKey(containerRef.current, fallback));
        return;
      }
      if (event.shiftKey && isArrowKey(event.key)) {
        const delta = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
        const headIndex = currentOrder.indexOf(selection.headKey);
        const nextKey = currentOrder[headIndex + delta];
        if (nextKey) {
          event.preventDefault();
          event.stopPropagation();
          setSelection({ ...selection, headKey: nextKey });
        }
        return;
      }
      if (event.key.length === 1 || event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (!selection && event.shiftKey && isArrowKey(event.key)) {
      const row = closestSelectionRow(event.target);
      const editor = editorFromTarget(event.target);
      if (!row || !editor || !movesPastEditorBoundary(editor, event.key)) return;
      const currentKey = row.dataset.selectionKey;
      const currentIndex = currentKey ? currentOrder.indexOf(currentKey) : -1;
      const delta = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
      const nextKey = currentOrder[currentIndex + delta];
      if (!currentKey || !nextKey) return;
      event.preventDefault();
      event.stopPropagation();
      setSelection({ anchorKey: currentKey, headKey: nextKey });
    }
  }, [clear, containerRef, removeNodes, selection]);

  const selectedText = useCallback(() => {
    if (!selection) return "";
    const keys = expandedKeysInSelection(containerRef.current, selection);
    const rows = keys
      .map((key) => containerRef.current?.querySelector<HTMLElement>(`[data-selection-key="${CSS.escape(key)}"]`))
      .filter((row): row is HTMLElement => Boolean(row));
    const depths = rows.map((row) => Number(row.dataset.depth ?? 0));
    const baseDepth = depths.length ? Math.min(...depths) : 0;
    return rows.map((row, index) => {
      const key = row.dataset.selectionKey ?? "";
      const node = nodes[key];
      const text = key.startsWith(GHOST_PREFIX) ? "" : (node?.kind === "date" ? node.dateKey : node?.markdown) ?? "";
      const depth = Math.max(0, depths[index] - baseDepth);
      return `${"  ".repeat(depth)}${text}`;
    }).join("\n");
  }, [containerRef, nodes, selection]);

  const onCopy = useCallback((event: ClipboardEvent<HTMLElement>) => {
    if (!selection) return;
    event.preventDefault();
    event.stopPropagation();
    event.clipboardData.setData("text/plain", selectedText());
  }, [selectedText, selection]);

  const onCut = useCallback((event: ClipboardEvent<HTMLElement>) => {
    if (!selection) return;
    event.preventDefault();
    event.stopPropagation();
    event.clipboardData.setData("text/plain", selectedText());
    const currentOrder = rowOrder(containerRef.current);
    const keys = expandedKeysInSelection(containerRef.current, selection);
    const fallback = deletionFallback(currentOrder, keys);
    removeNodes(keys, fallback);
    setSelection(null);
    if (fallback) requestAnimationFrame(() => focusSelectionKey(containerRef.current, fallback));
  }, [containerRef, removeNodes, selectedText, selection]);

  const onBeforeInputCapture = useCallback((event: FormEvent<HTMLElement>) => {
    if (!selection) return;
    event.preventDefault();
    event.stopPropagation();
  }, [selection]);

  return {
    selectedKeys,
    selectionRootKeys,
    clearSelection: clear,
    handlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture: finishPointerSelection,
      onPointerCancelCapture: finishPointerSelection,
      onClickCapture,
      onKeyDownCapture,
      onCopyCapture: onCopy,
      onCutCapture: onCut,
      onBeforeInputCapture,
    },
  };
}

function selectionEntries(container: HTMLElement | null): VisibleSelectionEntry[] {
  return container
    ? Array.from(container.querySelectorAll<HTMLElement>("[data-selection-key]"))
        .flatMap((row) => {
          const key = row.dataset.selectionKey;
          return key ? [{ key, depth: Number(row.dataset.depth ?? 0) }] : [];
        })
    : [];
}

function rowOrder(container: HTMLElement | null): string[] {
  return selectionEntries(container).map((entry) => entry.key);
}

function expandedKeysInSelection(
  container: HTMLElement | null,
  selection: NodeRangeSelection,
): string[] {
  const entries = selectionEntries(container);
  const explicitKeys = keysInRange(entries.map((entry) => entry.key), selection);
  return expandSelectionToSubtrees(entries, explicitKeys).keys;
}

function closestSelectionRow(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-selection-key]") : null;
}

function selectionKeyFromTarget(target: EventTarget | null): string | null {
  return closestSelectionRow(target)?.dataset.selectionKey ?? null;
}

function isInteractiveControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, input, label, a"));
}

function editorFromTarget(target: EventTarget | null): EditorView | null {
  if (!(target instanceof Element)) return null;
  const host = target.closest<HTMLElement>(".inline-editor");
  return host ? EditorView.findFromDOM(host) : null;
}

function collapseEditorSelections(container: HTMLElement | null): void {
  if (!container) return;
  for (const host of container.querySelectorAll<HTMLElement>(".inline-editor")) {
    const editor = EditorView.findFromDOM(host);
    if (editor && !editor.state.selection.main.empty) {
      editor.dispatch({ selection: { anchor: editor.state.selection.main.head } });
    }
  }
}

function isArrowKey(key: string): boolean {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

function movesPastEditorBoundary(editor: EditorView, key: string): boolean {
  const selection = editor.state.selection.main;
  if (key === "ArrowLeft") return selection.head === 0;
  if (key === "ArrowRight") return selection.head === editor.state.doc.length;
  const forward = key === "ArrowDown";
  const visualBoundary = editor.moveToLineBoundary(selection, forward, true);
  return visualBoundary.head === (forward ? editor.state.doc.length : 0);
}

function deletionFallback(order: readonly string[], selected: readonly string[]): string | null {
  if (!selected.length) return null;
  const selectedSet = new Set(selected);
  const lastIndex = order.indexOf(selected[selected.length - 1]);
  for (let index = lastIndex + 1; index < order.length; index += 1) {
    if (!selectedSet.has(order[index])) return order[index];
  }
  const firstIndex = order.indexOf(selected[0]);
  for (let index = firstIndex - 1; index >= 0; index -= 1) {
    if (!selectedSet.has(order[index])) return order[index];
  }
  return null;
}

function focusSelectionKey(container: HTMLElement | null, key: string): void {
  const row = container?.querySelector<HTMLElement>(`[data-selection-key="${CSS.escape(key)}"]`);
  const host = row?.querySelector<HTMLElement>(".inline-editor");
  const editor = host ? EditorView.findFromDOM(host) : null;
  if (editor) {
    editor.focus();
    return;
  }
  row?.querySelector<HTMLElement>("button, [tabindex]")?.focus();
}
