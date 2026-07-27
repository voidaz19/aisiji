import type { TreeDropSlot } from "../../../domain/dropSlots";
export interface DropRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface DropBlockRects {
  blocks: ReadonlyMap<string, DropRect>;
  subtrees: ReadonlyMap<string, DropRect>;
}

export interface DropSlotLayout extends TreeDropSlot {
  top: number;
  left: number;
  hitZone: DropRect;
}

export interface DropSlotLayoutOptions {
  lineLeftByDepth: ReadonlyMap<number, number>;
  hitLeftByDepth: ReadonlyMap<number, number>;
}

/** Places semantic slots immediately after their measured node or subtree block. */
export function layoutDropSlots(
  slots: readonly TreeDropSlot[],
  blocks: DropBlockRects,
  endY: number,
  options: DropSlotLayoutOptions,
): DropSlotLayout[] {
  const positionForDepth = (depth: number) => ({
    left: options.lineLeftByDepth.get(depth),
    hitLeft: options.hitLeftByDepth.get(depth),
  });
  const firstSlot = slots.find((slot) => slot.afterBlock === null);
  const layouts: DropSlotLayout[] = [];
  if (firstSlot?.beforeId) {
    const firstRect = fullBlock(blocks, firstSlot.beforeId);
    const { left, hitLeft } = positionForDepth(firstSlot.depth);
    if (firstRect && left !== undefined && hitLeft !== undefined) {
      layouts.push({
        ...firstSlot,
        top: firstRect.top / 2,
        left,
        hitZone: {
          ...firstRect,
          top: 0,
          bottom: centerY(firstRect),
          left: hitLeft,
        },
      });
    }
  }

  const groups = new Map<string, TreeDropSlot[]>();
  for (const slot of slots) {
    if (slot.afterBlock === null) continue;
    const groupKey = slot.nextBlockKey ?? "\u0000end";
    const group = groups.get(groupKey) ?? [];
    group.push(slot);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const nextBlockKey = group[0].nextBlockKey;
    const nextBlock = nextBlockKey ? fullBlock(blocks, nextBlockKey) : undefined;
    const nextTop = nextBlock?.top ?? endY;
    const anchored = group.flatMap((slot) => {
      const anchor = slot.afterBlock;
      if (!anchor) return [];
      const block = anchor.kind === "block"
        ? blocks.blocks.get(anchor.key)
        : blocks.subtrees.get(anchor.key);
      return block ? [{ slot, block }] : [];
    }).sort((a, b) => a.block.bottom - b.block.bottom || b.slot.depth - a.slot.depth);

    anchored.forEach(({ slot, block }, index) => {
      const { left, hitLeft } = positionForDepth(slot.depth);
      if (left === undefined || hitLeft === undefined) return;
      const nextBoundary = anchored[index + 1]?.block.bottom ?? nextTop;
      // A slot belongs to a concrete node/subtree block. Its line sits in the
      // space immediately following that block, halfway to the next boundary.
      const top = block.bottom + Math.max(0, nextBoundary - block.bottom) / 2;
      const zoneBottom = anchored[index + 1]
        ? top
        : nextBlock
          ? nextBlock.top + (nextBlock.bottom - nextBlock.top) / 2
          : endY;
      layouts.push({
        ...slot,
        top,
        left,
        hitZone: {
          ...block,
          top: centerY(block),
          bottom: Math.max(top, zoneBottom),
          left: hitLeft,
        },
      });
    });
  }

  return layouts.sort((a, b) => a.top - b.top || a.depth - b.depth);
}

export function closestDropSlot(
  layouts: readonly DropSlotLayout[],
  pointer: { x: number; y: number },
  sourceZone: DropRect | null = null,
): DropSlotLayout | null {
  if (sourceZone && pointInZone(pointer, sourceZone)) return null;
  let closest: DropSlotLayout | null = null;
  for (const slot of layouts) {
    if (!pointInZone(pointer, slot.hitZone)) continue;
    if (!closest || slotWins(slot, closest, pointer.y)) closest = slot;
  }
  return closest && !closest.isNoop ? closest : null;
}

/** One debug rectangle covering the source block and its adjacent no-op slots. */
export function noMoveZone(layouts: readonly DropSlotLayout[], sourceZone: DropRect | null): DropRect | null {
  const zones = layouts.filter((slot) => slot.isNoop).map((slot) => slot.hitZone);
  if (sourceZone) zones.push(sourceZone);
  if (zones.length === 0) return null;
  return {
    top: Math.min(...zones.map((zone) => zone.top)),
    bottom: Math.max(...zones.map((zone) => zone.bottom)),
    left: Math.min(...zones.map((zone) => zone.left)),
    right: Math.max(...zones.map((zone) => zone.right)),
  };
}

function fullBlock(blocks: DropBlockRects, key: string): DropRect | undefined {
  return blocks.subtrees.get(key) ?? blocks.blocks.get(key);
}

function centerY(rect: DropRect): number {
  return (rect.top + rect.bottom) / 2;
}

function slotWins(candidate: DropSlotLayout, current: DropSlotLayout, pointerY: number): boolean {
  return candidate.hitZone.left > current.hitZone.left
    || (candidate.hitZone.left === current.hitZone.left
      && (Math.abs(candidate.top - pointerY) < Math.abs(current.top - pointerY)
        || (Math.abs(candidate.top - pointerY) === Math.abs(current.top - pointerY)
          && candidate.depth > current.depth)));
}

function pointInZone(
  point: { x: number; y: number },
  zone: { top: number; bottom: number; left: number; right: number },
): boolean {
  return point.y >= zone.top && point.y <= zone.bottom && point.x >= zone.left && point.x <= zone.right;
}
