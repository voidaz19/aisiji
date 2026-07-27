import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion, type TreeLayoutMotion } from "./useTreeLayoutAnimation";
import { hierarchyGuideVerticalRange, stableRowLayoutCoordinate } from "../model/hierarchyGuideLayout";
import { subtreeBottomInset } from "../model/subtreeLayout";
import { TREE_LAYOUT_ANIMATION_DURATION, treeLayoutMotionProgress } from "../model/treeLayoutMotion";

export interface GuideLine {
  id: string;
  x: number;
  y1: number;
  y2: number;
  opacity?: number;
}

interface MeasuredRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface GuideEntry {
  row: HTMLElement;
  id: string;
  parentId: string;
  depth: number;
  placeholder: boolean;
  measured: ReturnType<typeof visualObjectRect>;
}

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

function visualObjectRect(row: HTMLElement, containerTop: number): { dotObject: MeasuredRect; object: MeasuredRect; multiline: boolean } | null {
  const rowVisualTop = row.getBoundingClientRect().top;
  const stableY = (coordinate: number) => stableRowLayoutCoordinate(coordinate, rowVisualTop, containerTop, row.offsetTop);
  const dot = row.querySelector<HTMLElement>(".node-bullet .node-dot")?.getBoundingClientRect();
  if (!dot) return null;
  const rects: MeasuredRect[] = [{ top: stableY(dot.top), right: dot.right, bottom: stableY(dot.bottom), left: dot.left }];
  const contentLineTops = new Set<number>();
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
          contentLineTops.add(Math.round(rangeRect.top));
          rects.push({ top: stableY(rangeRect.top), right: rangeRect.right, bottom: stableY(rangeRect.bottom), left: rangeRect.left });
        }
      }
      range.detach();
    }
    for (const media of Array.from(
      visualContent.querySelectorAll<HTMLElement>("img, input, .attachment-chip, .attachment-image"),
    )) {
      const mediaRect = media.getBoundingClientRect();
      if (mediaRect.width > 0 && mediaRect.height > 0) {
        rects.push({ top: stableY(mediaRect.top), right: mediaRect.right, bottom: stableY(mediaRect.bottom), left: mediaRect.left });
      }
    }
    if (rects.length === 1) {
      const fallback = visualContent.querySelector<HTMLElement>(".cm-line")?.getBoundingClientRect()
        ?? visualContent.getBoundingClientRect();
      if (fallback.width > 0 && fallback.height > 0) {
        rects.push({ top: stableY(fallback.top), right: fallback.right, bottom: stableY(fallback.bottom), left: fallback.left });
      }
    }
  }
  const visualBounds = unionRects(rects);
  if (!visualBounds) return null;
  const lineElements = Array.from(visualContent?.querySelectorAll<HTMLElement>(".cm-line") ?? []);
  const lineHeight = lineElements[0]
    ? Number.parseFloat(getComputedStyle(lineElements[0]).lineHeight)
    : Number.NaN;
  const wrappedLine = lineElements.some((line) => (
    Number.isFinite(lineHeight) && line.getBoundingClientRect().height > lineHeight * 1.25
  ));
  const dotCenter = (stableY(dot.top) + stableY(dot.bottom)) / 2;
  const objectHeight = Math.max(GUIDE_OBJECT_HEIGHT, visualBounds.bottom - visualBounds.top);
  const objectCenter = (visualBounds.top + visualBounds.bottom) / 2;
  return {
    dotObject: {
      top: dotCenter - GUIDE_OBJECT_HEIGHT / 2,
      right: dot.right,
      bottom: dotCenter + GUIDE_OBJECT_HEIGHT / 2,
      left: dot.left,
    },
    multiline: contentLineTops.size > 1 || lineElements.length > 1 || wrappedLine,
    object: {
      top: objectCenter - objectHeight / 2,
      right: visualBounds.right,
      bottom: objectCenter + objectHeight / 2,
      left: visualBounds.left,
    },
  };
}

