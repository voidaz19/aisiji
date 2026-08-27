export type AppPerformanceProbeName =
  | "app-shell:render"
  | "app-shell:commit"
  | "notebook:render"
  | "notebook:commit"
  | "notebook:topology-compute"
  | "tree-row:render"
  | "markdown:codemirror-commit"
  | "markdown:store-commit";

interface AppPerformanceProbe {
  mark(name: AppPerformanceProbeName, timestamp: number): void;
}

declare global {
  interface Window {
    __aisijiPerformanceProbe?: AppPerformanceProbe;
  }
}

/** Records opt-in performance test marks without retaining production samples. */
export function markAppPerformance(name: AppPerformanceProbeName): void {
  if (typeof window === "undefined") return;
  window.__aisijiPerformanceProbe?.mark(name, performance.now());
}
