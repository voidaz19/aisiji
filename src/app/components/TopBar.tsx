import { Fragment } from "react";
import { ArrowLeft, ArrowRight, Cloud, PanelLeft, Settings } from "lucide-react";
import type { NodeRecord } from "../../domain/model";
import { dateLabel } from "../../shared/date";
import { VIEW_LABELS, type WorkspaceView } from "../../shared/workspaceView";
import { WindowControls } from "./WindowControls";

interface Props {
  view: WorkspaceView;
  activeRoot: NodeRecord | null;
  parentBreadcrumbs: NodeRecord[];
  atViewRoot: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onToggleSidebar: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
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
  canGoBack,
  canGoForward,
  onToggleSidebar,
  onGoBack,
  onGoForward,
  onNavigate,
  onOpenRoot,
  onOpenViewRoot,
}: Props) {
  const collapsedBreadcrumbs = parentBreadcrumbs.slice(0, -2);
  const visibleBreadcrumbs = parentBreadcrumbs.slice(-2);
  const collapsedTarget = collapsedBreadcrumbs[collapsedBreadcrumbs.length - 1];

  return (
    <header className="topbar" data-tauri-drag-region>
      <button className="icon-button" type="button" onClick={onToggleSidebar} aria-label="切换侧栏">
        <PanelLeft size={18} />
      </button>
      <div className="navigation-controls" aria-label="页面导航">
        <button className="icon-button" type="button" onClick={onGoBack} disabled={!canGoBack} aria-label="后退" title="后退 (Alt+左方向键)">
          <ArrowLeft size={17} />
        </button>
        <button className="icon-button" type="button" onClick={onGoForward} disabled={!canGoForward} aria-label="前进" title="前进 (Alt+右方向键)">
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="breadcrumbs">
        {view === "home" ? <span className="breadcrumb-current">主页</span> : (
          <>
            <button type="button" onClick={() => onNavigate("home")}>主页</button>
            <span>/</span>
            {atViewRoot ? <span className="breadcrumb-current">{VIEW_LABELS[view]}</span> : (
              <>
                <button type="button" onClick={onOpenViewRoot}>{VIEW_LABELS[view]}</button>
                {collapsedTarget ? (
                  <>
                    <span>/</span>
                    <button
                      className="breadcrumb-overflow"
                      type="button"
                      title={collapsedBreadcrumbs.map(nodeLabel).join(" / ")}
                      aria-label={`打开上级节点：${nodeLabel(collapsedTarget)}`}
                      onClick={() => onOpenRoot(collapsedTarget.id)}
                    >
                      …
                    </button>
                  </>
                ) : null}
                {visibleBreadcrumbs.map((node) => (
                  <Fragment key={node.id}>
                    <span>/</span>
                    <button
                      className="breadcrumb-node"
                      type="button"
                      title={nodeLabel(node)}
                      onClick={() => onOpenRoot(node.id)}
                    >
                      {nodeLabel(node)}
                    </button>
                  </Fragment>
                ))}
                <span>/</span>
                <span className="breadcrumb-current" title={activeRoot ? nodeLabel(activeRoot) : undefined}>
                  {activeRoot ? nodeLabel(activeRoot) : ""}
                </span>
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
