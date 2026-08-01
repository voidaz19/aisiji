import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { performanceBudgetScale, scaledMaximum, type MetricUnit, type PerformanceBudget } from "./budgets";

export interface RecordedMetric {
  value: number;
  unit: MetricUnit;
  budget?: number;
  passed?: boolean;
}

export interface SampleSummary {
  median: number;
  p95: number;
  minimum: number;
  maximum: number;
  samples: number[];
}

export function summarize(samples: readonly number[]): SampleSummary {
  if (samples.length === 0) throw new Error("Performance samples cannot be empty.");
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    minimum: sorted[0],
    maximum: sorted[sorted.length - 1],
    samples: [...samples],
  };
}

export function metric(value: number, budget: PerformanceBudget): RecordedMetric {
  const maximum = scaledMaximum(budget);
  return {
    value,
    unit: budget.unit,
    budget: maximum,
    passed: value <= maximum,
  };
}

export function writePerformanceResult(
  fileName: string,
  suite: string,
  metrics: Record<string, RecordedMetric>,
): void {
  const resultDirectory = resolve(process.cwd(), "performance-results");
  mkdirSync(resultDirectory, { recursive: true });
  writeFileSync(resolve(resultDirectory, fileName), `${JSON.stringify({
    schemaVersion: 1,
    suite,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: platform(),
      release: release(),
      node: process.version,
      cpu: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      budgetScale: performanceBudgetScale,
    },
    metrics,
  }, null, 2)}\n`);
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
