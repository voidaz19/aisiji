import { Fragment } from "react";
import { Cloud, PanelLeft, Settings } from "lucide-react";
import type { NodeRecord } from "../../domain/model";
import { dateLabel } from "../../shared/date";
import { VIEW_LABELS, type WorkspaceView } from "../../shared/workspaceView";
import { WindowControls } from "./WindowControls";

interface Props {
  view: WorkspaceView;
  activeRoot: NodeRecord | null;
  parentBreadcrumbs: NodeRecord[];
  atViewRoot: boolean;
  onToggleSidebar: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onOpenRoot: (nodeId: string) => void;
  onOpenViewRoot: () => void;
}

function nodeLabel(node: NodeRecord): string {
  return node.kind === "date" ? dateLabel(node.dateKey) : node.markdown.trim() || "未命名节点";
}

export function TopBar({
  view,
  activeRoot,
  parentBreadcrumbs,
  atViewRoot,
  onToggleSidebar,
  onNavigate,
  onOpenRoot,
  onOpenViewRoot,
}: Props) {
  return (
    <header className="topbar" data-tauri-drag-region>
      <button className="icon-button" type="button" onClick={onToggleSidebar} aria-label="切换侧栏">
        <PanelLeft size={18} />
      </button>
      <div className="breadcrumbs">
        {view === "home" ? <span className="breadcrumb-current">主页</span> : (
          <>
            <button type="button" onClick={() => onNavigate("home")}>主页</button>
            <span>/</span>
            {atViewRoot ? <span className="breadcrumb-current">{VIEW_LABELS[view]}</span> : (
              <>
                <button type="button" onClick={onOpenViewRoot}>{VIEW_LABELS[view]}</button>
                {parentBreadcrumbs.map((node) => (
                  <Fragment key={node.id}>
                    <span>/</span>
                    <button className="breadcrumb-node" type="button" onClick={() => onOpenRoot(node.id)}>
                      {nodeLabel(node)}
                    </button>
                  </Fragment>
                ))}
                <span>/</span>
                <span className="breadcrumb-current">{activeRoot ? nodeLabel(activeRoot) : ""}</span>
              </>
            )}
          </>
        )}
      </div>
      <div className="topbar-actions">
        <span className="sync-status"><Cloud size={15} />已保存</span>
        <button className="icon-button" type="button" onClick={() => onNavigate("settings")} aria-label="打开设置">
          <Settings size={18} />
        </button>
        <WindowControls />
      </div>
    </header>
  );
}
