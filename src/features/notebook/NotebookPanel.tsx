import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { GhostRow, TreeRow } from "../../components/TreeRow";
import { InlineEditor } from "../../components/InlineEditor";
import { ROOT_ID, type NodeRecord } from "../../domain/model";
import { dateLabel } from "../../shared/date";
import type { WorkspaceView } from "../../shared/workspaceView";
import { useNotebookStore } from "../../store/useNotebookStore";
import { useHierarchyGuides } from "./hooks/useHierarchyGuides";

interface Props {
  view: WorkspaceView;
  activeRoot: NodeRecord | null;
  rootId: string;
  visibleNodes: NodeRecord[];
}

export function NotebookPanel({ view, activeRoot, rootId, visibleNodes }: Props) {
  const store = useNotebookStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const treeListRef = useRef<HTMLDivElement>(null);
  const guideLines = useHierarchyGuides(
    treeListRef,
    view === "today" || view === "outline",
    [store.activeNodeId, store.collapsed, store.nodes, visibleNodes, rootId],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 6 } }),
  );
  const activeFields = activeRoot
    ? Object.values(store.fields).filter((field) => field.nodeId === activeRoot.id)
    : [];

  const onDragEnd = (event: DragEndEvent) => {
    setDragId(null);
    const { active, over, delta } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith("ghost:child:")) {
      store.moveLastChild(activeId, overId.slice("ghost:child:".length));
      return;
    }
    if (overId.startsWith("ghost:root:")) {
      store.moveLastChild(activeId, overId.slice("ghost:root:".length));
      return;
    }
    if (delta.y >= 18) store.moveAfter(activeId, overId);
    else store.moveBefore(activeId, overId);
  };

  return (
    <div className="content-area">
      <section className="content-header">
        <div>
          <p className="eyebrow">{eyebrow(view)}</p>
          {activeRoot?.kind === "content" && view !== "search" && view !== "trash" ? (
            <div className="root-node-heading" data-node-id={activeRoot.id} role="heading" aria-level={1}>
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

      <DndContext sensors={sensors} onDragStart={(event) => setDragId(String(event.active.id))} onDragCancel={() => setDragId(null)} onDragEnd={onDragEnd}>
        <div ref={treeListRef} className="tree-list" role="tree" aria-label="节点树">
          <svg className="hierarchy-overlay" aria-label="层级线操作" role="group">
            {guideLines.map((line) => {
              const path = `M ${line.x} ${line.y1} V ${line.y2}`;
              return (
                <g key={line.id} data-hierarchy-node-id={line.id} className="hierarchy-line-group">
                  <path className="hierarchy-line-hit" d={path} stroke="transparent" strokeWidth={10} onClick={() => store.toggleChildren(line.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); store.toggleChildren(line.id); } }} tabIndex={0} role="button" aria-label="折叠或展开下一级节点" />
                  <path className="hierarchy-line" d={path} aria-hidden="true" />
                </g>
              );
            })}
          </svg>
          {visibleNodes.length === 0 && view === "trash" && <EmptyState />}
          {visibleNodes.map((node) => <TreeRow key={node.id} node={node as NodeRecord & { depth?: number }} />)}
          {(view === "today" || view === "outline") && <GhostRow droppableId={`ghost:root:${rootId}`} parentId={rootId} depth={0} />}
        </div>
        <DragOverlay>
          {dragId ? <div className="drag-preview"><span className="drag-preview-dot">••</span>{store.nodes[dragId]?.markdown || "未命名节点"}</div> : null}
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

function EmptyState() {
  return <div className="empty-state"><div className="empty-icon"><Trash2 size={22} /></div><h2>回收站为空</h2><p>删除的内容会在这里保留，方便恢复。</p></div>;
}
