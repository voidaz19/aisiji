export type MetricUnit = "ms" | "ratio" | "count" | "bytes";

export interface PerformanceBudget {
  unit: MetricUnit;
  maximum: number;
  scalable?: boolean;
}

const configuredScale = Number.parseFloat(process.env.PERF_BUDGET_SCALE ?? "1");
export const performanceBudgetScale = Number.isFinite(configuredScale) && configuredScale > 0
  ? configuredScale
  : 1;

export const domainBudgets = {
  visibleTree1kP95: { unit: "ms", maximum: 5 },
  visibleTree10kP95: { unit: "ms", maximum: 50 },
  search10kP95: { unit: "ms", maximum: 20 },
  layoutRows1kP95: { unit: "ms", maximum: 5 },
} satisfies Record<string, PerformanceBudget>;

export const browserBudgets = {
  startupReady: { unit: "ms", maximum: 2_500 },
  outlineOpen: { unit: "ms", maximum: 800 },
  outlineLongTasks: { unit: "ms", maximum: 500 },
  expand1k: { unit: "ms", maximum: 900 },
  expandSlowFrameRatio: { unit: "ratio", maximum: 0.25 },
  expandedDomRows: { unit: "count", maximum: 80, scalable: false },
  markdownInputP95: { unit: "ms", maximum: 200 },
  markdownInputLongTasks: { unit: "ms", maximum: 400 },
  markdownPreviewBuildP95: { unit: "ms", maximum: 34 },
  markdownPreviewScannedCharactersP95: { unit: "count", maximum: 65_536, scalable: false },
  combinedMarkdownInputP95: { unit: "ms", maximum: 200 },
  combinedWorkspaceSerializeP95: { unit: "ms", maximum: 25 },
  combinedStorageWriteP95: { unit: "ms", maximum: 25 },
  combinedPersistenceP95: { unit: "ms", maximum: 40 },
  combinedInputLongTaskP95: { unit: "ms", maximum: 120 },
  combinedInputLongTaskCount: { unit: "count", maximum: 30 },
  nodeSwitchP95: { unit: "ms", maximum: 400 },
  nodeSwitchHeapGrowth: { unit: "bytes", maximum: 10 * 1024 * 1024 },
  dragComplete: { unit: "ms", maximum: 1_000 },
  dragSlowFrameRatio: { unit: "ratio", maximum: 0.3 },
  dragVirtualizedDomRows: { unit: "count", maximum: 100, scalable: false },
} satisfies Record<string, PerformanceBudget>;

export function scaledMaximum(budget: PerformanceBudget): number {
  return budget.scalable === false
    ? budget.maximum
    : budget.maximum * performanceBudgetScale;
}
