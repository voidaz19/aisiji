import { useLayoutEffect, useState, type RefObject } from "react";

export interface GuideLine {
  id: string;
  x: number;
  y1: number;
  y2: number;
}

interface MeasuredRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const GUIDE_GAP = 8;
const GUIDE_OBJECT_HEIGHT = 24;

function unionRects(rects: MeasuredRect[]): MeasuredRect | null {
  if (!rects.length) return null;
  return {
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
    left: Math.min(...rects.map((rect) => rect.left)),
  };
}

function visualObjectRect(row: HTMLElement): { dot: DOMRect; object: MeasuredRect } | null {
  const dot = row.querySelector<HTMLElement>(".node-bullet .node-dot")?.getBoundingClientRect();
  if (!dot) return null;
  const rects: MeasuredRect[] = [{ top: dot.top, right: dot.right, bottom: dot.bottom, left: dot.left }];
  const visualContent = row.querySelector<HTMLElement>(".node-content .inline-editor");
  if (visualContent) {
    const textWalker = document.createTreeWalker(visualContent, NodeFilter.SHOW_TEXT);
    let textNode: Node | null;
    while ((textNode = textWalker.nextNode())) {
      if (!textNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      for (const rangeRect of Array.from(range.getClientRects())) {
        if (rangeRect.width > 0 && rangeRect.height > 0) {
          rects.push({ top: rangeRect.top, right: rangeRect.right, bottom: rangeRect.bottom, left: rangeRect.left });
        }
      }
      range.detach();
    }
    for (const media of Array.from(
      visualContent.querySelectorAll<HTMLElement>("img, input, .attachment-chip, .attachment-image"),
    )) {
      const mediaRect = media.getBoundingClientRect();
      if (mediaRect.width > 0 && mediaRect.height > 0) {
        rects.push({ top: mediaRect.top, right: mediaRect.right, bottom: mediaRect.bottom, left: mediaRect.left });
      }
    }
    if (rects.length === 1) {
      const fallback = visualContent.querySelector<HTMLElement>(".cm-line")?.getBoundingClientRect()
        ?? visualContent.getBoundingClientRect();
      if (fallback.width > 0 && fallback.height > 0) {
        rects.push({ top: fallback.top, right: fallback.right, bottom: fallback.bottom, left: fallback.left });
      }
    }
  }
  const visualBounds = unionRects(rects);
  if (!visualBounds) return null;
  const rowBox = row.getBoundingClientRect();
  const height = Math.max(GUIDE_OBJECT_HEIGHT, visualBounds.bottom - visualBounds.top);
  const center = (rowBox.top + rowBox.bottom) / 2;
  return {
    dot,
    object: {
      top: center - height / 2,
      right: visualBounds.right,
      bottom: center + height / 2,
      left: visualBounds.left,
    },
  };
}

export function useHierarchyGuides(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  dependencies: readonly unknown[],
): GuideLine[] {
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      setGuideLines([]);
      return;
    }
    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const entries = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-row='true']")).map((row) => ({
        row,
        depth: Number(row.dataset.depth ?? 0),
        ghost: row.dataset.ghostRow === "true",
        measured: visualObjectRect(row),
      }));
      const lines: GuideLine[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry.ghost || !entry.measured) continue;
        const firstChild = entries[index + 1];
        if (!firstChild || firstChild.depth <= entry.depth) continue;
        let lastDescendant = index + 1;
        let nextSibling: typeof entries[number] | undefined;
        for (let cursor = index + 1; cursor < entries.length; cursor += 1) {
          const candidate = entries[cursor];
          if (candidate.depth < entry.depth) break;
          if (candidate.depth === entry.depth) {
            nextSibling = candidate;
            break;
          }
          lastDescendant = cursor;
        }
        const endObject = nextSibling?.measured?.object ?? entries[lastDescendant]?.measured?.object;
        if (!endObject) continue;
        const y1 = entry.measured.object.bottom - containerRect.top + GUIDE_GAP;
        const y2 = nextSibling
          ? endObject.top - containerRect.top - GUIDE_GAP
          : endObject.bottom - containerRect.top + GUIDE_GAP;
        if (y2 <= y1) continue;
        const x = entry.measured.dot.left + entry.measured.dot.width / 2 - containerRect.left;
        lines.push({ id: entry.row.dataset.nodeId ?? `line-${index}`, x, y1, y2 });
      }
      setGuideLines(lines);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
    // The caller owns the semantic dependencies that require remeasurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, enabled, ...dependencies]);

  return guideLines;
}
