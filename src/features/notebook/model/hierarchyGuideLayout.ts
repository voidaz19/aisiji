// Both ends are measured against the current subtree itself. Keeping one
// shared inset prevents sibling spacing from changing the guide geometry.
export const GUIDE_EDGE_INSET = 3;

/** Converts an animated viewport coordinate back into its stable row layout coordinate. */
export function stableRowLayoutCoordinate(
  visualCoordinate: number,
  rowVisualTop: number,
  containerTop: number,
  rowOffsetTop: number,
): number {
  return containerTop + rowOffsetTop + visualCoordinate - rowVisualTop;
}

interface HierarchyGuideVerticalRangeInput {
  parentBottom: number;
  subtreeBottom: number;
  containerTop: number;
}

export function hierarchyGuideVerticalRange({
  parentBottom,
  subtreeBottom,
  containerTop,
}: HierarchyGuideVerticalRangeInput): { y1: number; y2: number } {
  return {
    y1: parentBottom - containerTop + GUIDE_EDGE_INSET,
    y2: subtreeBottom - containerTop - GUIDE_EDGE_INSET,
  };
}
