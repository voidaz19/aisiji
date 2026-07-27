import type { NodeRecord } from "../../../domain/model";

export type VisiblePreviewNode = NodeRecord & { depth?: number };

export interface DragPreviewItem {
  node: VisiblePreviewNode;
  relativeDepth: number;
}

/** Returns the dragged node and its currently visible descendants. */
export function visibleDragPreview(
  visibleNodes: readonly VisiblePreviewNode[],
  dragId: string,
): DragPreviewItem[] {
  const startIndex = visibleNodes.findIndex((node) => node.id === dragId);
  if (startIndex < 0) return [];

  const rootDepth = visibleNodes[startIndex].depth ?? 0;
  const preview: DragPreviewItem[] = [];

  for (let index = startIndex; index < visibleNodes.length; index += 1) {
    const node = visibleNodes[index];
    const depth = node.depth ?? 0;
    if (index > startIndex && depth <= rootDepth) break;
    preview.push({ node, relativeDepth: Math.max(0, depth - rootDepth) });
  }

  return preview;
}
