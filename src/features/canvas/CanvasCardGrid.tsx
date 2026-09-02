import { InlineEditor } from "../../components/InlineEditor";
import type { NodeRecord } from "../../domain/model";
import { useNotebookStore } from "../../store/useNotebookStore";

export interface CanvasCardItem {
  node: NodeRecord;
  childCount: number;
}

interface Props {
  cards: readonly CanvasCardItem[];
  local?: boolean;
  label: string;
}

/** Shared card surface for both root-level and tree-local Canvas presentations. */
export function CanvasCardGrid({ cards, local = false, label }: Props) {
  const openRoot = useNotebookStore((state) => state.openRoot);

  return (
    <div className={`canvas-grid ${local ? "is-local" : ""}`} role="group" aria-label={label}>
      {cards.map(({ node, childCount }) => (
        <article key={node.id} className="canvas-card" data-canvas-card-id={node.id}>
          <button className="canvas-card-open" type="button" onClick={() => openRoot(node.id)} aria-label={`打开 ${node.markdown || "未命名节点"}`} />
          <InlineEditor nodeId={node.id} value={node.markdown} />
          <span className="canvas-card-meta">{childCount} 个子节点</span>
        </article>
      ))}
    </div>
  );
}
