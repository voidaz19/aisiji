import { useMemo, type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Circle, Paperclip } from "lucide-react";
import { InlineEditor } from "./InlineEditor";
import { GhostEditor } from "./GhostEditor";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";
import { ROOT_ID, type NodeRecord } from "../domain/model";
import { TREE_COLLAPSE_WIDTH, TREE_LEVEL_INDENT, TREE_ROW_LEFT_PADDING, TREE_SUBTREE_GAP, type TreeLayoutGap } from "../shared/treeLayout";

interface Props {
  node: NodeRecord & { depth?: number };
  selected?: boolean;
  hasSubtreeSelection?: boolean;
  dragDisabled?: boolean;
  layoutGap?: TreeLayoutGap;
  subtreeExitCount?: number;
}

export function TreeRow({ node, selected = false, hasSubtreeSelection = false, dragDisabled = false, layoutGap = "between-subtrees", subtreeExitCount = 0 }: Props) {
  const nodes = useNotebookStore((state) => state.nodes);
  const collapsed = useNotebookStore((state) => state.collapsed[node.id]);
  const toggleNode = useNotebookStore((state) => state.toggleNode);
  const enterNode = useNotebookStore((state) => state.enterNode);
  const addAttachment = useNotebookStore((state) => state.addAttachment);
  const children = useMemo(() => childrenOf({ nodes, fields: {}, attachments: {}, collapsed: {} }, node.id), [nodes, node.id]);
  const isExpanded = collapsed === false || (collapsed === undefined && children.length > 0);
  const isEmptyContent = node.kind === "content" && node.markdown.trim().length === 0;
  const sortable = useSortable({ id: node.id, disabled: dragDisabled || node.kind === "date" });

  return (
    <>
      <div
        ref={sortable.setNodeRef}
        data-tree-row="true"
        data-node-id={node.id}
        data-selection-key={node.id}
        data-parent-id={node.parentId ?? ROOT_ID}
        data-depth={node.depth ?? 0}
        className={`tree-row layout-gap-${layoutGap} ${selected ? "is-node-selected" : ""} ${hasSubtreeSelection ? "has-subtree-selection" : ""} ${sortable.isDragging ? "is-dragging" : ""}`}
        style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, paddingLeft: `${TREE_ROW_LEFT_PADDING + (node.depth ?? 0) * TREE_LEVEL_INDENT}px`, "--tree-object-left": `${TREE_ROW_LEFT_PADDING + TREE_COLLAPSE_WIDTH + (node.depth ?? 0) * TREE_LEVEL_INDENT}px`, "--tree-exit-gap": `${subtreeExitCount * TREE_SUBTREE_GAP}px` } as CSSProperties}
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
          className={`node-bullet ${node.kind === "date" ? "date-bullet" : ""} ${isEmptyContent ? "empty-node-bullet" : ""} ${children.length > 0 && !isExpanded ? "has-collapsed-children" : ""}`}
          type="button"
          onClick={() => enterNode(node.id)}
          {...sortable.listeners}
          aria-label="进入节点，按住拖拽"
        >
          {node.kind === "date" ? <Circle className="node-dot" size={9} fill="currentColor" /> : <Circle className="node-dot" size={6} fill="currentColor" strokeWidth={2.5} />}
        </button>
        <div className="node-content">
          {node.kind !== "date" ? <InlineEditor nodeId={node.id} value={node.markdown} /> : <div className="date-content">{node.dateKey}</div>}
        </div>
        {node.kind !== "date" && <><label className="row-attachment" aria-label="添加附件"><Paperclip size={14} /><input type="file" accept="image/*,.pdf,.txt,.md,.doc,.docx,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addAttachment(node.id, file); event.currentTarget.value = ""; }} /></label></>}
      </div>
    </>
  );
}

export function GhostRow({ droppableId, parentId, depth, selected = false, layoutGap = "between-subtrees", subtreeExitCount = 0 }: { droppableId: string; parentId: string; depth: number; selected?: boolean; layoutGap?: TreeLayoutGap; subtreeExitCount?: number }) {
  void droppableId;
  return (
    <div
      data-tree-row="true"
      data-depth={depth}
      data-ghost-row="true"
      data-selection-key={`ghost:${parentId}`}
      data-parent-id={parentId}
      className={`tree-row ghost-child layout-gap-${layoutGap} ${selected ? "is-node-selected" : ""}`}
      style={{ paddingLeft: `${TREE_ROW_LEFT_PADDING + depth * TREE_LEVEL_INDENT}px`, "--tree-object-left": `${TREE_ROW_LEFT_PADDING + TREE_COLLAPSE_WIDTH + depth * TREE_LEVEL_INDENT}px`, "--tree-exit-gap": `${subtreeExitCount * TREE_SUBTREE_GAP}px` } as CSSProperties}
    >
      <span className="collapse-button ghost-collapse" />
      <span className="node-bullet ghost-bullet">
        <Circle className="node-dot" size={6} fill="currentColor" strokeWidth={2.5} />
      </span>
      <div className="node-content">
        <GhostEditor parentId={parentId} />
      </div>
    </div>
  );
}
