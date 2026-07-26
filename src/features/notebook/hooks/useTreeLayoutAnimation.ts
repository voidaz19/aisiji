import { useLayoutEffect, useRef, type RefObject } from "react";

interface RowSnapshot {
  id: string;
  depth: number;
  top: number;
  left: number;
}

export const TREE_LAYOUT_ANIMATION_DURATION = 100;
const ANIMATION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Animates rows between two tree layouts using the FLIP technique. */
export function useTreeLayoutAnimation(
  containerRef: RefObject<HTMLDivElement | null>,
  dependencies: readonly unknown[],
): void {
  const previousRows = useRef<Map<string, RowSnapshot>>(new Map());
  const animations = useRef<Map<string, Animation>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const captureStableBaseline = () => {
      // CodeMirror mounts its editor DOM in a regular effect. Capture a new
      // baseline after that pass whenever rows are added or removed.
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

    const currentIds = rows.map((row) => row.dataset.nodeId).filter((id): id is string => Boolean(id));
    const sameNodeSet = previous.size === currentRows.size && currentIds.every((id) => previous.has(id));
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();

    if (!sameNodeSet) {
      return captureStableBaseline();
    }

    const structureChanged = rows.some((row, index) => {
      const id = row.dataset.nodeId;
      if (!id) return false;
      const snapshot = previous.get(id);
      const current = currentRows.get(id);
      const previousId = Array.from(previous.values())[index]?.id;
      return !snapshot || !current || snapshot.depth !== current.depth || previousId !== id;
    });

    if (structureChanged && !prefersReducedMotion()) {
      rows.forEach((row) => {
        const id = row.dataset.nodeId;
        if (!id) return;
        const before = previous.get(id);
        const after = currentRows.get(id);
        if (!before || !after) return;
        const deltaX = before.left - after.left;
        const deltaY = before.top - after.top;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
        if (typeof row.animate !== "function") return;
        const animation = row.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: TREE_LAYOUT_ANIMATION_DURATION, easing: ANIMATION_EASING, fill: "both" },
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
}

function measureRows(container: HTMLDivElement): { rows: HTMLElement[]; currentRows: Map<string, RowSnapshot> } {
  const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-node-id]"));
  const currentRows = new Map<string, RowSnapshot>();
  rows.forEach((row) => {
    const id = row.dataset.nodeId;
    if (!id) return;
    const rect = row.getBoundingClientRect();
    const bullet = row.querySelector<HTMLElement>(".node-bullet")?.getBoundingClientRect();
    currentRows.set(id, {
      id,
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
