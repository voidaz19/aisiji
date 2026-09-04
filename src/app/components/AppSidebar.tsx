import { CalendarDays, FileText, PenLine, Settings, Trash2 } from "lucide-react";
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
      <button className="brand" type="button" onClick={() => onNavigate("home")} aria-label="回到主页">
        <strong>爱思记</strong>
      </button>
      <div className="today-capture-row">
        <button
          className={`today-button ${view === "today" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("today")}
        >
          <CalendarDays size={17} />今天
        </button>
        <button className="capture-button" type="button" onClick={onQuickCapture}>
          <PenLine size={15} />快速记录
        </button>
      </div>
      <nav className="main-nav" aria-label="主导航">
        <NavButton active={view === "outline"} icon={<FileText size={17} />} label="所有笔记" onClick={() => onNavigate("outline")} />
      </nav>
      <div className="sidebar-footer">
        <NavButton active={view === "trash"} icon={<Trash2 size={17} />} label="回收站" onClick={() => onNavigate("trash")} />
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
