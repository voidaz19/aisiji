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
import { markAppPerformance } from "../shared/performanceProbe";
import { isNotebookView, type WorkspaceView } from "../shared/workspaceView";
import { flushWorkspacePersistence } from "../platform/workspaceRepository";
import { useNotebookStore } from "../store/useNotebookStore";
import { hasSupertag, CANVAS_SUPERTAG_ID } from "../domain/supertags";
import { DEFAULT_LAYOUT_DEBUG_VISIBILITY, type LayoutDebugVisibility } from "../features/notebook/LayoutDebugPanel";
import { AppSidebar } from "./components/AppSidebar";
import { TopBar } from "./components/TopBar";
import {
  canNavigate,
  createNavigationHistory,
  navigationTarget,
  recordNavigation,
  sameNavigationLocation,
  type NavigationLocation,
} from "./navigationHistory";

type NotebookPanelComponent = typeof import("../features/notebook/NotebookPanel")["NotebookPanel"];
type CanvasPanelComponent = typeof import("../features/canvas/CanvasPanel")["CanvasPanel"];
type SettingsPanelComponent = typeof import("../features/settings/SettingsPanel")["SettingsPanel"];

let loadedNotebookPanel: NotebookPanelComponent | null = null;
let loadedCanvasPanel: CanvasPanelComponent | null = null;
let loadedSettingsPanel: SettingsPanelComponent | null = null;
let notebookPanelPromise: ReturnType<typeof importNotebookPanel> | null = null;
let canvasPanelPromise: ReturnType<typeof importCanvasPanel> | null = null;
let settingsPanelPromise: ReturnType<typeof importSettingsPanel> | null = null;

function importNotebookPanel() {
  return import("../features/notebook/NotebookPanel").then((module) => {
    loadedNotebookPanel = module.NotebookPanel;
    return module.NotebookPanel;
  });
}

