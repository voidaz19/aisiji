import type { CSSProperties } from "react";

export interface DragPreviewRowLayout {
  rowStyle: CSSProperties;
  textStyle: CSSProperties;
}

export interface DragPreviewLayout {
  width: number;
  rows: ReadonlyMap<string, DragPreviewRowLayout>;
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
        paddingLeft: rowStyle.paddingLeft,
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
