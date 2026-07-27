import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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
import { Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { GhostRow, TreeRow } from "../../components/TreeRow";
import { InlineEditor } from "../../components/InlineEditor";
import { createTreeDropSlots, type TreeDropSlot, type VisibleTreeNode } from "../../domain/dropSlots";
import { ROOT_ID, type NodeRecord } from "../../domain/model";
import { dateLabel } from "../../shared/date";
import { TREE_COLLAPSE_WIDTH, TREE_LEVEL_INDENT, TREE_ROW_LEFT_PADDING, TREE_SUBTREE_GAP } from "../../shared/treeLayout";
import type { WorkspaceView } from "../../shared/workspaceView";
import { useNotebookStore } from "../../store/useNotebookStore";
import { useHierarchyGuides } from "./hooks/useHierarchyGuides";
import { useTreeLayoutAnimation } from "./hooks/useTreeLayoutAnimation";
import { ghostSelectionKey, useNodeRangeSelection } from "./hooks/useNodeRangeSelection";
import { DEFAULT_LAYOUT_DEBUG_VISIBILITY, LayoutDebugPanel } from "./LayoutDebugPanel";
import { visibleDragPreview } from "./model/dragPreview";
import { closestDropSlot, layoutDropSlots, pointerYFromTranslatedRect, type DropSlotLayout } from "./model/dropIndicator";
import { subtreeBottomInset, visibleLayoutGap, visibleSubtreeExitCount } from "./model/subtreeLayout";
import { treeLayoutRows } from "./model/treeLayoutRows";
import { TREE_LAYOUT_ANIMATION_DURATION, TREE_LAYOUT_ANIMATION_EASING } from "./model/treeLayoutMotion";

interface Props {
  view: WorkspaceView;
  activeRoot: NodeRecord | null;
  rootId: string;
  visibleNodes: NodeRecord[];
  layoutDebug?: boolean;
}

type MeasuredSubtreeBox = { rootId: string; depth: number; top: number; height: number; rootHeight: number };
type MeasuredNodeBox = { key: string; depth: number; top: number; height: number };

export function NotebookPanel({ view, activeRoot, rootId, visibleNodes, layoutDebug = false }: Props) {
  const store = useNotebookStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropSlotLayout | null>(null);
  const [subtreeBoxes, setSubtreeBoxes] = useState<MeasuredSubtreeBox[]>([]);
  const [nodeBoxes, setNodeBoxes] = useState<MeasuredNodeBox[]>([]);
  const [selectionBoxes, setSelectionBoxes] = useState<MeasuredSubtreeBox[]>([]);
  const [layoutDebugVisibility, setLayoutDebugVisibility] = useState(DEFAULT_LAYOUT_DEBUG_VISIBILITY);
  const dropSlotRef = useRef<TreeDropSlot | null>(null);
  const pointerOffsetRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const treeListRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const nodeSelection = useNodeRangeSelection(contentAreaRef);
  const treeLayoutMotion = useTreeLayoutAnimation(treeListRef, [store.collapsed, store.nodes, visibleNodes, rootId]);
  const guideLines = useHierarchyGuides(
    treeListRef,
    view === "today" || view === "outline",
    [store.activeNodeId, store.collapsed, store.nodes, visibleNodes, rootId],
    treeLayoutMotion,
  );
  const selectionRootSignature = [...nodeSelection.selectionRootKeys].join("\u0000");
  const renderedRows = treeLayoutRows(
    visibleNodes,
    store,
    store.ghostSuppressed,
    view === "today" || view === "outline" ? rootId : null,
  );
  useLayoutEffect(() => {
    const container = treeListRef.current;
    if (!container) {
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
      const measured = visibleNodes.flatMap((node): MeasuredSubtreeBox[] => {
        const startIndex = rowInfo.findIndex((entry) => entry.key === node.id);
        if (startIndex < 0) return [];
        const rootDepth = rowInfo[startIndex].depth;
        let endIndex = startIndex;
        while (endIndex + 1 < rowInfo.length && rowInfo[endIndex + 1].depth > rootDepth) endIndex += 1;
        if (endIndex === startIndex) return [];
        const root = rowInfo[startIndex].row;
        const last = rowInfo[endIndex].row;
        const lastDepth = rowInfo[endIndex].depth;
        return [{
          rootId: node.id,
          depth: rootDepth,
          top: root.offsetTop,
          height: last.offsetTop + last.offsetHeight - root.offsetTop + subtreeBottomInset(rootDepth, lastDepth, subtreeEdge),
          rootHeight: root.offsetHeight,
        }];
      });
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
  }, [layoutDebug, visibleNodes, store.collapsed, store.nodes, rootId, selectionRootSignature]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 6 } }),
  );
  const activeFields = activeRoot
    ? Object.values(store.fields).filter((field) => field.nodeId === activeRoot.id)
    : [];
  const dragPreview = dragId ? visibleDragPreview(visibleNodes, dragId) : [];

  const measureDropSlots = (movingNodeId: string): DropSlotLayout[] => {
    const container = treeListRef.current;
    if (!container) return [];
    const rowRects = new Map<string, { top: number; bottom: number }>();
    const anchorsByDepth = new Map<number, number>();
    for (const row of Array.from(container.querySelectorAll<HTMLElement>("[data-node-id]"))) {
      const nodeId = row.dataset.nodeId;
      if (!nodeId) continue;
      // Layout offsets ignore the temporary drag transform, so gaps remain
      // anchored to the stationary tree while the preview follows the pointer.
      const top = row.offsetTop;
      rowRects.set(nodeId, { top, bottom: top + row.offsetHeight });
      const depth = Number(row.dataset.depth ?? 0);
      const bullet = row.querySelector<HTMLElement>(".node-bullet");
      if (!anchorsByDepth.has(depth) && bullet) {
        anchorsByDepth.set(depth, row.offsetLeft + bullet.offsetLeft + bullet.offsetWidth / 2 - container.scrollLeft);
      }
    }
    const endGhost = Array.from(container.querySelectorAll<HTMLElement>("[data-ghost-row='true']"))
      .find((row) => row.dataset.parentId === rootId);
    const endY = endGhost
      ? endGhost.offsetTop
      : container.clientHeight;
    const state = useNotebookStore.getState();
    const slots = createTreeDropSlots(
      state,
      visibleNodes as VisibleTreeNode[],
      rootId,
      movingNodeId,
    );
    return layoutDropSlots(slots, rowRects, endY, { anchorsByDepth });
  };

  const onDragMove = (event: DragMoveEvent) => {
    if (!draggingRef.current) return;
    const translated = event.active.rect.current.translated;
    const container = treeListRef.current;
    if (!translated || !container) return;
    const containerRect = container.getBoundingClientRect();
    const pointerY = pointerYFromTranslatedRect(translated, containerRect.top, pointerOffsetRef.current);
    const next = closestDropSlot(measureDropSlots(String(event.active.id)), pointerY);
    dropSlotRef.current = next;
    setDropIndicator(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    draggingRef.current = false;
    setDragId(null);
    setDropIndicator(null);
    const slot = dropSlotRef.current;
    dropSlotRef.current = null;
    pointerOffsetRef.current = null;
    if (!slot) return;
    store.moveToSlot(String(event.active.id), slot.parentId, slot.beforeId);
  };

  const resetDrag = () => {
    draggingRef.current = false;
    setDragId(null);
    setDropIndicator(null);
    dropSlotRef.current = null;
    pointerOffsetRef.current = null;
  };

  const onDragStart = (event: DragStartEvent) => {
    draggingRef.current = true;
    dropSlotRef.current = null;
    const initialRect = event.active.rect.current.initial;
    const clientY = clientYFromActivator(event.activatorEvent);
    pointerOffsetRef.current = initialRect && clientY !== null ? clientY - initialRect.top : null;
    setDropIndicator(null);
    setDragId(String(event.active.id));
  };

  return (
    <div ref={contentAreaRef} className={`content-area ${nodeSelection.selectedKeys.size ? "has-node-selection" : ""}`} {...nodeSelection.handlers}>
      <section className="content-header">
        <div>
          <p className="eyebrow">{eyebrow(view)}</p>
          {activeRoot?.kind === "content" && view !== "search" && view !== "trash" ? (
            <div
              className={`root-node-heading ${nodeSelection.selectionRootKeys.has(activeRoot.id) ? "is-node-selected" : ""}`}
              data-node-id={activeRoot.id}
              data-selection-key={activeRoot.id}
              data-depth={0}
              role="heading"
              aria-level={1}
            >
              <InlineEditor nodeId={activeRoot.id} value={activeRoot.markdown} variant="root" />
            </div>
          ) : <h1>{heading(view, activeRoot)}</h1>}
        </div>
        <div className="header-tools">
          {view === "search" && (
            <div className="search-input"><Search size={16} /><input autoFocus value={store.query} onChange={(event) => store.setQuery(event.target.value)} placeholder="搜索节点内容" /></div>
          )}
        </div>
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
          style={{ "--tree-layout-animation-duration": `${TREE_LAYOUT_ANIMATION_DURATION}ms`, "--tree-layout-animation-easing": TREE_LAYOUT_ANIMATION_EASING } as CSSProperties}
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
                  <path className="hierarchy-line-hit" d={path} stroke="transparent" strokeWidth={10} onClick={() => store.toggleChildren(line.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); store.toggleChildren(line.id); } }} tabIndex={0} role="button" aria-label="折叠或展开下一级节点" />
                  <path className="hierarchy-line" d={path} aria-hidden="true" />
                </g>
              );
            })}
          </svg>
          {visibleNodes.length === 0 && view === "trash" && <EmptyState />}
          {dropIndicator && <div className="tree-drop-indicator" style={{ top: dropIndicator.top, left: dropIndicator.left }} aria-hidden="true" />}
          {renderedRows.map((row, index) => {
            const layoutGap = visibleLayoutGap(renderedRows, index);
            const subtreeExitCount = visibleSubtreeExitCount(renderedRows, index);
            return row.kind === "node"
              ? <TreeRow key={row.key} node={row.node as NodeRecord & { depth?: number }} layoutGap={layoutGap} subtreeExitCount={subtreeExitCount} selected={nodeSelection.selectionRootKeys.has(row.key)} hasSubtreeSelection={selectionBoxes.some((box) => box.rootId === row.key)} dragDisabled={view === "search" || view === "trash"} />
              : <GhostRow key={row.key} droppableId={`ghost:${row.parentId}`} parentId={row.parentId} depth={row.depth} layoutGap={layoutGap} subtreeExitCount={subtreeExitCount} selected={nodeSelection.selectionRootKeys.has(ghostSelectionKey(row.parentId))} />;
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragPreview.length > 0 ? (
            <div className="drag-preview" aria-hidden="true">
              {dragPreview.map(({ node }, index) => (
                <div key={node.id} className={`drag-preview-row layout-gap-${visibleLayoutGap(dragPreview.map(({ node: previewNode }) => previewNode), index)}`} style={{ paddingLeft: `${TREE_ROW_LEFT_PADDING + (node.depth ?? 0) * TREE_LEVEL_INDENT}px`, "--tree-exit-gap": `${visibleSubtreeExitCount(dragPreview.map(({ node: previewNode }) => previewNode), index) * TREE_SUBTREE_GAP}px` } as CSSProperties}>
                  <span className="drag-preview-collapse-space" />
                  <span className="drag-preview-bullet"><span className="drag-preview-dot" /></span>
                  <span className="drag-preview-text">
                    {node.kind === "date" ? node.dateKey : node.markdown || "未命名节点"}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
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

function clientYFromActivator(event: Event): number | null {
  const pointerEvent = event as PointerEvent;
  if (Number.isFinite(pointerEvent.clientY)) return pointerEvent.clientY;
  const touchEvent = event as TouchEvent;
  return touchEvent.touches?.[0]?.clientY ?? touchEvent.changedTouches?.[0]?.clientY ?? null;
}

function EmptyState() {
  return <div className="empty-state"><div className="empty-icon"><Trash2 size={22} /></div><h2>回收站为空</h2><p>删除的内容会在这里保留，方便恢复。</p></div>;
}
