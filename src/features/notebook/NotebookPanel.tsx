import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EditorView } from "@codemirror/view";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Grid2X2, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { flushSync } from "react-dom";
import { TreeBlockRow } from "../../components/TreeRow";
import { treeBlockAtPoint } from "../../components/treeHitTesting";
import { treeBlockSubtreeKeys } from "../../components/treeBlock";
import { InlineEditor } from "../../components/InlineEditor";
import { SelectionMenu, selectionMenuIcons, type SelectionMenuAnchor } from "../../components/SelectionMenu";
import { createTreeDropSlots, type TreeDropSlot, type VisibleDropPlaceholder, type VisibleTreeNode } from "../../domain/dropSlots";
import { canDropOnEmptyNode, type EmptyNodeTarget } from "../../domain/emptyDrop";
import { ROOT_ID, type NodeRecord } from "../../domain/model";
import { CANVAS_SUPERTAG_ID, hasSupertag } from "../../domain/supertags";
import { dateLabel } from "../../shared/date";
import { TREE_COLLAPSE_WIDTH, TREE_LEVEL_INDENT, TREE_ROW_LEFT_PADDING, TREE_SUBTREE_GAP } from "../../shared/treeLayout";
import { markAppPerformance } from "../../shared/performanceProbe";
import type { WorkspaceView } from "../../shared/workspaceView";
import { useNotebookStore } from "../../store/useNotebookStore";
import { CanvasCardGrid } from "../canvas/CanvasCardGrid";
import { useHierarchyGuides } from "./hooks/useHierarchyGuides";
import { useTreeLayoutAnimation } from "./hooks/useTreeLayoutAnimation";
import { useNodeRangeSelection } from "./hooks/useNodeRangeSelection";
import { DEFAULT_LAYOUT_DEBUG_VISIBILITY, LayoutDebugPanel, type LayoutDebugVisibility } from "./LayoutDebugPanel";
import { captureDragPreviewLayout, type DragPreviewLayout } from "./dragPreviewLayout";
import { visibleDragPreview } from "./model/dragPreview";
import { closestDropSlot, layoutDropSlots, noMoveZone, type DropRect, type DropSlotLayout } from "./model/dropIndicator";
import { measuredTreeBlocks, visibleLayoutGap, visibleSubtreeExitCount } from "./model/subtreeLayout";
import { treeLayoutRows } from "./model/treeLayoutRows";
import { TREE_LAYOUT_ANIMATION_DURATION, TREE_LAYOUT_ANIMATION_EASING } from "./model/treeLayoutMotion";

interface Props {
  view: WorkspaceView;
  activeRoot: NodeRecord | null;
  rootId: string;
  visibleNodes: NodeRecord[];
  layoutDebug?: boolean;
  layoutDebugVisibility?: LayoutDebugVisibility;
  onLayoutDebugVisibilityChange?: (next: LayoutDebugVisibility) => void;
  isVisible?: boolean;
}

type MeasuredSubtreeBox = { rootId: string; depth: number; top: number; height: number; rootHeight: number };
type MeasuredNodeBox = { key: string; depth: number; top: number; height: number };
type MeasuredDropLayout = { slots: DropSlotLayout[]; sourceZone: DropRect | null; emptyZones: EmptyDropHitZone[] };
type EmptyDropHit = { blockKey: string; target: EmptyNodeTarget };
type EmptyDropHitZone = EmptyDropHit & DropRect;
type DragPointer = { clientX: number; clientY: number };
type DropDebugLayout = {
  slots: DropSlotLayout[];
  emptyZones: EmptyDropHitZone[];
  noMove: DropRect | null;
  pointerY: number;
};

const VIRTUALIZATION_THRESHOLD = 80;

