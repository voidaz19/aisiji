import { useLayoutEffect, useRef, type RefObject } from "react";
import { TREE_LAYOUT_ANIMATION_DURATION, TREE_LAYOUT_ANIMATION_EASING } from "../model/treeLayoutMotion";

interface RowSnapshot {
  id: string;
  kind: "node" | "placeholder";
  depth: number;
  top: number;
  left: number;
}

export interface TreeLayoutMotion {
  id: number;
  startedAt: number;
}

/** Animates rows between two tree layouts using the FLIP technique. */
export function useTreeLayoutAnimation(
  containerRef: RefObject<HTMLDivElement | null>,
  dependencies: readonly unknown[],
): RefObject<TreeLayoutMotion | null> {
  const previousRows = useRef<Map<string, RowSnapshot>>(new Map());
  const animations = useRef<Map<string, Animation>>(new Map());
  const motion = useRef<TreeLayoutMotion | null>(null);
  const motionId = useRef(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    motion.current = null;

    const captureStableBaseline = () => {
      // Capture a stable baseline on the next frame whenever rows are added
      // or removed, after editor DOM and browser layout have settled.
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        const frame = window.requestAnimationFrame(() => {
          previousRows.current = measureRows(container).currentRows;
        });
        return () => window.cancelAnimationFrame(frame);
      }
      previousRows.current = measureRows(container).currentRows;
      return undefined;
    };

    const previous = previousRows.current;
    if (previous.size === 0) {
      return captureStableBaseline();
    }

    const { rows, currentRows } = measureRows(container);

    const previousNodeIds = Array.from(previous.values())
      .filter((row) => row.kind === "node")
      .map((row) => row.id);
    const currentNodeRows = rows.filter((row) => row.dataset.treeBlockKind === "node");
    const currentNodeIds = currentNodeRows
      .map((row) => row.dataset.treeBlockKey)
      .filter((id): id is string => Boolean(id));
    const sameNodeSet = previousNodeIds.length === currentNodeIds.length
      && currentNodeIds.every((id) => previous.has(id));
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();

    if (!sameNodeSet) {
      return captureStableBaseline();
    }

    const structureChanged = currentNodeRows.some((row, index) => {
      const id = row.dataset.treeBlockKey;
      if (!id) return false;
      const snapshot = previous.get(id);
      const current = currentRows.get(id);
      const previousId = previousNodeIds[index];
      return !snapshot || !current || snapshot.depth !== current.depth || previousId !== id;
    });

    if (structureChanged && !prefersReducedMotion()) {
      const movements = rows.flatMap((row) => {
        const id = row.dataset.treeBlockKey;
        if (!id) return [];
        const before = previous.get(id);
        const after = currentRows.get(id);
        if (!before || !after) return [];
        const deltaX = before.left - after.left;
        const deltaY = before.top - after.top;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return [];
        if (typeof row.animate !== "function") return [];
        return [{ row, id, deltaX, deltaY }];
      });
      if (movements.length > 0) {
        motionId.current += 1;
        motion.current = { id: motionId.current, startedAt: typeof performance !== "undefined" ? performance.now() : Date.now() };
      }
      movements.forEach(({ row, id, deltaX, deltaY }) => {
        const animation = row.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: TREE_LAYOUT_ANIMATION_DURATION, easing: TREE_LAYOUT_ANIMATION_EASING, fill: "both" },
        );
        animations.current.set(id, animation);
        animation.finished.then(() => {
          if (animations.current.get(id) !== animation) return;
          animations.current.delete(id);
          animation.cancel();
        }).catch(() => undefined);
      });
    }

    previousRows.current = currentRows;
  // The caller owns the semantic dependencies that represent tree layout changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, ...dependencies]);

  return motion;
}

function measureRows(container: HTMLDivElement): { rows: HTMLElement[]; currentRows: Map<string, RowSnapshot> } {
  const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
  const currentRows = new Map<string, RowSnapshot>();
  rows.forEach((row) => {
    const id = row.dataset.treeBlockKey;
    if (!id) return;
    const rect = row.getBoundingClientRect();
    const bullet = row.querySelector<HTMLElement>(".node-bullet")?.getBoundingClientRect();
    currentRows.set(id, {
      id,
      kind: row.dataset.treeBlockKind === "placeholder" ? "placeholder" : "node",
      depth: Number(row.dataset.depth ?? 0),
      top: rect.top,
      // The row spans the whole list, so its left edge never changes when
      // indentation changes. The bullet is the actual visual anchor.
      left: bullet?.left ?? rect.left,
    });
  });
  return { rows, currentRows };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
