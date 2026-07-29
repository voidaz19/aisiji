import type { WorkspaceView } from "../shared/workspaceView";

export interface NavigationLocation {
  view: WorkspaceView;
  rootId: string;
}

export interface NavigationHistory {
  entries: NavigationLocation[];
  index: number;
}

export function createNavigationHistory(initial: NavigationLocation): NavigationHistory {
  return { entries: [initial], index: 0 };
}

export function sameNavigationLocation(left: NavigationLocation, right: NavigationLocation): boolean {
  return left.view === right.view && left.rootId === right.rootId;
}

export function recordNavigation(
  history: NavigationHistory,
  location: NavigationLocation,
): NavigationHistory {
  if (sameNavigationLocation(history.entries[history.index], location)) return history;
  return {
    entries: [...history.entries.slice(0, history.index + 1), location],
    index: history.index + 1,
  };
}

export function navigationTarget(
  history: NavigationHistory,
  offset: -1 | 1,
): { history: NavigationHistory; location: NavigationLocation } | null {
  const index = history.index + offset;
  const location = history.entries[index];
  if (!location) return null;
  return { history: { ...history, index }, location };
}

export function canNavigate(history: NavigationHistory, offset: -1 | 1): boolean {
  const index = history.index + offset;
  return index >= 0 && index < history.entries.length;
}
