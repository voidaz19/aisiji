import { CalendarDays, FileText, Home, Plus, Search, Settings, Trash2 } from "lucide-react";
import type { WorkspaceView } from "../../shared/workspaceView";

interface Props {
  open: boolean;
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onQuickCapture: () => void;
}

export function AppSidebar({ open, view, onNavigate, onQuickCapture }: Props) {
  return (
    <aside className={`sidebar ${open ? "" : "is-closed"}`}>
      <div className="brand">
        <div className="brand-mark">枝</div>
        <div><strong>节点笔记</strong><span>本地优先工作区</span></div>
      </div>
      <button className="capture-button" type="button" onClick={onQuickCapture}>
        <Plus size={17} />快速记录
      </button>
      <nav className="main-nav" aria-label="主导航">
        <NavButton active={view === "home"} icon={<Home size={17} />} label="主页" onClick={() => onNavigate("home")} />
        <NavButton active={view === "today"} icon={<CalendarDays size={17} />} label="今天" onClick={() => onNavigate("today")} />
        <NavButton active={view === "outline"} icon={<FileText size={17} />} label="所有笔记" onClick={() => onNavigate("outline")} />
        <NavButton active={view === "search"} icon={<Search size={17} />} label="搜索" onClick={() => onNavigate("search")} />
        <NavButton active={view === "trash"} icon={<Trash2 size={17} />} label="回收站" onClick={() => onNavigate("trash")} />
      </nav>
      <div className="sidebar-footer">
        <NavButton active={view === "settings"} icon={<Settings size={17} />} label="设置" onClick={() => onNavigate("settings")} />
        <div className="sync-mini"><span className="sync-dot" />本地已保存</div>
      </div>
    </aside>
  );
}

function NavButton({ active, icon, label, onClick }: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return <button className={active ? "active" : ""} type="button" onClick={onClick}>{icon}{label}</button>;
}