export function useHierarchyGuides(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  dependencies: readonly unknown[],
  treeMotion: RefObject<TreeLayoutMotion | null>,
): GuideLine[] {
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);
  const displayedLines = useRef<GuideLine[]>([]);
  const animationFrame = useRef<number | null>(null);
  const hasBaseline = useRef(false);

  const updateGuideLines = (next: GuideLine[]) => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    const activeMotion = treeMotion.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const sharesActiveTreeMotion = activeMotion !== null && now - activeMotion.startedAt <= TREE_LAYOUT_ANIMATION_DURATION;
    if (!sharesActiveTreeMotion || !hasBaseline.current || prefersReducedMotion() || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      displayedLines.current = next;
      hasBaseline.current = true;
      setGuideLines(next);
      return;
    }

    const from = new Map(displayedLines.current.map((line) => [line.id, line]));
    const to = new Map(next.map((line) => [line.id, line]));
    const ids = new Set([...from.keys(), ...to.keys()]);
    const start = activeMotion.startedAt;

    const tick = (now: number) => {
      const linearProgress = Math.min(1, Math.max(0, (now - start) / TREE_LAYOUT_ANIMATION_DURATION));
      const progress = treeLayoutMotionProgress(linearProgress);
      const frame = Array.from(ids).flatMap((id) => {
        const before = from.get(id);
        const after = to.get(id);
        const origin = before ?? after;
        if (!origin) return [];
        const target = after ?? origin;
        const opacity = (before ? 1 : 0) + ((after ? 1 : 0) - (before ? 1 : 0)) * progress;
        if (opacity <= 0.01) return [];
        return [{
          id,
          x: origin.x + (target.x - origin.x) * progress,
          y1: origin.y1 + (target.y1 - origin.y1) * progress,
          y2: origin.y2 + (target.y2 - origin.y2) * progress,
          opacity,
        }];
      });
      displayedLines.current = frame;
      setGuideLines(frame);
      if (progress < 1) {
        animationFrame.current = window.requestAnimationFrame(tick);
      } else {
        displayedLines.current = next;
        setGuideLines(next);
        animationFrame.current = null;
      }
    };

    animationFrame.current = window.requestAnimationFrame(tick);
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      displayedLines.current = [];
      hasBaseline.current = false;
      setGuideLines([]);
      return;
    }
    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const subtreeEdge = Number.parseFloat(getComputedStyle(container).getPropertyValue("--tree-subtree-gap")) || 0;
      const entries: GuideEntry[] = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-row='true']"))
        .map((row, index) => {
          const parentId = row.dataset.parentId ?? "root";
          return {
            row,
            id: row.dataset.treeBlockKey ?? `row:${index}`,
            parentId,
            depth: Number(row.dataset.depth ?? 0),
            placeholder: row.dataset.treeBlockKind === "placeholder",
            measured: visualObjectRect(row, containerRect.top),
          };
        });
      const lines: GuideLine[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry.placeholder || !entry.measured) continue;
        const firstChild = findFirstChild(entries, index, entry);
        if (!firstChild) continue;
        let lastDescendant = index + 1;
        for (let cursor = index + 1; cursor < entries.length; cursor += 1) {
          const candidate = entries[cursor];
          if (candidate.depth < entry.depth) break;
          if (candidate.depth === entry.depth) {
            break;
          }
          lastDescendant = cursor;
        }
        const endEntry = entries[lastDescendant];
        if (!endEntry) continue;
        const endRowBottom = containerRect.top + endEntry.row.offsetTop + endEntry.row.offsetHeight;
        const startBottom = entry.measured.multiline ? entry.measured.dotObject.bottom : entry.measured.object.bottom;
        const { y1, y2 } = hierarchyGuideVerticalRange({
          parentBottom: startBottom,
          subtreeBottom: endRowBottom + subtreeBottomInset(entry.depth, endEntry.depth, subtreeEdge),
          containerTop: containerRect.top,
        });
        if (y2 <= y1) continue;
        const x = layoutGuideAnchor(entry.row, container);
        if (x === null) continue;
        lines.push({ id: entry.id, x, y1, y2 });
      }
      updateGuideLines(lines);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    container.querySelectorAll<HTMLElement>("[data-tree-row='true']").forEach((row) => observer?.observe(row));
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
    // The caller owns the semantic dependencies that require remeasurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, enabled, ...dependencies]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  return guideLines;
}

function findFirstChild(entries: readonly GuideEntry[], index: number, entry: GuideEntry): GuideEntry | undefined {
  for (let cursor = index + 1; cursor < entries.length; cursor += 1) {
    const candidate = entries[cursor];
    if (candidate.depth <= entry.depth) break;
    if (candidate.depth === entry.depth + 1 && candidate.parentId === entry.id) return candidate;
  }
  return undefined;
}

function layoutGuideAnchor(row: HTMLElement, container: HTMLElement): number | null {
  const bullet = row.querySelector<HTMLElement>(".node-bullet");
  if (!bullet) return null;
  // Layout offsets ignore the temporary FLIP transform applied while a node
  // changes indentation.
  return row.offsetLeft + bullet.offsetLeft + bullet.offsetWidth / 2 - container.scrollLeft;
}
