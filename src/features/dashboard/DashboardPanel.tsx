import { CalendarDays, Clock, FileText, Search } from "lucide-react";
import type { NodeRecord } from "../../domain/model";
import { relativeTimeLabel } from "../../shared/date";
import type { WorkspaceView } from "../../shared/workspaceView";
import { useNotebookStore } from "../../store/useNotebookStore";

interface Props {
  onNavigate: (view: WorkspaceView) => void;
  todayNode?: NodeRecord;
}

export function DashboardPanel({ onNavigate, todayNode }: Props) {
  const nodes = useNotebookStore((state) => state.nodes);
  const openRoot = useNotebookStore((state) => state.openRoot);
  const todayCount = todayNode
    ? Object.values(nodes).filter((node) => node.parentId === todayNode.id && !node.deletedAt).length
    : 0;
  const recentNodes = Object.values(nodes)
    .filter((node) => node.kind === "content" && !node.deletedAt && node.markdown.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
  const totalNodes = Object.values(nodes).filter(
    (node) => node.kind === "content" && !node.deletedAt,
  ).length;

  return (
    <div className="dashboard">
      <section className="content-header">
        <div><p className="eyebrow">工作区概览</p><h1>主页</h1></div>
      </section>
      <div className="dashboard-cards">
        <button className="dash-card dash-card--today" type="button" onClick={() => onNavigate("today")}>
          <div className="dash-card-icon"><CalendarDays size={20} /></div>
          <div className="dash-card-body">
            <div className="dash-card-label">今天</div>
            <div className="dash-card-value">
              {new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}
            </div>
            <div className="dash-card-sub">{todayCount > 0 ? `${todayCount} 条笔记` : "尚无记录"}</div>
          </div>
        </button>
        <button className="dash-card" type="button" onClick={() => onNavigate("outline")}>
          <div className="dash-card-icon"><FileText size={20} /></div>
          <div className="dash-card-body"><div className="dash-card-label">所有笔记</div><div className="dash-card-value">{totalNodes}</div><div className="dash-card-sub">个节点</div></div>
        </button>
        <button className="dash-card" type="button" onClick={() => onNavigate("search")}>
          <div className="dash-card-icon"><Search size={20} /></div>
          <div className="dash-card-body"><div className="dash-card-label">搜索</div><div className="dash-card-value dash-card-value--sm">全文检索</div><div className="dash-card-sub">查找任意节点</div></div>
        </button>
      </div>
      <section className="dash-section">
        <h2 className="dash-section-title"><Clock size={15} />最近编辑</h2>
        {recentNodes.length === 0 ? <p className="dash-empty">还没有任何内容节点。</p> : (
          <ul className="dash-recent">
            {recentNodes.map((node) => (
              <li key={node.id}>
                <button type="button" className="dash-recent-item" onClick={() => { onNavigate("outline"); openRoot(node.id); }}>
                  <span className="dash-recent-text">{node.markdown.trim() || "未命名节点"}</span>
                  <span className="dash-recent-time">{relativeTimeLabel(node.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
