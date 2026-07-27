import type { TreeDropSlot } from "../../../domain/dropSlots";
import { TREE_LEVEL_INDENT } from "../../../shared/treeLayout";

export interface DropRowRect {
  top: number;
  bottom: number;
}

export interface DropSlotLayout extends TreeDropSlot {
  top: number;
  left: number;
}

export interface DropSlotLayoutOptions {
  baseLeft?: number;
  indent?: number;
  anchorsByDepth?: ReadonlyMap<number, number>;
}

export function pointerYFromTranslatedRect(
  rect: DropRowRect,
  containerTop: number,
  pointerOffset: number | null,
): number {
  const offset = pointerOffset ?? (rect.bottom - rect.top) / 2;
  return rect.top + offset - containerTop;
}

/** Places semantic slots in the small vertical gaps between visible rows. */
export function layoutDropSlots(
  slots: readonly TreeDropSlot[],
  rows: ReadonlyMap<string, DropRowRect>,
  endY: number,
  options: DropSlotLayoutOptions = {},
): DropSlotLayout[] {
  const { baseLeft = 52, indent = TREE_LEVEL_INDENT, anchorsByDepth } = options;
  const leftForDepth = (depth: number) => anchorsByDepth?.get(depth) ?? baseLeft + depth * indent;
  const firstSlot = slots.find((slot) => slot.afterNodeId === null);
  const layouts: DropSlotLayout[] = [];
  if (firstSlot?.beforeId) {
    const firstRect = rows.get(firstSlot.beforeId);
    if (firstRect) {
      layouts.push({ ...firstSlot, top: firstRect.top / 2, left: leftForDepth(firstSlot.depth) });
    }
  }

  const groups = new Map<string, TreeDropSlot[]>();
  for (const slot of slots) {
    if (slot.afterNodeId === null) continue;
    const group = groups.get(slot.afterNodeId) ?? [];
    group.push(slot);
    groups.set(slot.afterNodeId, group);
  }

  for (const [afterNodeId, group] of groups) {
    const currentRect = rows.get(afterNodeId);
    if (!currentRect) continue;
    const nextNodeId = group[0].nextNodeId;
    const nextTop = nextNodeId ? (rows.get(nextNodeId)?.top ?? endY) : endY;
    const gapTop = currentRect.bottom;
    const gapHeight = Math.max(0, nextTop - gapTop);
    group.forEach((slot, index) => {
      // Each semantic choice gets the center of its own measured portion of
      // the space between the neighboring layout objects.
      const top = gapHeight === 0
        ? gapTop
        : gapTop + gapHeight * ((index + 0.5) / group.length);
      layouts.push({ ...slot, top, left: leftForDepth(slot.depth) });
    });
  }

  return layouts.sort((a, b) => a.top - b.top || a.depth - b.depth);
}

export function closestDropSlot(
  layouts: readonly DropSlotLayout[],
  pointerY: number,
  tolerance = 28,
): DropSlotLayout | null {
  let closest: DropSlotLayout | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const layout of layouts) {
    const nextDistance = Math.abs(layout.top - pointerY);
    if (nextDistance < distance) {
      closest = layout;
      distance = nextDistance;
    }
  }
  return distance <= tolerance ? closest : null;
}