function importCanvasPanel() {
  return import("../features/canvas/CanvasPanel").then((module) => {
    loadedCanvasPanel = module.CanvasPanel;
    return module.CanvasPanel;
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

function loadNotebookPanels() {
  canvasPanelPromise ??= importCanvasPanel();
  return Promise.all([loadNotebookPanel(), canvasPanelPromise]);
}

function loadSettingsPanel() {
  settingsPanelPromise ??= importSettingsPanel();
  return settingsPanelPromise;
}

function isViewReady(view: WorkspaceView): boolean {
  if (view === "home") return true;
  if (view === "settings") return loadedSettingsPanel !== null;
  return loadedNotebookPanel !== null && loadedCanvasPanel !== null;
}

function prepareView(view: WorkspaceView): Promise<unknown> {
  if (view === "settings") return loadSettingsPanel();
  if (view !== "home") return loadNotebookPanels();
  return Promise.resolve();
}
export function AppShell() {
  markAppPerformance("app-shell:render");
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
  const [layoutDebug, setLayoutDebug] = useState(() => typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("layout-debug"));
  const [layoutDebugVisibility, setLayoutDebugVisibility] = useState<LayoutDebugVisibility>(DEFAULT_LAYOUT_DEBUG_VISIBILITY);
  const [view, setView] = useState<WorkspaceView>("home");
  const [notebookView, setNotebookView] = useState<WorkspaceView>("today");
  const [notebookRootId, setNotebookRootId] = useState(ROOT_ID);
  const [navigationHistory, setNavigationHistory] = useState(
    () => createNavigationHistory({ view: "home", rootId: ROOT_ID }),
  );
  const [, setLoadedPanelsVersion] = useState(0);
  const navigationRequest = useRef(0);
  const navigationHistoryRef = useRef(navigationHistory);
  const restoringLocation = useRef<NavigationLocation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 720,
  );

  useEffect(() => { void hydrate(); }, [hydrate]);
  useLayoutEffect(() => { markAppPerformance("app-shell:commit"); });
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
      void Promise.all([loadNotebookPanels(), loadSettingsPanel()]).then(() => {
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
  useLayoutEffect(() => {
    const location = { view, rootId: activeRootId };
    if (restoringLocation.current && sameNavigationLocation(restoringLocation.current, location)) {
      restoringLocation.current = null;
      return;
    }
    const nextHistory = recordNavigation(navigationHistoryRef.current, location);
    if (nextHistory === navigationHistoryRef.current) return;
    navigationHistoryRef.current = nextHistory;
    setNavigationHistory(nextHistory);
  }, [activeRootId, view]);

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
  const restoreNavigationLocation = (location: NavigationLocation) => {
    const requestId = ++navigationRequest.current;
    const applyNavigation = () => {
      if (requestId !== navigationRequest.current) return;
      setView(location.view);
      if (isNotebookView(location.view)) {
        const fallbackRootId = location.view === "today"
          ? (todayNode?.id ?? ensureTodayNode())
          : ROOT_ID;
        const nextRootId = location.rootId === ROOT_ID || nodes[location.rootId]
          ? location.rootId
          : fallbackRootId;
        openRoot(nextRootId);
        setNotebookView(location.view);
        setNotebookRootId(nextRootId);
      } else {
        goToRoot();
      }
    };
    if (isViewReady(location.view)) {
      applyNavigation();
      return;
    }
    void prepareView(location.view).then(() => flushSync(applyNavigation));
  };
  const moveInNavigationHistory = (offset: -1 | 1) => {
    const target = navigationTarget(navigationHistoryRef.current, offset);
    if (!target) return;
    navigationHistoryRef.current = target.history;
    restoringLocation.current = target.location;
    setNavigationHistory(target.history);
    restoreNavigationLocation(target.location);
  };
  useEffect(() => {
    const handleNavigationShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      moveInNavigationHistory(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", handleNavigationShortcut);
    return () => window.removeEventListener("keydown", handleNavigationShortcut);
  });
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
    void loadNotebookPanels().then(() => flushSync(applyCapture));
  };

  const NotebookPanel = loadedNotebookPanel;
  const CanvasPanel = loadedCanvasPanel;
  const SettingsPanel = loadedSettingsPanel;
  const notebookIsVisible = view !== "home" && view !== "settings";
  useLayoutEffect(() => {
    if (notebookIsVisible && activeRootId !== notebookRootId) {
      setNotebookRootId(activeRootId);
    }
  }, [activeRootId, notebookIsVisible, notebookRootId]);
  const notebookActiveRoot = nodes[notebookRootId] ?? null;
  const activeRootIsCanvas = notebookIsVisible
    && notebookView !== "search"
    && notebookView !== "trash"
    && notebookActiveRoot?.kind === "content"
    && hasSupertag({ nodes }, notebookActiveRoot.id, CANVAS_SUPERTAG_ID);
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
          canGoBack={canNavigate(navigationHistory, -1)}
          canGoForward={canNavigate(navigationHistory, 1)}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onGoBack={() => moveInNavigationHistory(-1)}
          onGoForward={() => moveInNavigationHistory(1)}
          onNavigate={navigate}
          onOpenRoot={openRoot}
          onOpenViewRoot={openViewRoot}
        />
        {view === "home" ? <DashboardPanel onNavigate={navigate} todayNode={todayNode} /> : null}
        {view === "settings" && SettingsPanel ? (
          <SettingsPanel
            layoutDebug={layoutDebug}
            layoutDebugVisibility={layoutDebugVisibility}
            onLayoutDebugChange={setLayoutDebug}
            onLayoutDebugVisibilityChange={setLayoutDebugVisibility}
          />
        ) : null}
        {activeRootIsCanvas && notebookActiveRoot && CanvasPanel ? <CanvasPanel root={notebookActiveRoot} /> : null}
        {NotebookPanel ? (
          <div className="notebook-host" hidden={!notebookIsVisible || activeRootIsCanvas} aria-hidden={!notebookIsVisible || activeRootIsCanvas}>
            <NotebookPanel
              view={notebookView}
              activeRoot={notebookActiveRoot}
              rootId={notebookRootId}
              visibleNodes={notebookVisible}
              layoutDebug={layoutDebug}
              layoutDebugVisibility={layoutDebugVisibility}
              onLayoutDebugVisibilityChange={setLayoutDebugVisibility}
              isVisible={notebookIsVisible}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
