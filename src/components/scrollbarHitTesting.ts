const SCROLLBAR_HIT_SIZE = 12;

function isScrollbarPointerOnElement(element: HTMLElement, clientX: number, clientY: number): boolean {
  if (element.clientWidth <= 0 || element.clientHeight <= 0) return false;
  const rect = element.getBoundingClientRect();
  const hasVerticalScrollbar = element.scrollHeight > element.clientHeight;
  const hasHorizontalScrollbar = element.scrollWidth > element.clientWidth;
  const verticalScrollbarStart = element.clientWidth < element.offsetWidth
    ? rect.left + element.clientWidth
    : rect.right - SCROLLBAR_HIT_SIZE;
  const horizontalScrollbarStart = element.clientHeight < element.offsetHeight
    ? rect.top + element.clientHeight
    : rect.bottom - SCROLLBAR_HIT_SIZE;
  return (hasVerticalScrollbar && clientX >= verticalScrollbarStart && clientX <= rect.right)
    || (hasHorizontalScrollbar && clientY >= horizontalScrollbarStart && clientY <= rect.bottom);
}

export function isScrollbarPointer(
  target: EventTarget | null,
  boundary: HTMLElement | null,
  clientX: number,
  clientY: number,
): boolean {
  if (!boundary) return false;
  if (!(target instanceof HTMLElement)) return isScrollbarPointerOnElement(boundary, clientX, clientY);
  let current: HTMLElement | null = target;
  while (current) {
    if (isScrollbarPointerOnElement(current, clientX, clientY)) return true;
    if (current === boundary) break;
    current = current.parentElement;
  }
  return false;
}
