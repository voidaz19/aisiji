export const TREE_LAYOUT_ANIMATION_DURATION = 100;
export const TREE_LAYOUT_ANIMATION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

const X1 = 0.4;
const Y1 = 0;
const X2 = 0.2;
const Y2 = 1;

function cubicCoordinate(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

/** Matches the CSS easing used by row FLIP animations. */
export function treeLayoutMotionProgress(linearProgress: number): number {
  const x = Math.min(1, Math.max(0, linearProgress));
  let lower = 0;
  let upper = 1;
  let t = x;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const estimate = cubicCoordinate(t, X1, X2);
    if (estimate < x) lower = t;
    else upper = t;
    t = (lower + upper) / 2;
  }
  return cubicCoordinate(t, Y1, Y2);
}
