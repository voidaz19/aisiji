import type { CSSProperties } from "react";

export interface DragPreviewGuide {
  id: string;
  x: number;
  y1: number;
  y2: number;
  opacity?: number;
}

export interface DragPreviewRowLayout {
  rowStyle: CSSProperties;
  textStyle: CSSProperties;
}

export interface DragPreviewLayout {
  width: number;
  rows: ReadonlyMap<string, DragPreviewRowLayout>;
}

/** Fades stationary dragged-subtree guides with the source row opacity. */
export function applyDragPreviewGuideOpacity(
  guides: readonly DragPreviewGuide[],
  sourceKeys: ReadonlySet<string>,
  sourceOpacity: number,
): DragPreviewGuide[] {
  const opacity = Math.max(0, Math.min(1, sourceOpacity));
  return guides.map((guide) => sourceKeys.has(guide.id)
    ? { ...guide, opacity: (guide.opacity ?? 1) * opacity }
    : guide);
}

/** Converts tree-local hierarchy lines into coordinates owned by the dragged overlay. */
export function relativeDragPreviewGuides(
  guides: readonly DragPreviewGuide[],
  blockKeys: ReadonlySet<string>,
  sourceOffset: { left: number; top: number },
): DragPreviewGuide[] {
  return guides
    .filter((guide) => blockKeys.has(guide.id))
    .map((guide) => ({
      ...guide,
      x: guide.x - sourceOffset.left,
      y1: guide.y1 - sourceOffset.top,
      y2: guide.y2 - sourceOffset.top,
    }))
    .filter((guide) => guide.y2 > 0 && guide.y2 > guide.y1);
}

/** Captures the rendered tree geometry so the lightweight overlay wraps exactly like its source rows. */
export function captureDragPreviewLayout(
  container: HTMLElement | null,
  blockKeys: readonly string[],
): DragPreviewLayout | null {
  if (!container || blockKeys.length === 0) return null;

  const rows = new Map<string, DragPreviewRowLayout>();
  let width = 0;

  for (const key of blockKeys) {
    const row = findTreeBlock(container, key);
    if (!row) continue;

    const content = row.querySelector<HTMLElement>(".node-content");
    const text = content?.querySelector<HTMLElement>(".cm-content, .date-content");
    if (!content || !text) continue;

    const rowRect = row.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const rowStyle = getComputedStyle(row);
    const textStyle = getComputedStyle(text);
    width = Math.max(width, rowRect.width);
    rows.set(key, {
      rowStyle: {
        width: `${rowRect.width}px`,
        minHeight: `${rowRect.height}px`,
        marginBottom: rowStyle.marginBottom,
      },
      textStyle: {
        width: `${contentRect.width}px`,
        minHeight: `${contentRect.height}px`,
        fontFamily: textStyle.fontFamily,
        fontSize: textStyle.fontSize,
        fontStyle: textStyle.fontStyle,
        fontWeight: textStyle.fontWeight,
        letterSpacing: textStyle.letterSpacing,
        lineHeight: textStyle.lineHeight,
        overflowWrap: textStyle.overflowWrap as CSSProperties["overflowWrap"],
        wordBreak: textStyle.wordBreak as CSSProperties["wordBreak"],
      },
    });
  }

  return width > 0 && rows.size > 0 ? { width, rows } : null;
}

function findTreeBlock(container: HTMLElement, key: string): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"))
    .find((row) => row.dataset.treeBlockKey === key) ?? null;
}