export function NotebookPanel({
  view,
  activeRoot,
  rootId,
  visibleNodes,
  layoutDebug = false,
  layoutDebugVisibility: controlledLayoutDebugVisibility,
  onLayoutDebugVisibilityChange,
  isVisible = true,
}: Props) {
  markAppPerformance("notebook:render");
  const nodes = useNotebookStore((state) => state.nodes);
  const fields = useNotebookStore((state) => state.fields);
  const addSupertag = useNotebookStore((state) => state.addSupertag);
  const collapsed = useNotebookStore((state) => state.collapsed);
  const ghostSuppressed = useNotebookStore((state) => state.ghostSuppressed);
  const activeNodeId = useNotebookStore((state) => state.activeNodeId);
  const query = useNotebookStore((state) => state.query);
  const setQuery = useNotebookStore((state) => state.setQuery);
  const toggleChildren = useNotebookStore((state) => state.toggleChildren);
  const moveToSlot = useNotebookStore((state) => state.moveToSlot);
  const moveToEmptyNode = useNotebookStore((state) => state.moveToEmptyNode);
  const enterNode = useNotebookStore((state) => state.enterNode);
  const focusNode = useNotebookStore((state) => state.focusNode);
  const focusGhost = useNotebookStore((state) => state.focusGhost);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPreviewLayout, setDragPreviewLayout] = useState<DragPreviewLayout | null>(null);
  const [dragPlaceholderOpacity, setDragPlaceholderOpacity] = useState(0);
  const [dropIndicator, setDropIndicator] = useState<DropSlotLayout | null>(null);
  const [dropDebugLayout, setDropDebugLayout] = useState<DropDebugLayout | null>(null);
  const [emptyDropTargetKey, setEmptyDropTargetKey] = useState<string | null>(null);
  const [subtreeBoxes, setSubtreeBoxes] = useState<MeasuredSubtreeBox[]>([]);
  const [nodeBoxes, setNodeBoxes] = useState<MeasuredNodeBox[]>([]);
  const [selectionBoxes, setSelectionBoxes] = useState<MeasuredSubtreeBox[]>([]);
  const [nodeSelectionAnchor, setNodeSelectionAnchor] = useState<SelectionMenuAnchor | null>(null);
  const [localLayoutDebugVisibility, setLocalLayoutDebugVisibility] = useState(DEFAULT_LAYOUT_DEBUG_VISIBILITY);
  const layoutDebugVisibility = controlledLayoutDebugVisibility ?? localLayoutDebugVisibility;
  const setLayoutDebugVisibility = onLayoutDebugVisibilityChange ?? setLocalLayoutDebugVisibility;
  const dropSlotRef = useRef<TreeDropSlot | null>(null);
  const activeDragIdRef = useRef<string | null>(null);
  const dragOriginPointerRef = useRef<DragPointer | null>(null);
  const dragPointerRef = useRef<DragPointer | null>(null);
  const updateDropTargetRef = useRef<(pointer: DragPointer) => void>(() => undefined);
  const dragLayoutRef = useRef<MeasuredDropLayout | null>(null);
  const dragUpdateFrameRef = useRef<number | null>(null);
  const emptyDropTargetRef = useRef<EmptyDropHit | null>(null);
  const draggingRef = useRef(false);
  const treeListRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const renderedRows = useMemo(() => {
    markAppPerformance("notebook:topology-compute");
    return treeLayoutRows(
      visibleNodes,
      { nodes, collapsed },
      ghostSuppressed,
      view === "today" || view === "outline" ? rootId : null,
      view === "today" || view === "outline",
    );
  }, [collapsed, ghostSuppressed, nodes, rootId, view, visibleNodes]);
  useLayoutEffect(() => { markAppPerformance("notebook:commit"); });
  const logicalSelectionEntries = useMemo(
    () => renderedRows.map((row) => ({ key: row.key, depth: row.depth })),
    [renderedRows],
  );
  const nodeSelection = useNodeRangeSelection(contentAreaRef, logicalSelectionEntries);
  // Keep the virtualizer active while dragging. Unmounted rows use the
  // virtualizer's logical measurements for drop-slot geometry, so drag start
  // never turns a 10k-node tree into 10k DOM rows.
  const virtualized = renderedRows.length >= VIRTUALIZATION_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: renderedRows.length,
    getScrollElement: () => contentAreaRef.current,
    initialRect: { width: 860, height: 800 },
    estimateSize: () => 31,
    measureElement: (element) => {
      const rect = element.getBoundingClientRect();
      const marginBottom = Number.parseFloat(getComputedStyle(element).marginBottom) || 0;
      return rect.height + marginBottom;
    },
    getItemKey: (index) => renderedRows[index]?.key ?? index,
    overscan: 12,
    enabled: virtualized,
  });
  const measuredVirtualItems = virtualized ? rowVirtualizer.getVirtualItems() : [];
  const virtualItems = virtualized && measuredVirtualItems.length === 0
    ? renderedRows.slice(0, 40).map((_, index) => ({ index, start: index * 31 }))
    : measuredVirtualItems;
  const rowsToRender = virtualized
    ? virtualItems.map((item) => ({ row: renderedRows[item.index], index: item.index, item }))
    : renderedRows.map((row, index) => ({ row, index, item: null }));

  const focusCanvasGhost = (parentId: string) => {
    focusGhost(parentId);
    queueMicrotask(() => {
      const host = Array.from(contentAreaRef.current?.querySelectorAll<HTMLElement>(".ghost-editor") ?? [])
        .find((candidate) => candidate.closest<HTMLElement>("[data-parent-id]")?.dataset.parentId === parentId);
      const editor = host ? EditorView.findFromDOM(host) : null;
      if (editor && !editor.hasFocus) editor.focus();
    });
  };

  const resolveCanvasTarget = (clientX: number, clientY: number) => {
    const rootHeading = contentAreaRef.current?.querySelector<HTMLElement>(".root-node-heading[data-node-id]");
    const rootHeadingRect = rootHeading?.getBoundingClientRect();
    if (activeRoot?.kind === "content" && rootHeading && rootHeadingRect
      && clientY >= rootHeadingRect.top && clientY <= rootHeadingRect.bottom) {
      focusNode(activeRoot.id, canvasCursorAtPoint(rootHeading, clientX, clientY));
      return;
    }
    let rowElement = treeBlockAtPoint(treeListRef.current, clientX, clientY, true, true);
    let blockKey = rowElement?.dataset.treeBlockKey;
    let block = blockKey ? renderedRows.find((candidate) => candidate.key === blockKey) : undefined;
    const firstRow = treeListRef.current?.querySelector<HTMLElement>("[data-tree-block-key]");
    const firstRowRect = firstRow?.getBoundingClientRect();
    if (!block && firstRow && firstRowRect && clientY < firstRowRect.top) {
      const rootDistance = rootHeadingRect ? verticalDistance(clientY, rootHeadingRect) : Number.POSITIVE_INFINITY;
      const firstRowDistance = verticalDistance(clientY, firstRowRect);
      if (activeRoot?.kind === "content" && rootHeading && rootDistance <= firstRowDistance) {
        focusNode(activeRoot.id, canvasCursorAtPoint(rootHeading, clientX, clientY));
        return;
      }
      rowElement = firstRow;
      blockKey = firstRow.dataset.treeBlockKey;
      block = blockKey ? renderedRows.find((candidate) => candidate.key === blockKey) : undefined;
    }
    if (block?.kind === "placeholder") {
      focusCanvasGhost(block.parentId);
    } else if (block?.node.kind === "date") {
      enterNode(block.node.id);
    } else if (block && rowElement) {
      focusNode(block.node.id, canvasCursorAtPoint(rowElement, clientX, clientY));
    } else {
      // The page-level ghost is the continuous canvas landing point after the last row.
      focusCanvasGhost(rootId);
    }
  };

  const onContentAreaPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (view !== "today" && view !== "outline") return;
    if (event.button !== 0) return;
    if (draggingRef.current) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, label, a, [contenteditable='true'], .inline-editor, .hierarchy-line-hit")) return;
    // Blank canvas clicks are custom focus transfers. Prevent the browser from
    // blurring the current editor to the page before the target is resolved.
    event.preventDefault();
    resolveCanvasTarget(event.clientX, event.clientY);
  };

  useEffect(() => {
    if (!virtualized || !activeNodeId) return;
    const index = renderedRows.findIndex((row) => row.key === activeNodeId);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "auto" });
  }, [activeNodeId, renderedRows, rowVirtualizer, virtualized]);
  const layoutSignature = useMemo(
    () => renderedRows.map((row) => `${row.kind}:${row.key}:${row.depth}:${row.kind === "node" && row.hasChildren ? 1 : 0}`).join("\u0000"),
    [renderedRows],
  );
  const treeLayoutMotion = useTreeLayoutAnimation(treeListRef, [isVisible, layoutSignature, rootId]);
  const guideLines = useHierarchyGuides(
    treeListRef,
    isVisible && (view === "today" || view === "outline"),
    rootId,
    [activeNodeId, isVisible, layoutSignature, rootId],
    treeLayoutMotion,
  );
  const selectionRootSignature = [...nodeSelection.selectionRootKeys].join("\u0000");
  useLayoutEffect(() => {
    const container = treeListRef.current;
    if (!container || !isVisible) {
      setSubtreeBoxes([]);
      setNodeBoxes([]);
      setSelectionBoxes([]);
      return;
    }
    const measure = () => {
      const subtreeEdge = Number.parseFloat(getComputedStyle(container).getPropertyValue("--tree-subtree-gap")) || 0;
      const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-row='true'][data-selection-key]"));
      const rowInfo = rows.map((row) => ({
        row,
        key: row.dataset.selectionKey ?? "",
        depth: Number(row.dataset.depth ?? 0),
      }));
      const measuredNodes = rowInfo.map(({ row, key, depth }): MeasuredNodeBox => {
        return { key, depth, top: row.offsetTop, height: row.offsetHeight };
      });
      const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
      const measured = measuredTreeBlocks(rowInfo.map(({ row, key, depth }) => ({
        key,
        depth,
        top: row.offsetTop,
        bottom: row.offsetTop + row.offsetHeight,
      })), subtreeEdge)
        .filter((box) => box.isSubtree && visibleNodeIds.has(box.rootId))
        .map((box): MeasuredSubtreeBox => ({
          rootId: box.rootId,
          depth: box.depth,
          top: box.top,
          height: box.bottom - box.top,
          rootHeight: box.rootHeight,
        }));
      setSubtreeBoxes(layoutDebug ? measured : []);
      setNodeBoxes(layoutDebug ? measuredNodes : []);
      setSelectionBoxes(measured.filter((box) => nodeSelection.selectionRootKeys.has(box.rootId)));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    container.querySelectorAll<HTMLElement>("[data-tree-row='true']").forEach((row) => observer?.observe(row));
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isVisible, layoutDebug, layoutSignature, rootId, selectionRootSignature]);
  useLayoutEffect(() => {
    if (!isVisible || !nodeSelection.selectionMenuReady
      || !nodeSelection.selectedKeys.size || !nodeSelection.selectionRootKeys.size) {
      setNodeSelectionAnchor(null);
      return;
    }
    let animationFrame: number | null = null;
    const measure = () => {
      const roots = nodeSelection.selectionRootKeys;
      const elements = Array.from(contentAreaRef.current?.querySelectorAll<HTMLElement>("[data-selection-key]") ?? [])
        .filter((element) => roots.has(element.dataset.selectionKey ?? ""));
      const rects = elements.flatMap((element) => {
        const row = element.getBoundingClientRect();
        if (!row.width && !row.height) return [];
        const object = element.querySelector<HTMLElement>(".node-bullet, .inline-editor")?.getBoundingClientRect();
        return [{ left: object?.left ?? row.left, right: row.right, top: row.top, bottom: row.bottom }];
      });
      if (!rects.length) {
        const fallback = treeListRef.current?.getBoundingClientRect();
        if (!fallback) return;
        setNodeSelectionAnchor({ left: fallback.left, right: fallback.right, top: fallback.top, bottom: fallback.top });
        return;
      }
      setNodeSelectionAnchor({
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      });
    };
    measure();

    const motion = treeLayoutMotion.current;
    if (motion && typeof window.requestAnimationFrame === "function") {
      const motionEnd = motion.startedAt + TREE_LAYOUT_ANIMATION_DURATION;
      const followMotion = (timestamp: number) => {
        measure();
        if (timestamp < motionEnd) animationFrame = window.requestAnimationFrame(followMotion);
      };
      animationFrame = window.requestAnimationFrame(followMotion);
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [isVisible, layoutSignature, nodeSelection.selectedKeys.size, nodeSelection.selectionMenuReady, selectionRootSignature]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 6 } }),
  );
  const activeFields = activeRoot
    ? Object.values(fields).filter((field) => field.nodeId === activeRoot.id)
    : [];
  const dragPreview = dragId ? visibleDragPreview(visibleNodes, dragId) : [];
  const dragSourceKeys = dragId ? treeBlockSubtreeKeys(renderedRows, dragId) : new Set<string>();
  const layoutVisibleNodes = renderedRows.flatMap((row): VisibleTreeNode[] => row.kind === "node"
    ? [{ ...row.node, depth: row.depth } as VisibleTreeNode]
    : []);

  const measureDropLayout = (movingNodeId: string): MeasuredDropLayout => {
    const container = treeListRef.current;
    if (!container) return { slots: [], sourceZone: null, emptyZones: [] };
    const blockRects = new Map<string, { top: number; bottom: number; left: number; right: number }>();
    const anchorsByDepth = new Map<number, number>();
    const blockLeftsByDepth = new Map<number, number>();
    const blocksByKey = new Map(renderedRows.map((block) => [block.key, block]));
    const mountedRows = new Map(Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]")).flatMap((row) => {
      const key = row.dataset.treeBlockKey;
      return key ? [[key, row] as const] : [];
    }));
    const measurements = rowVirtualizer.measurementsCache;
    const state = useNotebookStore.getState();
    const emptyZones: EmptyDropHitZone[] = [];
    for (let index = 0; index < renderedRows.length; index += 1) {
      const block = renderedRows[index];
      const row = mountedRows.get(block.key);
      const measurement = measurements[index];
      // Layout offsets ignore the temporary drag transform, so gaps remain
      // anchored to the stationary tree while the preview follows the pointer.
      const top = row?.offsetTop ?? measurement?.start ?? index * 31;
      const height = row?.offsetHeight ?? measurement?.size ?? 31;
      const objectLeft = row
        ? Number.parseFloat(row.style.getPropertyValue("--tree-object-left")) || 0
        : TREE_ROW_LEFT_PADDING + TREE_COLLAPSE_WIDTH + block.depth * TREE_LEVEL_INDENT;
      const rowLeft = row?.offsetLeft ?? 0;
      const rect = {
        top,
        bottom: top + height,
        left: rowLeft + objectLeft,
        right: Math.max(rowLeft + objectLeft, container.scrollWidth - 8),
      };
      blockRects.set(block.key, rect);
      const depth = block.depth;
      if (!blockLeftsByDepth.has(depth)) {
        blockLeftsByDepth.set(depth, rect.left);
      }
      const bullet = row?.querySelector<HTMLElement>(".node-bullet");
      if (!anchorsByDepth.has(depth)) {
        anchorsByDepth.set(depth, bullet
          ? rowLeft + bullet.offsetLeft + bullet.offsetWidth / 2
          : rowLeft + TREE_ROW_LEFT_PADDING + depth * TREE_LEVEL_INDENT + TREE_COLLAPSE_WIDTH / 2);
      }
      if (block?.emptyTarget && canDropOnEmptyNode(state, movingNodeId, block.emptyTarget)) {
        emptyZones.push({
          blockKey: block.key,
          target: block.emptyTarget,
          top,
          bottom: top + height,
          left: rowLeft + objectLeft,
          right: container.scrollWidth - 8,
        });
      }
    }
    const endPlaceholder = blockRects.get(`ghost:${rootId}`);
    const endY = endPlaceholder
      ? endPlaceholder.top
      : container.clientHeight;
    const subtreeGap = Number.parseFloat(getComputedStyle(container).getPropertyValue("--tree-subtree-gap")) || 0;
    const subtreeRects = new Map(measuredTreeBlocks(
      renderedRows.flatMap((block) => {
        const rect = blockRects.get(block.key);
        return rect ? [{ key: block.key, depth: block.depth, top: rect.top, bottom: rect.bottom }] : [];
      }),
      subtreeGap,
    ).flatMap((measuredBlock) => {
      const block = blocksByKey.get(measuredBlock.rootId);
      return block?.kind === "node"
        ? [[block.node.id, {
          top: measuredBlock.top,
          bottom: measuredBlock.bottom,
          left: blockRects.get(measuredBlock.rootId)?.left ?? 0,
          right: blockRects.get(measuredBlock.rootId)?.right ?? container.scrollWidth,
        }] as const]
        : [];
    }));
    const slots = createTreeDropSlots(
      state,
      layoutVisibleNodes,
      rootId,
      movingNodeId,
      renderedRows
        .filter((block): block is Extract<(typeof renderedRows)[number], { kind: "placeholder" }> => block.kind === "placeholder")
        .map((block): VisibleDropPlaceholder => ({ parentId: block.parentId })),
    );
    return {
      slots: layoutDropSlots(slots, { blocks: blockRects, subtrees: subtreeRects }, endY, {
        lineLeftByDepth: anchorsByDepth,
        hitLeftByDepth: blockLeftsByDepth,
      }),
      sourceZone: subtreeRects.get(movingNodeId) ?? blockRects.get(movingNodeId) ?? null,
      emptyZones,
    };
  };

  const updateDropTargetNow = (pointer: DragPointer) => {
    const movingNodeId = activeDragIdRef.current;
    const container = treeListRef.current;
    if (!draggingRef.current || !movingNodeId || !container) return;
    const containerRect = container.getBoundingClientRect();
    const pointerY = pointer.clientY - containerRect.top;
    const measured = dragLayoutRef.current ?? measureDropLayout(movingNodeId);
    dragLayoutRef.current ??= measured;
    setDragPlaceholderOpacity(sourcePlaceholderOpacity(dragOriginPointerRef.current, pointer));
    const pointerX = pointer.clientX - containerRect.left + container.scrollLeft;
    const emptyZones = measured.emptyZones;
    const directTarget = emptyZones.find((zone) => (
      pointerY >= zone.top
      && pointerY <= zone.bottom
      && pointerX >= zone.left
      && pointerX <= zone.right
    )) ?? null;
    emptyDropTargetRef.current = directTarget;
    setEmptyDropTargetKey((previous) => previous === (directTarget?.blockKey ?? null) ? previous : (directTarget?.blockKey ?? null));
    const next = directTarget ? null : closestDropSlot(
      measured.slots,
      { x: pointerX, y: pointerY },
      measured.sourceZone,
    );
    if (layoutDebug) {
      setDropDebugLayout({
        slots: measured.slots.filter((slot) => !slot.isNoop),
        emptyZones,
        noMove: noMoveZone(measured.slots, measured.sourceZone),
        pointerY,
      });
    }
    dropSlotRef.current = next;
    setDropIndicator((previous) => previous?.id === next?.id
      && previous?.top === next?.top
      && previous?.left === next?.left ? previous : next);
  };
  const scheduleDropTargetUpdate = (pointer: DragPointer) => {
    dragPointerRef.current = pointer;
    if (dragUpdateFrameRef.current !== null) return;
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      updateDropTargetNow(pointer);
      return;
    }
    dragUpdateFrameRef.current = window.requestAnimationFrame(() => {
      dragUpdateFrameRef.current = null;
      const latest = dragPointerRef.current;
      if (latest) updateDropTargetNow(latest);
    });
  };
  updateDropTargetRef.current = scheduleDropTargetUpdate;

  useLayoutEffect(() => {
    const updatePointer = (pointer: DragPointer) => {
      updateDropTargetRef.current(pointer);
    };
    const onPointerMove = (event: PointerEvent) => updatePointer({ clientX: event.clientX, clientY: event.clientY });
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (touch) updatePointer({ clientX: touch.clientX, clientY: touch.clientY });
    };
    const onScroll = () => {
      const pointer = dragPointerRef.current;
      if (pointer) updateDropTargetRef.current(pointer);
    };
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  const onDragMove = (_event: DragMoveEvent) => {
    const pointer = dragPointerRef.current;
    if (pointer) scheduleDropTargetUpdate(pointer);
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (dragUpdateFrameRef.current !== null) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = null;
      if (dragPointerRef.current) updateDropTargetNow(dragPointerRef.current);
    }
    const slot = dropSlotRef.current;
    const directTarget = emptyDropTargetRef.current;
    const previewRects = measureDragPreviewRows();
    flushSync(() => {
      if (directTarget) {
        moveToEmptyNode(String(event.active.id), directTarget.target);
      } else if (slot) {
        moveToSlot(String(event.active.id), slot.parentId, slot.beforeId);
      }
      resetDrag();
    });
    animateDroppedRows(previewRects, treeListRef.current);
  };

  const resetDrag = () => {
    if (dragUpdateFrameRef.current !== null) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = null;
    }
    draggingRef.current = false;
    setDragId(null);
    setDragPreviewLayout(null);
    setDragPlaceholderOpacity(0);
    setDropIndicator(null);
    setDropDebugLayout(null);
    setEmptyDropTargetKey(null);
    dropSlotRef.current = null;
    emptyDropTargetRef.current = null;
    activeDragIdRef.current = null;
    dragOriginPointerRef.current = null;
    dragPointerRef.current = null;
    dragLayoutRef.current = null;
  };

  const onDragStart = (event: DragStartEvent) => {
    draggingRef.current = true;
    dropSlotRef.current = null;
    const pointer = clientPointFromActivator(event.activatorEvent);
    const movingNodeId = String(event.active.id);
    activeDragIdRef.current = movingNodeId;
    dragOriginPointerRef.current = pointer;
    dragPointerRef.current = pointer;
    setDropIndicator(null);
    setDragPreviewLayout(captureDragPreviewLayout(
      treeListRef.current,
      visibleDragPreview(visibleNodes, movingNodeId).map(({ node }) => node.id),
    ));
    setDragId(movingNodeId);
    dragLayoutRef.current = null;
    if (pointer) scheduleDropTargetUpdate(pointer);
  };

  return (
    <div
      ref={contentAreaRef}
      tabIndex={-1}
      className={`content-area ${view === "today" || view === "outline" ? "is-editable-canvas" : ""} ${nodeSelection.selectedKeys.size ? "has-node-selection" : ""}`}
      onPointerDown={onContentAreaPointerDown}
      {...nodeSelection.handlers}
    >
      <div className="content-canvas-inner">
      <section className="content-header">
        <div className="content-heading">
          <p className="eyebrow">{eyebrow(view)}</p>
          {activeRoot?.kind === "content" && view !== "search" && view !== "trash" ? (
            <div
              className={`view-root-heading root-node-heading ${nodeSelection.selectionRootKeys.has(activeRoot.id) ? "is-node-selected" : ""}`}
              data-node-id={activeRoot.id}
              data-selection-key={activeRoot.id}
              data-depth={0}
              role="heading"
              aria-level={1}
            >
              <InlineEditor nodeId={activeRoot.id} value={activeRoot.markdown} variant="root" />
            </div>
          ) : <h1 className="view-root-heading">{heading(view, activeRoot)}</h1>}
        </div>
        {view === "search" && (
          <div className="header-tools">
            <div className="search-input"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点内容" /></div>
          </div>
        )}
        {activeRoot?.kind === "content" && view !== "search" && view !== "trash" && !hasSupertag({ nodes }, activeRoot.id, CANVAS_SUPERTAG_ID) && (
          <button className="subtle-button" type="button" onClick={() => addSupertag(activeRoot.id, CANVAS_SUPERTAG_ID)}><Grid2X2 size={16} />添加 Canvas</button>
        )}
      </section>

      {activeRoot && view !== "search" && view !== "trash" && activeFields.length > 0 && (
        <div className="field-strip">
          {activeFields.map((field) => <span key={field.id}><SlidersHorizontal size={13} />{field.key}: {field.value}</span>)}
        </div>
      )}

      {layoutDebug && <LayoutDebugPanel value={layoutDebugVisibility} onChange={setLayoutDebugVisibility} />}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragCancel={resetDrag}
        onDragEnd={onDragEnd}
      >
        <div
          ref={treeListRef}
          className="tree-list"
          role="tree"
          aria-label="节点树"
          data-debug-tree-list={layoutDebugVisibility.treeList || undefined}
          data-debug-collapse={layoutDebugVisibility.collapse || undefined}
          data-debug-bullet={layoutDebugVisibility.bullet || undefined}
          data-debug-content={layoutDebugVisibility.content || undefined}
          data-debug-attachment={layoutDebugVisibility.attachment || undefined}
          data-debug-hierarchy={layoutDebugVisibility.hierarchy || undefined}
          style={{
            "--tree-layout-animation-duration": `${TREE_LAYOUT_ANIMATION_DURATION}ms`,
            "--tree-layout-animation-easing": TREE_LAYOUT_ANIMATION_EASING,
            "--drag-source-opacity": dragPlaceholderOpacity,
            ...(virtualized ? { height: rowVirtualizer.getTotalSize() } : {}),
          } as CSSProperties}
        >
          {selectionBoxes.length > 0 && <div className="selection-subtree-overlay" aria-hidden="true">
            {selectionBoxes.map((box) => (
              <div key={box.rootId} className="selection-subtree-box" style={{ top: box.top, height: box.height, left: `${TREE_ROW_LEFT_PADDING + TREE_COLLAPSE_WIDTH + box.depth * TREE_LEVEL_INDENT}px`, right: 8 }}>
                <div className="selection-subtree-root" style={{ height: box.rootHeight }} />
              </div>
            ))}
          </div>}
          {layoutDebug && <div className="tree-layout-overlay" aria-hidden="true">
            {layoutDebugVisibility.nodeBlocks && nodeBoxes.map((box) => <div key={box.key} className="node-layout-box" data-depth={box.depth} style={{ top: box.top, height: box.height, left: `${TREE_ROW_LEFT_PADDING + TREE_COLLAPSE_WIDTH + box.depth * TREE_LEVEL_INDENT}px`, right: 8 }} />)}
            {layoutDebugVisibility.subtreeBlocks && subtreeBoxes.map((box) => <div key={box.rootId} className="subtree-layout-box" data-depth={box.depth} style={{ top: box.top, height: box.height, left: `${TREE_ROW_LEFT_PADDING + TREE_COLLAPSE_WIDTH + box.depth * TREE_LEVEL_INDENT}px`, right: 8 }} />)}
          </div>}
          <svg className="hierarchy-overlay" aria-label="层级线操作" role="group">
            {guideLines.map((line) => {
              const path = `M ${line.x} ${line.y1} V ${line.y2}`;
              return (
                  <g key={line.id} data-hierarchy-node-id={line.id} className="hierarchy-line-group" style={{ opacity: line.opacity ?? 1 }}>
                  <path
                    className="hierarchy-line-hit"
                    d={path}
                    stroke="transparent"
                    strokeWidth={10}
                    onClick={() => toggleChildren(line.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggleChildren(line.id);
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label="折叠或展开下一级节点"
                  />
                  <path className="hierarchy-line" d={path} aria-hidden="true" />
                </g>
              );
            })}
          </svg>
          {visibleNodes.length === 0 && view === "trash" && <EmptyState />}
          {layoutDebug && layoutDebugVisibility.dropHitZones && dropDebugLayout && (
            <div className="drop-hit-zone-overlay" aria-hidden="true">
              {dropDebugLayout.slots.map((slot) => (
                <div
                  key={`${slot.id}:${slot.hitZone.top}:${slot.hitZone.left}:${slot.hitZone.bottom}`}
                  className={`drop-hit-zone ${dropIndicator?.id === slot.id ? "is-active" : ""}`}
                  style={{
                    top: slot.hitZone.top,
                    left: slot.hitZone.left,
                    right: Math.max(0, (treeListRef.current?.scrollWidth ?? 0) - slot.hitZone.right),
                    height: Math.max(0, slot.hitZone.bottom - slot.hitZone.top),
                  }}
                >
                  <span>层级 {slot.depth + 1}</span>
                </div>
              ))}
              {dropDebugLayout.emptyZones.map((zone) => (
                <div
                  key={`empty:${zone.blockKey}`}
                  className={`empty-drop-hit-zone ${emptyDropTargetKey === zone.blockKey ? "is-active" : ""}`}
                  style={{ top: zone.top, left: zone.left, right: Math.max(0, (treeListRef.current?.scrollWidth ?? 0) - zone.right), height: zone.bottom - zone.top }}
                >
                  <span>空节点</span>
                </div>
              ))}
              {dropDebugLayout.noMove && (
                <div className="drop-source-zone" style={{
                  top: dropDebugLayout.noMove.top,
                  left: dropDebugLayout.noMove.left,
                  right: Math.max(0, (treeListRef.current?.scrollWidth ?? 0) - dropDebugLayout.noMove.right),
                  height: dropDebugLayout.noMove.bottom - dropDebugLayout.noMove.top,
                }}>
                  <span>原位，不移动</span>
                </div>
              )}
            </div>
          )}
          {layoutDebug && layoutDebugVisibility.dropHitZones && dropDebugLayout && (
            <div className="drag-pointer-marker" style={{ top: dropDebugLayout.pointerY }} aria-hidden="true"><span>鼠标命中基准</span></div>
          )}
          {dropIndicator && <div className="tree-drop-indicator" style={{ top: dropIndicator.top, left: dropIndicator.left }} aria-hidden="true" />}
          {rowsToRender.map(({ row, index, item }) => {
            const layoutGap = visibleLayoutGap(renderedRows, index);
            const subtreeExitCount = visibleSubtreeExitCount(renderedRows, index);
            return <TreeBlockRow
              key={row.key}
              block={row}
              virtualIndex={item?.index}
              virtualTop={item?.start}
              measureRef={item ? rowVirtualizer.measureElement : undefined}
              navigationPreviousKey={editableRowKey(renderedRows, index, -1)}
              navigationNextKey={editableRowKey(renderedRows, index, 1)}
              layoutGap={layoutGap}
              subtreeExitCount={subtreeExitCount}
              selected={nodeSelection.selectionRootKeys.has(row.key)}
              hasSubtreeSelection={row.kind === "node" && selectionBoxes.some((box) => box.rootId === row.key)}
              dragDisabled={view === "search" || view === "trash"}
              readOnly={view === "trash"}
              sourcePlaceholder={dragSourceKeys.has(row.key)}
              emptyDropTarget={emptyDropTargetKey === row.key}
              supplement={row.kind === "node" && row.localCanvasCards ? (
                <CanvasCardGrid
                  cards={row.localCanvasCards}
                  local
                  label={`${row.node.markdown || "未命名节点"} 的局部 Canvas`}
                />
              ) : undefined}
            />;
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragPreview.length > 0 ? (
            <div className="drag-preview" aria-hidden="true" style={dragPreviewLayout ? { width: dragPreviewLayout.width } : undefined}>
              {dragPreview.map(({ node }, index) => (
                <div
                  key={node.id}
                  data-drag-preview-key={node.id}
                  className={`drag-preview-row layout-gap-${visibleLayoutGap(dragPreview.map(({ node: previewNode }) => previewNode), index)}`}
                  style={{
                    paddingLeft: `${TREE_ROW_LEFT_PADDING + (node.depth ?? 0) * TREE_LEVEL_INDENT}px`,
                    "--tree-exit-gap": `${visibleSubtreeExitCount(dragPreview.map(({ node: previewNode }) => previewNode), index) * TREE_SUBTREE_GAP}px`,
                    ...dragPreviewLayout?.rows.get(node.id)?.rowStyle,
                  } as CSSProperties}
                >
                  <span className="drag-preview-collapse-space" />
                  <span className="drag-preview-bullet"><span className="drag-preview-dot" /></span>
                  <span className="drag-preview-text" style={dragPreviewLayout?.rows.get(node.id)?.textStyle}>
                    {node.kind === "date" ? node.dateKey : node.markdown || "未命名节点"}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <SelectionMenu
        anchor={nodeSelectionAnchor}
        ariaLabel="节点选区菜单"
        className="node-selection-menu"
        alignment="start"
        actions={[
          { id: "copy", label: "复制节点", icon: selectionMenuIcons.copy, onSelect: nodeSelection.copySelection, feedback: "已复制", failureFeedback: "复制失败" },
          { id: "cut", label: "剪切节点", icon: selectionMenuIcons.cut, onSelect: nodeSelection.cutSelection, failureFeedback: "剪切失败" },
          ...(nodeSelection.canOutdentSelection
            ? [{ id: "outdent", label: "提升节点", icon: selectionMenuIcons.outdent, onSelect: nodeSelection.outdentSelection }]
            : []),
          ...(nodeSelection.canIndentSelection
            ? [{ id: "indent", label: "缩进节点", icon: selectionMenuIcons.indent, onSelect: nodeSelection.indentSelection }]
            : []),
          { id: "delete", label: "删除节点", icon: selectionMenuIcons.delete, onSelect: nodeSelection.deleteSelection },
        ]}
      />
      </div>
    </div>
  );
}

function canvasCursorAtPoint(container: HTMLElement, clientX: number, clientY: number): number | "end" {
  const editorHost = container.querySelector<HTMLElement>(".inline-editor");
  const editor = editorHost ? EditorView.findFromDOM(editorHost) : null;
  const surface = editorHost?.querySelector<HTMLElement>(".cm-content") ?? editorHost;
  if (!editor || !surface) {
    const rect = (surface ?? container).getBoundingClientRect();
    return clientX <= (rect.left + rect.right) / 2 ? 0 : "end";
  }

  const rect = surface.getBoundingClientRect();
  const x = clampToRect(clientX, rect.left, rect.right);
  const y = clampToRect(clientY, rect.top, rect.bottom);
  return editor.posAtCoords({ x, y }, false);
}

function clampToRect(value: number, start: number, end: number): number {
  if (end <= start) return start;
  const inset = Math.min(1, (end - start) / 2);
  return Math.min(Math.max(value, start + inset), end - inset);
}

function verticalDistance(clientY: number, rect: DOMRect): number {
  if (clientY < rect.top) return rect.top - clientY;
  if (clientY > rect.bottom) return clientY - rect.bottom;
  return 0;
}

function eyebrow(view: WorkspaceView): string {
  if (view === "today") return "每日记录";
  if (view === "search") return "全局检索";
  if (view === "trash") return "误删恢复";
  return "节点空间";
}

function heading(view: WorkspaceView, activeRoot: NodeRecord | null): string {
  if (view === "search") return "搜索节点";
  if (view === "trash") return "回收站";
  if (activeRoot && activeRoot.id !== ROOT_ID) return dateLabel(activeRoot.dateKey);
  return "所有笔记";
}

function clientPointFromActivator(event: Event): DragPointer | null {
  const pointerEvent = event as PointerEvent;
  if (Number.isFinite(pointerEvent.clientX) && Number.isFinite(pointerEvent.clientY)) {
    return { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY };
  }
  const touchEvent = event as TouchEvent;
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];
  return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
}

function sourcePlaceholderOpacity(origin: DragPointer | null, pointer: DragPointer): number {
  if (!origin) return 0;
  const distance = Math.hypot(pointer.clientX - origin.clientX, pointer.clientY - origin.clientY);
  return Math.min(0.3, distance / 80 * 0.3);
}

interface DragPreviewPosition {
  top: number;
  anchorX: number;
}

function measureDragPreviewRows(): Map<string, DragPreviewPosition> {
  return new Map(Array.from(document.querySelectorAll<HTMLElement>("[data-drag-preview-key]")).flatMap((row) => {
    const key = row.dataset.dragPreviewKey;
    const rowRect = row.getBoundingClientRect();
    const bulletRect = row.querySelector<HTMLElement>(".drag-preview-bullet")?.getBoundingClientRect();
    return key ? [[key, {
      top: rowRect.top,
      anchorX: bulletRect ? bulletRect.left + bulletRect.width / 2 : rowRect.left,
    }] as const] : [];
  }));
}

function animateDroppedRows(previewPositions: ReadonlyMap<string, DragPreviewPosition>, container: HTMLElement | null): void {
  if (!container || previewPositions.size === 0) return;
  for (const row of Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"))) {
    const key = row.dataset.treeBlockKey;
    const preview = key ? previewPositions.get(key) : undefined;
    if (!preview) continue;

    // The tree FLIP animation initially renders this row at its old layout
    // position. Remove that transform before measuring the actual destination.
    row.getAnimations().forEach((animation) => animation.cancel());
    const target = row.getBoundingClientRect();
    const targetBullet = row.querySelector<HTMLElement>(".node-bullet")?.getBoundingClientRect();
    const targetAnchorX = targetBullet ? targetBullet.left + targetBullet.width / 2 : target.left;
    const x = preview.anchorX - targetAnchorX;
    const y = preview.top - target.top;
    row.animate(
      [
        { opacity: 0.58, transform: `translate(${x}px, ${y}px)` },
        { opacity: 1, transform: "translate(0, 0)" },
      ],
      { duration: TREE_LAYOUT_ANIMATION_DURATION, easing: TREE_LAYOUT_ANIMATION_EASING },
    );
  }
}

function EmptyState() {
  return <div className="empty-state"><div className="empty-icon"><Trash2 size={22} /></div><h2>回收站为空</h2><p>删除的内容会在这里保留，方便恢复。</p></div>;
}

function editableRowKey(
  rows: readonly ReturnType<typeof treeLayoutRows>[number][],
  index: number,
  direction: -1 | 1,
): string | undefined {
  for (let cursor = index + direction; cursor >= 0 && cursor < rows.length; cursor += direction) {
    const row = rows[cursor];
    if (row.kind === "placeholder" || row.node.kind === "content") return row.key;
  }
  return undefined;
}
