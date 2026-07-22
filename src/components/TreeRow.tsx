import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Circle, Paperclip } from "lucide-react";
import { InlineEditor } from "./InlineEditor";
import { GhostEditor } from "./GhostEditor";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";
import type { NodeRecord } from "../domain/model";

interface Props { node: NodeRecord & { depth?: number }; }

export function TreeRow({ node }: Props) {
  const nodes = useNotebookStore((state) => state.nodes);
  const collapsed = useNotebookStore((state) => state.collapsed[node.id]);
  const toggleNode = useNotebookStore((state) => state.toggleNode);
  const enterNode = useNotebookStore((state) => state.enterNode);
  const addAttachment = useNotebookStore((state) => state.addAttachment);
  const children = useMemo(() => childrenOf({ nodes, fields: {}, attachments: {}, collapsed: {} }, node.id), [nodes, node.id]);
  const isExpanded = collapsed === false || (collapsed === undefined && children.length > 0);
  const sortable = useSortable({ id: node.id, disabled: node.kind === "date" });

  return (
    <>
      <div
        ref={sortable.setNodeRef}
        data-tree-row="true"
        data-node-id={node.id}
        data-depth={node.depth ?? 0}
        className={`tree-row ${sortable.isDragging ? "is-dragging" : ""}`}
        style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, paddingLeft: `${16 + (node.depth ?? 0) * 28}px` }}
        {...sortable.attributes}
      >
        <button
          className={`collapse-button ${node.depth ? "nested-collapse" : ""}`}
          type="button"
          onClick={() => toggleNode(node.id)}
          aria-label={isExpanded ? "折叠节点" : "展开节点"}
        >
          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button
          ref={sortable.setActivatorNodeRef}
          className={`node-bullet ${node.kind === "date" ? "date-bullet" : ""} ${children.length > 0 && !isExpanded ? "has-collapsed-children" : ""}`}
          type="button"
          onClick={() => enterNode(node.id)}
          {...sortable.listeners}
          aria-label="进入节点，按住拖拽"
        >
          {node.kind === "date" ? <Circle className="node-dot" size={9} fill="currentColor" /> : <Circle className="node-dot" size={7} fill="currentColor" strokeWidth={2.5} />}
        </button>
        <div className="node-content">
          {node.kind !== "date" ? <InlineEditor nodeId={node.id} value={node.markdown} /> : <div className="date-content">{node.dateKey}</div>}
        </div>
        {node.kind !== "date" && <><label className="row-attachment" aria-label="添加附件"><Paperclip size={14} /><input type="file" accept="image/*,.pdf,.txt,.md,.doc,.docx,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addAttachment(node.id, file); event.currentTarget.value = ""; }} /></label></>}
      </div>
      {isExpanded && children.length === 0 && <GhostRow droppableId={`ghost:child:${node.id}`} parentId={node.id} depth={(node.depth ?? 0) + 1} />}
    </>
  );
}

export function GhostRow({ droppableId, parentId, depth }: { droppableId: string; parentId: string; depth: number }) {
  const droppable = useDroppable({ id: droppableId });
  return (
    <div
      ref={droppable.setNodeRef}
      data-tree-row="true"
      data-depth={depth}
      data-ghost-row="true"
      className={`tree-row ghost-child ${droppable.isOver ? "is-over" : ""}`}
      style={{ paddingLeft: `${16 + depth * 28}px` }}
    >
      <span className="collapse-button ghost-collapse" />
      <span className="node-bullet ghost-bullet">
        <Circle className="node-dot" size={7} fill="currentColor" strokeWidth={2.5} />
      </span>
      <div className="node-content">
        <GhostEditor parentId={parentId} />
      </div>
    </div>
  );
}
