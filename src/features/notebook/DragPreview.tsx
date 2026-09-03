import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { editorTheme } from "../../components/editorTheme";
import { createMarkdownEditorExtensions } from "../../components/markdown/markdownEditor";
import type { DragPreviewItem } from "./model/dragPreview";
import type { DragPreviewGuide, DragPreviewLayout } from "./dragPreviewLayout";
import { TREE_LEVEL_INDENT, TREE_ROW_LEFT_PADDING, TREE_SUBTREE_GAP } from "../../shared/treeLayout";
import { visibleLayoutGap, visibleSubtreeExitCount } from "./model/subtreeLayout";

export interface DragPreviewCanvasCard {
  node: DragPreviewItem["node"];
  childCount: number;
}

interface Props {
  items: readonly DragPreviewItem[];
  layout: DragPreviewLayout | null;
  canvasCardsByNodeId?: ReadonlyMap<string, readonly DragPreviewCanvasCard[]>;
  guides?: readonly DragPreviewGuide[];
}

/** Renders the dragged subtree with the same Markdown preview as its source editor. */
export function DragPreview({ items, layout, canvasCardsByNodeId, guides = [] }: Props) {
  const nodes = items.map(({ node }) => node);
  const rootDepth = nodes[0]?.depth ?? 0;
  return (
    <div className="drag-preview" aria-hidden="true" style={layout ? { width: layout.width } : undefined}>
      {guides.length > 0 && (
        <svg className="drag-preview-guides" aria-hidden="true">
          {guides.map((guide) => (
            <path
              key={guide.id}
              className="hierarchy-line"
              d={`M ${guide.x} ${guide.y1} V ${guide.y2}`}
              style={{ opacity: guide.opacity ?? 1 }}
            />
          ))}
        </svg>
      )}
      {items.map(({ node, relativeDepth }, index) => (
        <div
          key={node.id}
          data-drag-preview-key={node.id}
          className={`drag-preview-row ${canvasCardsByNodeId?.has(node.id) ? "has-canvas" : ""} layout-gap-${visibleLayoutGap(nodes, index)}`}
          style={{
            ...layout?.rows.get(node.id)?.rowStyle,
            paddingLeft: `${TREE_ROW_LEFT_PADDING + (rootDepth + relativeDepth) * TREE_LEVEL_INDENT}px`,
            "--tree-exit-gap": `${visibleSubtreeExitCount(nodes, index) * TREE_SUBTREE_GAP}px`,
          } as CSSProperties}
        >
          <span className="drag-preview-collapse-space" />
          <span className="drag-preview-bullet"><span className="drag-preview-dot" /></span>
          <div className="drag-preview-text" style={layout?.rows.get(node.id)?.textStyle}>
            {node.kind === "content"
              ? <DragPreviewEditor nodeId={node.id} value={node.markdown} />
              : node.dateKey}
          </div>
          {canvasCardsByNodeId?.get(node.id) ? (
            <DragPreviewCanvasGrid cards={canvasCardsByNodeId.get(node.id)!} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DragPreviewCanvasGrid({ cards }: { cards: readonly DragPreviewCanvasCard[] }) {
  return (
    <div className="drag-preview-canvas" aria-hidden="true">
      <div className="canvas-grid is-local" role="presentation">
        {cards.map(({ node, childCount }) => (
          <article key={node.id} className="canvas-card drag-preview-canvas-card">
            <DragPreviewEditor nodeId={node.id} value={node.markdown} />
            <span className="canvas-card-meta">{childCount} 个子节点</span>
          </article>
        ))}
      </div>
    </div>
  );
}

interface DragPreviewEditorProps {
  nodeId: string;
  value: string;
}

function DragPreviewEditor({ nodeId, value }: DragPreviewEditorProps) {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...createMarkdownEditorExtensions(nodeId),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({ "aria-hidden": "true", tabindex: "-1" }),
        EditorView.lineWrapping,
        editorTheme,
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    return () => view.destroy();
  }, [nodeId, value]);

  return <div className="drag-preview-editor" ref={host} />;
}
