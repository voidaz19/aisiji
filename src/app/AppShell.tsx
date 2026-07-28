import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { flushWorkspacePersistence } from "../platform/workspaceRepository";
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
  const nodes = useNotebookStore((state) => state.nodes);
  const collapsed = useNotebookStore((state) => state.collapsed);
  const query = useNotebookStore((state) => state.query);
  const activeRootId = useNotebookStore((state) => state.activeRootId);
  const hydrate = useNotebookStore((state) => state.hydrate);
  const openRoot = useNotebookStore((state) => state.openRoot);
  const goToRoot = useNotebookStore((state) => state.goToRoot);
  const ensureTodayNode = useNotebookStore((state) => state.ensureTodayNode);
  const createChild = useNotebookStore((state) => state.createChild);
  const focusNode = useNotebookStore((state) => state.focusNode);
  const layoutDebug = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("layout-debug");
  const [view, setView] = useState<WorkspaceView>("home");
  const [notebookView, setNotebookView] = useState<WorkspaceView>("today");
  const [notebookRootId, setNotebookRootId] = useState(ROOT_ID);
  const [, setLoadedPanelsVersion] = useState(0);
  const navigationRequest = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 720,
  );

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushWorkspacePersistence();
    };
    window.addEventListener("beforeunload", flushWorkspacePersistence);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      flushWorkspacePersistence();
      window.removeEventListener("beforeunload", flushWorkspacePersistence);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadNotebookPanel(), loadSettingsPanel()]).then(() => {
        setLoadedPanelsVersion((version) => version + 1);
      });
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  const todayNode = useMemo(
    () => findDateNode({ nodes }, localDateKey()),
    [nodes],
  );
  const activeRoot = nodes[activeRootId] ?? null;
  const currentViewRootId = viewRootId(view, todayNode);
  const breadcrumbs = useMemo(
    () => breadcrumbPath(nodes, activeRoot, currentViewRootId),
    [nodes, activeRoot, currentViewRootId],
  );
  const parentBreadcrumbs = activeRoot ? breadcrumbs.slice(0, -1) : breadcrumbs;
  const navigate = (nextView: WorkspaceView) => {
    const requestId = ++navigationRequest.current;
    const applyNavigation = () => {
      if (requestId !== navigationRequest.current) return;
      setView(nextView);
      if (nextView === "today") {
        const nextRootId = ensureTodayNode();
        openRoot(nextRootId);
        setNotebookView(nextView);
        setNotebookRootId(nextRootId);
      } else if (nextView === "outline" || nextView === "search" || nextView === "trash") {
        goToRoot();
        setNotebookView(nextView);
        setNotebookRootId(ROOT_ID);
      } else {
        goToRoot();
      }
    };
    if (isViewReady(nextView)) {
      applyNavigation();
      return;
    }
    void prepareView(nextView).then(() => flushSync(applyNavigation));
  };
  const openViewRoot = () => {
    if (view === "today") {
      const nextRootId = todayNode?.id ?? ensureTodayNode();
      openRoot(nextRootId);
      setNotebookView(view);
      setNotebookRootId(nextRootId);
    } else {
      goToRoot();
      if (view === "outline" || view === "search" || view === "trash") {
        setNotebookView(view);
        setNotebookRootId(ROOT_ID);
      }
    }
  };
  const quickCapture = () => {
    const requestId = ++navigationRequest.current;
    const applyCapture = () => {
      if (requestId !== navigationRequest.current) return;
      const todayId = ensureTodayNode();
      setView("today");
      const newNodeId = createChild(todayId, "");
      if (!newNodeId) return;
      openRoot(newNodeId);
      focusNode(newNodeId, 0);
      setNotebookView("today");
      setNotebookRootId(newNodeId);
    };
    if (loadedNotebookPanel) {
      applyCapture();
      return;
    }
    void loadNotebookPanel().then(() => flushSync(applyCapture));
  };

  const NotebookPanel = loadedNotebookPanel;
  const SettingsPanel = loadedSettingsPanel;
  const notebookIsVisible = view !== "home" && view !== "settings";
  useLayoutEffect(() => {
    if (notebookIsVisible && activeRootId !== notebookRootId) {
      setNotebookRootId(activeRootId);
    }
  }, [activeRootId, notebookIsVisible, notebookRootId]);
  const notebookActiveRoot = nodes[notebookRootId] ?? null;
  const notebookVisible = useMemo(
    () => visibleNodesForView({ nodes, collapsed }, notebookView, notebookRootId, query),
    [collapsed, nodes, notebookRootId, notebookView, query],
  );

  return (
    <div className={`app-shell ${layoutDebug ? "layout-debug" : ""}`} onContextMenu={(event) => event.preventDefault()}>
      <AppSidebar open={sidebarOpen} view={view} onNavigate={navigate} onQuickCapture={quickCapture} />
      <main className="workspace">
        <TopBar
          view={view}
          activeRoot={activeRoot}
          parentBreadcrumbs={parentBreadcrumbs}
          atViewRoot={activeRootId === ROOT_ID || activeRootId === currentViewRootId}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onNavigate={navigate}
          onOpenRoot={openRoot}
          onOpenViewRoot={openViewRoot}
        />
        {view === "home" ? <DashboardPanel onNavigate={navigate} todayNode={todayNode} /> : null}
        {view === "settings" && SettingsPanel ? <SettingsPanel /> : null}
        {NotebookPanel ? (
          <div className="notebook-host" hidden={!notebookIsVisible} aria-hidden={!notebookIsVisible}>
            <NotebookPanel
              view={notebookView}
              activeRoot={notebookActiveRoot}
              rootId={notebookRootId}
              visibleNodes={notebookVisible}
              layoutDebug={layoutDebug}
              isVisible={notebookIsVisible}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
