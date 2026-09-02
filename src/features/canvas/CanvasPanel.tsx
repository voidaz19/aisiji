import { Grid2X2, Plus, X } from "lucide-react";
import type { NodeRecord } from "../../domain/model";
import { CANVAS_SUPERTAG_ID } from "../../domain/supertags";
import { buildChildIndex, childrenOf } from "../../domain/tree";
import { useNotebookStore } from "../../store/useNotebookStore";
import { CanvasCardGrid } from "./CanvasCardGrid";

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
    <div className="canvas-panel" aria-label={`${root.markdown || "未命名节点"} Canvas`}>
      <header className="canvas-header">
        <div>
          <p className="eyebrow">Supertag</p>
          <div className="canvas-title-row"><Grid2X2 size={20} aria-hidden="true" /><h1>{root.markdown || "未命名 Canvas"}</h1></div>
          <p className="canvas-summary">{cards.length} 个节点</p>
        </div>
        <div className="canvas-actions">
          <button className="subtle-button" type="button" onClick={() => createChild(root.id, "")}><Plus size={16} />新建节点</button>
          <button className="icon-button" type="button" title="移除 Canvas 标签" aria-label="移除 Canvas 标签" onClick={() => removeSupertag(root.id, CANVAS_SUPERTAG_ID)}><X size={17} /></button>
        </div>
      </header>
      {cards.length ? (
        <CanvasCardGrid cards={cards} label={`${root.markdown || "未命名节点"} 的节点`} />
      ) : (
        <div className="canvas-empty">
          <Grid2X2 size={28} aria-hidden="true" />
          <p>Canvas 还没有节点</p>
          <button className="subtle-button" type="button" onClick={() => createChild(root.id, "")}><Plus size={16} />新建节点</button>
        </div>
      )}
    </div>
  );
}
