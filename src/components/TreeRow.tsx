import { useMemo, type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Circle, Paperclip } from "lucide-react";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";
import { TREE_COLLAPSE_WIDTH, TREE_LEVEL_INDENT, TREE_ROW_LEFT_PADDING, TREE_SUBTREE_GAP, type TreeLayoutGap } from "../shared/treeLayout";
import { GhostEditor } from "./GhostEditor";
import { InlineEditor } from "./InlineEditor";
import type { TreeBlock } from "./treeBlock";

interface Props {
  block: TreeBlock;
  selected?: boolean;
  hasSubtreeSelection?: boolean;
  dragDisabled?: boolean;
  layoutGap?: TreeLayoutGap;
  subtreeExitCount?: number;
  sourcePlaceholder?: boolean;
  emptyDropTarget?: boolean;
}

type SortableBehavior = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "isDragging" | "listeners" | "setActivatorNodeRef" | "setNodeRef" | "transform" | "transition"
>;

export function TreeBlockRow(props: Props) {
  if (props.block.kind === "placeholder") {
    return <TreeBlockFrame {...props} />;
  }
  return <SortableTreeBlockRow {...props} block={props.block} />;
}

function SortableTreeBlockRow(props: Props & { block: Extract<TreeBlock, { kind: "node" }> }) {
  const sortable = useSortable({
    id: props.block.node.id,
    disabled: props.dragDisabled || props.block.node.kind === "date",
  });
  return <TreeBlockFrame {...props} sortable={sortable} />;
}

function TreeBlockFrame({
  block,
  selected = false,
  hasSubtreeSelection = false,
  layoutGap = "between-subtrees",
  subtreeExitCount = 0,
  sourcePlaceholder = false,
  emptyDropTarget = false,
  sortable,
}: Props & { sortable?: SortableBehavior }) {
  const nodes = useNotebookStore((state) => state.nodes);
  const collapsed = useNotebookStore((state) => block.kind === "node" ? state.collapsed[block.node.id] : undefined);
  const toggleNode = useNotebookStore((state) => state.toggleNode);
  const enterNode = useNotebookStore((state) => state.enterNode);
  const addAttachment = useNotebookStore((state) => state.addAttachment);
  const node = block.kind === "node" ? block.node : null;
  const children = useMemo(
    () => node ? childrenOf({ nodes, fields: {}, attachments: {}, collapsed: {} }, node.id) : [],
    [nodes, node],
  );
  const isExpanded = node ? collapsed === false || (collapsed === undefined && children.length > 0) : false;
  const isEmptyContent = node?.kind === "content" && node.markdown.trim().length === 0;
  const className = [
    "tree-row",
    block.kind === "placeholder" ? "ghost-child" : "",
    `layout-gap-${layoutGap}`,
    selected ? "is-node-selected" : "",
    hasSubtreeSelection ? "has-subtree-selection" : "",
    sortable?.isDragging ? "is-dragging" : "",
    sourcePlaceholder ? "is-drag-source-placeholder" : "",
    emptyDropTarget ? "is-empty-drop-target" : "",
  ].filter(Boolean).join(" ");
  const style = {
    transform: sortable?.isDragging ? undefined : CSS.Transform.toString(sortable?.transform ?? null),
    transition: sortable?.isDragging ? undefined : sortable?.transition,
    paddingLeft: `${TREE_ROW_LEFT_PADDING + block.depth * TREE_LEVEL_INDENT}px`,
    "--tree-object-left": `${TREE_ROW_LEFT_PADDING + TREE_COLLAPSE_WIDTH + block.depth * TREE_LEVEL_INDENT}px`,
    "--tree-exit-gap": `${subtreeExitCount * TREE_SUBTREE_GAP}px`,
  } as CSSProperties;

  return (
    <div
      ref={sortable?.setNodeRef}
      data-tree-row="true"
      data-tree-block-key={block.key}
      data-tree-block-kind={block.kind}
      data-node-id={node?.id}
      data-selection-key={block.key}
      data-parent-id={block.parentId}
      data-depth={block.depth}
      className={className}
      style={style}
      {...sortable?.attributes}
    >
      {node ? (
        <button
          className={`collapse-button ${block.depth ? "nested-collapse" : ""}`}
          type="button"
          onClick={() => toggleNode(node.id)}
          aria-label={isExpanded ? "折叠节点" : "展开节点"}
        >
          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      ) : <span className="collapse-button ghost-collapse" />}

      {node ? (
        <button
          ref={sortable?.setActivatorNodeRef}
          className={`node-bullet ${node.kind === "date" ? "date-bullet" : ""} ${isEmptyContent ? "empty-node-bullet" : ""} ${children.length > 0 && !isExpanded ? "has-collapsed-children" : ""}`}
          type="button"
          onClick={() => enterNode(node.id)}
          {...sortable?.listeners}
          aria-label="进入节点，按住拖拽"
        >
          {node.kind === "date"
            ? <Circle className="node-dot" size={9} fill="currentColor" />
            : <Circle className="node-dot" size={6} fill="currentColor" strokeWidth={2.5} />}
        </button>
      ) : (
        <span className="node-bullet ghost-bullet">
          <Circle className="node-dot" size={6} fill="currentColor" strokeWidth={2.5} />
        </span>
      )}

      <div className="node-content">
        {node
          ? node.kind !== "date"
            ? <InlineEditor nodeId={node.id} value={node.markdown} />
            : <div className="date-content">{node.dateKey}</div>
          : <GhostEditor parentId={block.parentId} />}
      </div>

      {node?.kind === "content" && (
        <label className="row-attachment" aria-label="添加附件">
          <Paperclip size={14} />
          <input
            type="file"
            accept="image/*,.pdf,.txt,.md,.doc,.docx,.zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void addAttachment(node.id, file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
