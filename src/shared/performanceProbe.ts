export type AppPerformanceProbeName =
  | "app-shell:render"
  | "app-shell:commit"
  | "notebook:render"
  | "notebook:commit"
  | "notebook:topology-compute"
  | "tree-row:render"
  | "markdown:preview-visible-build-start"
  | "markdown:preview-visible-build-end"
  | "markdown:codemirror-commit"
  | "markdown:store-commit";

interface AppPerformanceProbe {
  mark(name: AppPerformanceProbeName, timestamp: number, value?: number): void;
}

declare global {
  interface Window {
    __aisijiPerformanceProbe?: AppPerformanceProbe;
  }
}

/** Records opt-in performance test marks without retaining production samples. */
export function markAppPerformance(name: AppPerformanceProbeName, value?: number): void {
  if (typeof window === "undefined") return;
  window.__aisijiPerformanceProbe?.mark(name, performance.now(), value);
}
