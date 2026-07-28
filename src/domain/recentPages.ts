import { ROOT_ID, type NodeRecord, type NotebookState } from "./model";

export interface RecentPage {
  page: NodeRecord;
  editedAt: number;
}

/** Returns real page identities recorded at edit time, never inferred from edited nodes. */
export function recentPages(
  state: Pick<NotebookState, "nodes" | "recentPageEdits">,
  limit = 8,
): RecentPage[] {
  return Object.entries(state.recentPageEdits)
    .flatMap(([pageId, editedAt]) => {
      const page = state.nodes[pageId];
      return page && !page.deletedAt ? [{ page, editedAt }] : [];
    })
    .sort((a, b) => b.editedAt - a.editedAt)
    .slice(0, limit);
}

export function recentPageTitle(page: NodeRecord): string {
  if (page.id === ROOT_ID) return "所有笔记";
  if (page.kind === "date") return page.dateKey ?? page.markdown;
  return page.markdown.trim() || "未命名页面";
}

export function contentNodesChanged(
  before: Pick<NotebookState, "nodes">,
  after: Pick<NotebookState, "nodes">,
): boolean {
  const ids = new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)]);
  for (const id of ids) {
    const previous = before.nodes[id];
    const next = after.nodes[id];
    if (previous?.kind !== "content" && next?.kind !== "content") continue;
    if (!previous || !next || previous.revision !== next.revision) return true;
  }
  return false;
}
