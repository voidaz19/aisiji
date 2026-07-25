export type WorkspaceView = "home" | "today" | "outline" | "search" | "trash" | "settings";

export const VIEW_LABELS: Record<WorkspaceView, string> = {
  home: "主页",
  today: "今天",
  outline: "所有笔记",
  search: "搜索",
  trash: "回收站",
  settings: "设置",
};

export function isNotebookView(view: WorkspaceView): boolean {
  return view !== "home" && view !== "settings";
}
