import { Grid2X2, Plus } from "lucide-react";
import type { NodeRecord } from "../../domain/model";
import { buildChildIndex, childrenOf } from "../../domain/tree";
import { useNotebookStore } from "../../store/useNotebookStore";
import { CanvasCardGrid } from "./CanvasCardGrid";
import { SupertagChips } from "../../components/SupertagChip";

interface Props {
  root: NodeRecord;
}

/** Renders a Canvas-tagged node as a deterministic grid of its direct tree children. */
export function CanvasPanel({ root }: Props) {
  const nodes = useNotebookStore((state) => state.nodes);
  const createChild = useNotebookStore((state) => state.createChild);
  const removeSupertag = useNotebookStore((state) => state.removeSupertag);
  const childIndex = buildChildIndex({ nodes });
  const cards = childrenOf({ nodes }, root.id)
    .filter((node) => node.kind === "content")
    .map((node) => ({ node, childCount: childIndex.get(node.id)?.length ?? 0 }));

  return (
    <div className="canvas-panel" aria-label={`${root.markdown || "未命名节点"} 卡片视图`}>
      <header className="canvas-header">
        <div>
          <p className="eyebrow">Supertag</p>
          <div className="canvas-title-row"><Grid2X2 size={20} aria-hidden="true" /><h1>{root.markdown || "未命名卡片视图"}</h1><SupertagChips supertagIds={root.supertagIds} onRemove={(supertagId) => removeSupertag(root.id, supertagId)} /></div>
          <p className="canvas-summary">{cards.length} 个节点</p>
        </div>
        <div className="canvas-actions">
          <button className="subtle-button" type="button" onClick={() => createChild(root.id, "")}><Plus size={16} />新建节点</button>
        </div>
      </header>
      {cards.length ? (
        <CanvasCardGrid cards={cards} label={`${root.markdown || "未命名节点"} 的节点`} />
      ) : (
        <div className="canvas-empty">
          <Grid2X2 size={28} aria-hidden="true" />
          <p>卡片视图还没有节点</p>
          <button className="subtle-button" type="button" onClick={() => createChild(root.id, "")}><Plus size={16} />新建节点</button>
        </div>
      )}
    </div>
  );
}
