import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ROOT_ID } from "../domain/model";
import { DashboardPanel } from "../features/dashboard/DashboardPanel";
import {
  breadcrumbPath,
  findDateNode,
  viewRootId,
  visibleNodesForView,
} from "../features/notebook/model/notebookView";
import { localDateKey } from "../shared/date";
import type { WorkspaceView } from "../shared/workspaceView";
import { useNotebookStore } from "../store/useNotebookStore";
import { AppSidebar } from "./components/AppSidebar";
import { TopBar } from "./components/TopBar";

type NotebookPanelComponent = typeof import("../features/notebook/NotebookPanel")["NotebookPanel"];
type SettingsPanelComponent = typeof import("../features/settings/SettingsPanel")["SettingsPanel"];

let loadedNotebookPanel: NotebookPanelComponent | null = null;
let loadedSettingsPanel: SettingsPanelComponent | null = null;
let notebookPanelPromise: ReturnType<typeof importNotebookPanel> | null = null;
let settingsPanelPromise: ReturnType<typeof importSettingsPanel> | null = null;

function importNotebookPanel() {
  return import("../features/notebook/NotebookPanel").then((module) => {
    loadedNotebookPanel = module.NotebookPanel;
    return module.NotebookPanel;
  });
}

function importSettingsPanel() {
  return import("../features/settings/SettingsPanel").then((module) => {
    loadedSettingsPanel = module.SettingsPanel;
    return module.SettingsPanel;
  });
}

function loadNotebookPanel() {
  notebookPanelPromise ??= importNotebookPanel();
  return notebookPanelPromise;
}

function loadSettingsPanel() {
  settingsPanelPromise ??= importSettingsPanel();
  return settingsPanelPromise;
}

function isViewReady(view: WorkspaceView): boolean {
  if (view === "home") return true;
  if (view === "settings") return loadedSettingsPanel !== null;
  return loadedNotebookPanel !== null;
}

function prepareView(view: WorkspaceView): Promise<unknown> {
  if (view === "settings") return loadSettingsPanel();
  if (view !== "home") return loadNotebookPanel();
  return Promise.resolve();
}
export function AppShell() {
  const store = useNotebookStore();
  const [view, setView] = useState<WorkspaceView>("home");
  const navigationRequest = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 720,
  );

  useEffect(() => { void store.hydrate(); }, [store.hydrate]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadNotebookPanel();
      void loadSettingsPanel();
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  const todayNode = useMemo(
    () => findDateNode(store, localDateKey()),
    [store.nodes],
  );
  const activeRoot = store.nodes[store.activeRootId] ?? null;
  const rootId = activeRoot?.id ?? ROOT_ID;
  const currentViewRootId = viewRootId(view, todayNode);
  const breadcrumbs = useMemo(
    () => breadcrumbPath(store.nodes, activeRoot, currentViewRootId),
    [store.nodes, activeRoot, currentViewRootId],
  );
  const parentBreadcrumbs = activeRoot ? breadcrumbs.slice(0, -1) : breadcrumbs;
  const visible = useMemo(
    () => visibleNodesForView(store, view, rootId, store.query),
    [store.nodes, store.collapsed, store.query, view, rootId],
  );

  const navigate = (nextView: WorkspaceView) => {
    const requestId = ++navigationRequest.current;
    const applyNavigation = () => {
      if (requestId !== navigationRequest.current) return;
      setView(nextView);
      if (nextView === "today") store.openRoot(store.ensureTodayNode());
      else store.goToRoot();
    };
    if (isViewReady(nextView)) {
      applyNavigation();
      return;
    }
    void prepareView(nextView).then(() => flushSync(applyNavigation));
  };
  const openViewRoot = () => {
    if (view === "today") store.openRoot(todayNode?.id ?? store.ensureTodayNode());
    else store.goToRoot();
  };
  const quickCapture = () => {
    const requestId = ++navigationRequest.current;
    const applyCapture = () => {
      if (requestId !== navigationRequest.current) return;
      const todayId = store.ensureTodayNode();
      setView("today");
      const newNodeId = store.createChild(todayId, "");
      if (!newNodeId) return;
      store.openRoot(newNodeId);
      store.focusNode(newNodeId, 0);
    };
    if (loadedNotebookPanel) {
      applyCapture();
      return;
    }
    void loadNotebookPanel().then(() => flushSync(applyCapture));
  };

  const NotebookPanel = loadedNotebookPanel;
  const SettingsPanel = loadedSettingsPanel;

  return (
    <div className="app-shell" onContextMenu={(event) => event.preventDefault()}>
      <AppSidebar open={sidebarOpen} view={view} onNavigate={navigate} onQuickCapture={quickCapture} />
      <main className="workspace">
        <TopBar
          view={view}
          activeRoot={activeRoot}
          parentBreadcrumbs={parentBreadcrumbs}
          atViewRoot={store.activeRootId === ROOT_ID || store.activeRootId === currentViewRootId}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onNavigate={navigate}
          onOpenRoot={store.openRoot}
          onOpenViewRoot={openViewRoot}
        />
        {view === "home" ? (
          <DashboardPanel onNavigate={navigate} todayNode={todayNode} />
        ) : view === "settings" && SettingsPanel ? (
          <SettingsPanel />
        ) : view !== "settings" && NotebookPanel ? (
          <NotebookPanel view={view} activeRoot={activeRoot} rootId={rootId} visibleNodes={visible} />
        ) : null}
      </main>
    </div>
  );
}
