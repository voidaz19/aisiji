import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Search, Settings, Trash2, Cloud, Plus, PanelLeft, FileText, CalendarDays, SlidersHorizontal, Home, Clock, Minus, Square, Copy, X } from "lucide-react";
import { visibleNodes } from "./domain/tree";
import { GhostRow, TreeRow } from "./components/TreeRow";
import { localDateKey, useNotebookStore } from "./store/useNotebookStore";
import { ROOT_ID, type NodeRecord } from "./domain/model";
import "./App.css";

type View = "home" | "today" | "outline" | "search" | "trash" | "settings";
interface GuideLine { id: string; x: number; y1: number; y2: number; }
const GUIDE_GAP = 8;
const GUIDE_OBJECT_HEIGHT = 24;

interface MeasuredRect { top: number; right: number; bottom: number; left: number; }

function unionRects(rects: MeasuredRect[]): MeasuredRect | null {
  if (!rects.length) return null;
  return {
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
    left: Math.min(...rects.map((rect) => rect.left)),
  };
}

function visualObjectRect(row: HTMLElement): { dot: DOMRect; object: MeasuredRect } | null {
  const dot = row.querySelector<HTMLElement>(".node-bullet .node-dot")?.getBoundingClientRect();
  if (!dot) return null;
  const rects: MeasuredRect[] = [{ top: dot.top, right: dot.right, bottom: dot.bottom, left: dot.left }];
  const content = row.querySelector<HTMLElement>(".node-content");
  const visualContent = content?.querySelector<HTMLElement>(".inline-editor");
  if (visualContent) {
    const textWalker = document.createTreeWalker(visualContent, NodeFilter.SHOW_TEXT);
    let textNode: Node | null;
    while ((textNode = textWalker.nextNode())) {
      if (!textNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      for (const rangeRect of Array.from(range.getClientRects())) {
        if (rangeRect.width > 0 && rangeRect.height > 0) {
          rects.push({ top: rangeRect.top, right: rangeRect.right, bottom: rangeRect.bottom, left: rangeRect.left });
        }
      }
      range.detach();
    }
    for (const media of Array.from(visualContent.querySelectorAll<HTMLElement>("img, input, .attachment-chip, .attachment-image"))) {
      const mediaRect = media.getBoundingClientRect();
      if (mediaRect.width > 0 && mediaRect.height > 0) {
        rects.push({ top: mediaRect.top, right: mediaRect.right, bottom: mediaRect.bottom, left: mediaRect.left });
      }
    }
    if (rects.length === 1) {
      const fallback = visualContent.querySelector<HTMLElement>(".cm-line")?.getBoundingClientRect() ?? visualContent.getBoundingClientRect();
      if (fallback.width > 0 && fallback.height > 0) {
        rects.push({ top: fallback.top, right: fallback.right, bottom: fallback.bottom, left: fallback.left });
      }
    }
  }
  const visualBounds = unionRects(rects);
  if (!visualBounds) return null;

  // Every row participates in the guide with the same connection band. This
  // keeps text nodes, date nodes, and ghost nodes from producing different
  // endpoint spacing; genuinely multi-line content can still expand it.
  const rowBox = row.getBoundingClientRect();
  const height = Math.max(GUIDE_OBJECT_HEIGHT, visualBounds.bottom - visualBounds.top);
  const center = (rowBox.top + rowBox.bottom) / 2;
  const object: MeasuredRect = {
    top: center - height / 2,
    right: visualBounds.right,
    bottom: center + height / 2,
    left: visualBounds.left,
  };
  return { dot, object };
}

function dateLabel(value: string | null): string {
  if (!value) return "所有笔记";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

function nodeLabel(node: NodeRecord): string {
  return node.kind === "date" ? dateLabel(node.dateKey) : node.markdown.trim() || "未命名节点";
}

function App() {
  const store = useNotebookStore();
  useEffect(() => { void store.hydrate(); }, [store.hydrate]);
  const [view, setView] = useState<View>("home");
  // 切换顶级视图的唯一入口：除了“今天”会自动定位到日期节点，其余视图都重置到全局根，
  // 避免残留的 activeRootId 污染新视图的面包屑/树内容。
  const navigate = (next: View) => {
    setView(next);
    if (next === "today") store.openRoot(store.ensureTodayNode());
    else store.goToRoot();
  };
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 720);
  const [dragId, setDragId] = useState<string | null>(null);
  const treeListRef = useRef<HTMLDivElement>(null);
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);
  const today = localDateKey();
  // activeRoot 直接从 store 读，不做任何 render 层补丁
  const activeRoot = store.nodes[store.activeRootId] ?? null;
  const rootId = activeRoot?.id ?? ROOT_ID;
  // viewRootId：当前视图的「根停止点」——今天视图是 todayNode.id，其余是 ROOT_ID
  const todayNode = Object.values(store.nodes).find((node) => node.kind === "date" && node.dateKey === today && !node.deletedAt);
  const viewRootId = view === "today" ? (todayNode?.id ?? ROOT_ID) : ROOT_ID;
  const breadcrumbPath = useMemo(() => {
    const path: NodeRecord[] = [];
    const visited = new Set<string>();
    let current: NodeRecord | null | undefined = activeRoot;
    while (current && current.id !== ROOT_ID && current.id !== viewRootId && !visited.has(current.id)) {
      path.unshift(current);
      visited.add(current.id);
      const pid: string | null = current.parentId;
      current = (pid && pid !== ROOT_ID && pid !== viewRootId) ? store.nodes[pid] : undefined;
    }
    return path;
  }, [activeRoot, store.nodes, viewRootId]);
  const parentBreadcrumbs = activeRoot ? breadcrumbPath.slice(0, -1) : breadcrumbPath;
  const viewLabels: Record<View, string> = { home: "主页", today: "今天", outline: "所有笔记", search: "搜索", trash: "回收站", settings: "设置" };
  const viewLabel = viewLabels[view];
  // 在视图根：activeRootId 等于当前视图的根停止点
  const isAtViewRoot = store.activeRootId === ROOT_ID || store.activeRootId === viewRootId;
  const visible = useMemo(() => {
    if (view === "trash") return Object.values(store.nodes).filter((node) => node.deletedAt);
    if (view === "search" && store.query.trim()) return Object.values(store.nodes).filter((node) => !node.deletedAt && node.markdown.toLowerCase().includes(store.query.toLowerCase()));
    const nodes = visibleNodes(store, rootId, store.collapsed);
    // 所有笔记视图在根层级时，过滤掉没有内容子节点的空日期节点
    // 日期节点是导航容器，用户没写过笔记时不应出现在列表里
    if (view === "outline" && rootId === ROOT_ID) {
      const emptyDateIds = new Set(
        Object.values(store.nodes)
          .filter((n) => n.kind === "date" && !n.deletedAt &&
            !Object.values(store.nodes).some((c) => c.parentId === n.id && !c.deletedAt))
          .map((n) => n.id)
      );
      return nodes.filter((n) => !emptyDateIds.has(n.id));
    }
    return nodes;
  }, [store.nodes, store.collapsed, store.query, view, rootId]);
  // The trailing ghost at the end of the list always adds a direct child
  // of the current root (global root when rootId is null, or the zoomed-in
  // node otherwise) -- never a nested child of whatever the last visible
  // row happens to be. Each TreeRow already renders its own nested ghost
  // when it's expanded and empty; deriving this one from "the last visible
  // node" made it flip-flop between nesting into that row's container and
  // falling back to the root depending on collapse state, which is neither
  // predictable nor what "add to the root" should mean.
  const trailingGhost = { parentId: rootId, depth: 0 };
  useLayoutEffect(() => {
    const container = treeListRef.current;
    if (!container || (view !== "today" && view !== "outline")) {
      setGuideLines([]);
      return;
    }
    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-tree-row='true']"));
      const entries = rows.map((row) => {
        const measured = visualObjectRect(row);
        return {
          row,
          depth: Number(row.dataset.depth ?? 0),
          ghost: row.dataset.ghostRow === "true",
          measured,
        };
      });
      const lines: GuideLine[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry.ghost || !entry.measured) continue;
        const firstChild = entries[index + 1];
        if (!firstChild || firstChild.depth <= entry.depth) continue;

        // A guide belongs to the expanded branch. Stop sibling lookup at the
        // first ancestor row so a child branch cannot borrow a later sibling
        // from outside its parent subtree.
        let lastDescendant = index + 1;
        let nextSibling: typeof entries[number] | undefined;
        for (let cursor = index + 1; cursor < entries.length; cursor += 1) {
          const candidate = entries[cursor];
          if (candidate.depth < entry.depth) break;
          if (candidate.depth === entry.depth) {
            nextSibling = candidate;
            break;
          }
          lastDescendant = cursor;
        }
        const endObject = nextSibling?.measured?.object ?? entries[lastDescendant]?.measured?.object;
        if (!endObject) continue;
        const y1 = entry.measured.object.bottom - containerRect.top + GUIDE_GAP;
        const y2 = nextSibling
          ? endObject.top - containerRect.top - GUIDE_GAP
          : endObject.bottom - containerRect.top + GUIDE_GAP;
        if (y2 <= y1) continue;
        const x = entry.measured.dot.left + entry.measured.dot.width / 2 - containerRect.left;
        lines.push({ id: entry.row.dataset.nodeId ?? `line-${index}`, x, y1, y2 });
      }
      setGuideLines(lines);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [store.activeNodeId, store.collapsed, store.nodes, view, visible, rootId]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 6 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    setDragId(null);
    const { active, over, delta } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith("ghost:child:")) {
      store.moveLastChild(activeId, overId.slice("ghost:child:".length));
      return;
    }
    if (overId.startsWith("ghost:root:")) {
      const parentId = overId.slice("ghost:root:".length);
      store.moveLastChild(activeId, parentId);
      return;
    }
    if (delta.y >= 18) store.moveAfter(activeId, overId);
    else store.moveBefore(activeId, overId);
  };

  const activeFields = activeRoot ? Object.values(store.fields).filter((field) => field.nodeId === activeRoot.id) : [];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "is-closed"}`}>
        <div className="brand"><div className="brand-mark">枝</div><div><strong>节点笔记</strong><span>本地优先工作区</span></div></div>
        <button className="capture-button" type="button" onClick={() => { const todayId = store.ensureTodayNode(); setView("today"); store.openRoot(todayId); store.createChild(todayId, ""); }}><Plus size={17} />快速记录</button>
        <nav className="main-nav" aria-label="主导航">
          <button className={view === "home" ? "active" : ""} type="button" onClick={() => navigate("home")}><Home size={17} />主页</button>
          <button className={view === "today" ? "active" : ""} type="button" onClick={() => navigate("today")}><CalendarDays size={17} />今天</button>
          <button className={view === "outline" ? "active" : ""} type="button" onClick={() => navigate("outline")}><FileText size={17} />所有笔记</button>
          <button className={view === "search" ? "active" : ""} type="button" onClick={() => navigate("search")}><Search size={17} />搜索</button>
          <button className={view === "trash" ? "active" : ""} type="button" onClick={() => navigate("trash")}><Trash2 size={17} />回收站</button>
        </nav>
        <div className="sidebar-footer">
          <button className={view === "settings" ? "active" : ""} type="button" onClick={() => navigate("settings")}><Settings size={17} />设置</button>
          <div className="sync-mini"><span className="sync-dot" />本地已保存</div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar" data-tauri-drag-region>
          <button className="icon-button" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="切换侧栏"><PanelLeft size={18} /></button>
          <div className="breadcrumbs">
            {view === "home"
              ? <span className="breadcrumb-current">主页</span>
              : <><button type="button" onClick={() => navigate("home")}>主页</button>
                <span>/</span>
                {isAtViewRoot
                  ? <span className="breadcrumb-current">{viewLabel}</span>
                  : <><button type="button" onClick={() => { if (view === "today") store.openRoot(todayNode?.id ?? store.ensureTodayNode()); else store.goToRoot(); }}>{viewLabel}</button>
                    {parentBreadcrumbs.map((node) => <Fragment key={node.id}><span>/</span><button className="breadcrumb-node" type="button" onClick={() => store.openRoot(node.id)}>{nodeLabel(node)}</button></Fragment>)}
                    <span>/</span><span className="breadcrumb-current">{activeRoot ? nodeLabel(activeRoot) : ""}</span>
                  </>
                }
              </>
            }
          </div>
          <div className="topbar-actions">
            <span className="sync-status"><Cloud size={15} />已保存</span>
            <button className="icon-button" type="button" onClick={() => navigate("settings")} aria-label="打开设置"><Settings size={18} /></button>
            <WindowControls />
          </div>
        </header>

        {view === "home" ? <DashboardPanel onNavigate={navigate} todayNode={todayNode} /> : view === "settings" ? <SettingsPanel /> : (
          <div className="content-area">
            <section className="content-header">
              <div>
                <p className="eyebrow">{view === "today" ? "每日记录" : view === "search" ? "全局检索" : view === "trash" ? "误删恢复" : "节点空间"}</p>
                <h1>{view === "search" ? "搜索节点" : view === "trash" ? "回收站" : (activeRoot && activeRoot.id !== ROOT_ID) ? (activeRoot.kind === "date" ? dateLabel(activeRoot.dateKey) : activeRoot.markdown || "未命名节点") : "所有笔记"}</h1>
              </div>
              <div className="header-tools">
                {view === "search" && <div className="search-input"><Search size={16} /><input autoFocus value={store.query} onChange={(event) => store.setQuery(event.target.value)} placeholder="搜索节点内容" /></div>}

              </div>
            </section>

            {activeRoot && view !== "search" && view !== "trash" && activeFields.length > 0 && <div className="field-strip">{activeFields.map((field) => <span key={field.id}><SlidersHorizontal size={13} />{field.key}: {field.value}</span>)}</div>}

            <DndContext sensors={sensors} onDragStart={(event) => setDragId(String(event.active.id))} onDragCancel={() => setDragId(null)} onDragEnd={onDragEnd}>
              <div ref={treeListRef} className="tree-list" role="tree" aria-label="节点树">
                <svg className="hierarchy-overlay" aria-label="层级线操作" role="group">
                  {guideLines.map((line) => { const path = `M ${line.x} ${line.y1} V ${line.y2}`; return <g key={line.id} className="hierarchy-line-group"><path className="hierarchy-line-hit" d={path} stroke="transparent" strokeWidth={10} onClick={() => store.toggleChildren(line.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); store.toggleChildren(line.id); } }} tabIndex={0} role="button" aria-label="折叠或展开下一级节点" /><path className="hierarchy-line" d={path} aria-hidden="true" /></g>; })}
                </svg>
                {visible.length === 0 && view === "trash" && <EmptyState />}
                {visible.map((node) => <TreeRow key={node.id} node={node as typeof node & { depth?: number }} />)}
                {(view === "today" || view === "outline") && <GhostRow droppableId={`ghost:root:${rootId}`} parentId={trailingGhost.parentId} depth={trailingGhost.depth} />}
              </div>
              <DragOverlay>{dragId ? <div className="drag-preview"><GripIcon />{store.nodes[dragId]?.markdown || "未命名节点"}</div> : null}</DragOverlay>
            </DndContext>
          </div>
        )}
      </main>
    </div>
  );
}

function GripIcon() { return <span className="drag-preview-dot">••</span>; }

function EmptyState() {
  return <div className="empty-state"><div className="empty-icon"><Trash2 size={22} /></div><h2>回收站为空</h2><p>删除的内容会在这里保留，方便恢复。</p></div>;
}

function DashboardPanel({ onNavigate, todayNode }: { onNavigate: (v: "today" | "outline" | "search" | "trash" | "settings") => void; todayNode: import("./domain/model").NodeRecord | undefined }) {
  const store = useNotebookStore();

  // 今日笔记数
  const todayCount = todayNode
    ? Object.values(store.nodes).filter((n) => n.parentId === todayNode.id && !n.deletedAt).length
    : 0;

  // 最近编辑：取 updatedAt 最新的 8 条内容节点（排除根和日期节点）
  const recentNodes = Object.values(store.nodes)
    .filter((n) => n.kind === "content" && !n.deletedAt && n.markdown.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  // 总节点数
  const totalNodes = Object.values(store.nodes).filter((n) => n.kind === "content" && !n.deletedAt).length;

  function formatRelTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return `${Math.floor(diff / 86_400_000)} 天前`;
  }

  return (
    <div className="dashboard">
      <section className="content-header">
        <div>
          <p className="eyebrow">工作区概览</p>
          <h1>主页</h1>
        </div>
      </section>

      <div className="dashboard-cards">
        <button className="dash-card dash-card--today" type="button" onClick={() => onNavigate("today")}>
          <div className="dash-card-icon"><CalendarDays size={20} /></div>
          <div className="dash-card-body">
            <div className="dash-card-label">今天</div>
            <div className="dash-card-value">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</div>
            <div className="dash-card-sub">{todayCount > 0 ? `${todayCount} 条笔记` : "尚无记录"}</div>
          </div>
        </button>

        <button className="dash-card" type="button" onClick={() => onNavigate("outline")}>
          <div className="dash-card-icon"><FileText size={20} /></div>
          <div className="dash-card-body">
            <div className="dash-card-label">所有笔记</div>
            <div className="dash-card-value">{totalNodes}</div>
            <div className="dash-card-sub">个节点</div>
          </div>
        </button>

        <button className="dash-card" type="button" onClick={() => onNavigate("search")}>
          <div className="dash-card-icon"><Search size={20} /></div>
          <div className="dash-card-body">
            <div className="dash-card-label">搜索</div>
            <div className="dash-card-value dash-card-value--sm">全文检索</div>
            <div className="dash-card-sub">查找任意节点</div>
          </div>
        </button>
      </div>

      <section className="dash-section">
        <h2 className="dash-section-title"><Clock size={15} />最近编辑</h2>
        {recentNodes.length === 0
          ? <p className="dash-empty">还没有任何内容节点。</p>
          : <ul className="dash-recent">
              {recentNodes.map((node) => (
                <li key={node.id}>
                  <button type="button" className="dash-recent-item" onClick={() => { onNavigate("outline"); store.openRoot(node.id); }}>
                    <span className="dash-recent-text">{node.markdown.trim() || "未命名节点"}</span>
                    <span className="dash-recent-time">{formatRelTime(node.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
        }
      </section>
    </div>
  );
}

function SettingsPanel() {
  const [endpoint, setEndpoint] = useState("https://dav.jianguoyun.com/dav/");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const nativeRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const saveCredentials = async () => {
    setStatus("正在保存...");
    if (nativeRuntime) {
      try { await invoke("save_sync_credentials", { endpoint, username, password }); setStatus("配置已安全保存"); }
      catch { setStatus("保存失败，请检查系统密钥环"); }
    } else setStatus("浏览器预览已保存（桌面版将使用系统密钥环）");
  };
  const testConnection = async () => {
    setTesting(true); setStatus("正在测试 WebDAV...");
    if (!nativeRuntime) { setStatus("请在 Tauri 桌面版测试坚果云连接"); setTesting(false); return; }
    try { const message = await invoke<string>("webdav_probe", { endpoint, username, password }); setStatus(message); }
    catch (error) { setStatus(String(error)); }
    finally { setTesting(false); }
  };
  return <div className="settings-page"><div className="content-header"><div><p className="eyebrow">工作区配置</p><h1>设置</h1></div></div><section className="settings-section"><div className="section-title"><Cloud size={19} /><div><h2>坚果云同步</h2><p>凭据仅用于本机连接 WebDAV，数据库文件不会直接同步。</p></div></div><label>WebDAV 地址<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label><label>坚果云账号<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="邮箱地址" /></label><label>应用密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="WebDAV 应用密码" /></label><div className="settings-actions"><button className="primary-button" type="button" onClick={() => void saveCredentials()}>保存同步配置</button><button className="subtle-button" type="button" onClick={() => void testConnection()} disabled={testing}>{testing ? "测试中..." : "测试连接"}</button></div>{status && <p className="settings-status">{status}</p>}</section><section className="settings-section"><div className="section-title"><SlidersHorizontal size={19} /><div><h2>编辑偏好</h2><p>日期节点使用设备的固定工作区时区。Markdown 即时渲染保持单编辑区。</p></div></div><div className="setting-row"><span>附件下载</span><span className="setting-value">按需下载，可固定离线</span></div><div className="setting-row"><span>本地历史</span><span className="setting-value">长期保留</span></div></section></div>;
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const nativeTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  useEffect(() => {
    if (!nativeTauri) return;
    const win = getCurrentWindow();
    let cleanup: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win.listen<void>("tauri://resize", () => {
      void win.isMaximized().then(setMaximized);
    }).then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [nativeTauri]);

  if (!nativeTauri) return null;
  const win = getCurrentWindow();
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button type="button" className="wc-btn" onClick={() => void win.minimize()} aria-label="最小化"><Minus size={12} strokeWidth={1.7} /></button>
      <button type="button" className="wc-btn" onClick={() => void win.toggleMaximize()} aria-label={maximized ? "还原" : "最大化"}>
        {maximized ? <Copy size={12} strokeWidth={1.7} /> : <Square size={12} strokeWidth={1.7} />}
      </button>
      <button type="button" className="wc-btn wc-close" onClick={() => void win.close()} aria-label="关闭"><X size={12} strokeWidth={1.7} /></button>
    </div>
  );
}

export default App;
