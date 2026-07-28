/** Finds the visible tree block that owns a point, including its layout gap. */
export function treeBlockAtPoint(
  treeList: HTMLElement | null,
  clientX: number,
  clientY: number,
  allowOutsideHorizontal = false,
  assignGapToNearest = false,
): HTMLElement | null {
  if (!treeList) return null;
  const listRect = treeList.getBoundingClientRect();
  if ((!allowOutsideHorizontal && (clientX < listRect.left || clientX > listRect.right))
    || clientY < listRect.top || clientY > listRect.bottom) return null;

  const rows = Array.from(treeList.querySelectorAll<HTMLElement>("[data-tree-block-key]"));
  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    const marginBottom = Math.max(0, Number.parseFloat(getComputedStyle(row).marginBottom) || 0);
    const ownedBottom = rect.bottom + marginBottom;
    if (clientY >= rect.top && clientY <= rect.bottom) return row;
    if (!assignGapToNearest && clientY <= ownedBottom && clientY >= rect.bottom) return row;

    const distanceBottom = assignGapToNearest ? rect.bottom : ownedBottom;
    const distance = clientY < rect.top ? rect.top - clientY : clientY - distanceBottom;
    if (distance < nearestDistance) {
      nearest = row;
      nearestDistance = distance;
    }
  }
  if (!nearest) return null;
  const first = rows[0]?.getBoundingClientRect();
  const last = rows[rows.length - 1]?.getBoundingClientRect();
  const lastMargin = rows.length > 0
    ? Math.max(0, Number.parseFloat(getComputedStyle(rows[rows.length - 1]).marginBottom) || 0)
    : 0;
  if (!first || !last || clientY < first.top || clientY > last.bottom + lastMargin) return null;
  return nearest;
}
