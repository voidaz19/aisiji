import { memo, type CSSProperties, type ReactNode, type RefCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Circle } from "lucide-react";
import { useNotebookStore } from "../store/useNotebookStore";
import { TREE_COLLAPSE_WIDTH, TREE_LEVEL_INDENT, TREE_ROW_LEFT_PADDING, TREE_SUBTREE_GAP, type TreeLayoutGap } from "../shared/treeLayout";
import { markAppPerformance } from "../shared/performanceProbe";
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
  readOnly?: boolean;
  virtualIndex?: number;
  virtualTop?: number;
  measureRef?: RefCallback<HTMLElement>;
  navigationPreviousKey?: string;
  navigationNextKey?: string;
  supplement?: ReactNode;
}

type SortableBehavior = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "isDragging" | "listeners" | "setActivatorNodeRef" | "setNodeRef" | "transform" | "transition"
>;

export const TreeBlockRow = memo(function TreeBlockRow(props: Props) {
  markAppPerformance("tree-row:render");
  if (props.block.kind === "placeholder") {
    return <TreeBlockFrame {...props} />;
  }
  if (props.dragDisabled) {
    return <TreeBlockFrame {...props} block={props.block} />;
  }
  return <SortableTreeBlockRow {...props} block={props.block} />;
}, treeBlockRowPropsEqual);

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
  readOnly = false,
  sortable,
  virtualIndex,
  virtualTop,
  measureRef,
  navigationPreviousKey,
  navigationNextKey,
  supplement,
}: Props & { sortable?: SortableBehavior }) {
  const collapsed = useNotebookStore((state) => block.kind === "node" ? state.collapsed[block.node.id] : undefined);
  const toggleNode = useNotebookStore((state) => state.toggleNode);
  const enterNode = useNotebookStore((state) => state.enterNode);
  const node = block.kind === "node" ? block.node : null;
  const hasChildren = block.kind === "node" && block.hasChildren;
  const isExpanded = node ? collapsed === false || (collapsed === undefined && hasChildren) : false;
  const isEmptyContent = node?.kind === "content" && node.markdown.trim().length === 0;
  const className = [
    "tree-row",
    virtualTop !== undefined ? "is-virtual-row" : "",
    block.kind === "placeholder" ? "ghost-child" : "",
    supplement ? "has-supplement" : "",
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
    ...(virtualTop !== undefined ? { top: virtualTop, width: "100%" } : {}),
  } as CSSProperties;

  const setRowRef = (element: HTMLElement | null) => {
    sortable?.setNodeRef(element);
    measureRef?.(element);
  };
  return (
    <div
      ref={setRowRef}
      data-index={virtualIndex}
      data-navigation-previous-key={navigationPreviousKey}
      data-navigation-next-key={navigationNextKey}
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
          className={`node-bullet ${node.kind === "date" ? "date-bullet" : ""} ${isEmptyContent ? "empty-node-bullet" : ""} ${hasChildren && !isExpanded ? "has-collapsed-children" : ""}`}
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
            ? readOnly
              ? <div className="node-readonly">{node.markdown || "未命名节点"}</div>
              : <InlineEditor nodeId={node.id} value={node.markdown} />
            : <div className="date-content">{node.dateKey}</div>
          : <GhostEditor parentId={block.parentId} />}
      </div>
      {supplement ? <div className="tree-row-supplement">{supplement}</div> : null}
    </div>
  );
}

function treeBlockRowPropsEqual(previous: Props, next: Props): boolean {
  if (
    previous.selected !== next.selected
    || previous.hasSubtreeSelection !== next.hasSubtreeSelection
    || previous.dragDisabled !== next.dragDisabled
    || previous.layoutGap !== next.layoutGap
    || previous.subtreeExitCount !== next.subtreeExitCount
    || previous.sourcePlaceholder !== next.sourcePlaceholder
    || previous.emptyDropTarget !== next.emptyDropTarget
    || previous.readOnly !== next.readOnly
    || previous.virtualIndex !== next.virtualIndex
    || previous.virtualTop !== next.virtualTop
    || previous.measureRef !== next.measureRef
    || previous.navigationPreviousKey !== next.navigationPreviousKey
    || previous.navigationNextKey !== next.navigationNextKey
    || previous.supplement !== next.supplement
    || previous.block.kind !== next.block.kind
    || previous.block.key !== next.block.key
    || previous.block.parentId !== next.block.parentId
    || previous.block.depth !== next.block.depth
  ) return false;
  if (previous.block.kind === "placeholder" || next.block.kind === "placeholder") return true;
  return previous.block.hasChildren === next.block.hasChildren
    && previous.block.node.revision === next.block.node.revision
    && previous.block.node.deletedAt === next.block.node.deletedAt
    && previous.block.node.kind === next.block.node.kind
    && previous.block.node.markdown === next.block.node.markdown
    && previous.block.node.dateKey === next.block.node.dateKey;
}
